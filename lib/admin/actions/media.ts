"use server";

import { updateTag } from "next/cache";
import { AuthorizationError, requireStaffAction } from "@/lib/auth/staff";
import { MEDIA_BUCKET } from "@/lib/catalog/mappers";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { isUuid } from "@/lib/catalog/slug";
import { validateMediaUpload } from "@/lib/media/validate";
import { createSessionClient } from "@/lib/supabase/server";
import { mediaMetaSchema } from "@/lib/validation/product";
import { friendlyDbError } from "../errors";
import type { ActionResult } from "../types";
import { removeOrphanFiles } from "../storage";

async function guard(): Promise<{ ok: false; error: string } | null> {
  try {
    await requireStaffAction();
    return null;
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Sem permissão." };
  }
}

/**
 * Upload validado no servidor: tipo pelo conteúdo, extensão coerente, tamanho,
 * dimensões. O nome do arquivo do usuário nunca vira caminho: usamos UUID.
 * O original é preservado como enviado; tamanhos derivados são gerados pelo
 * otimizador de imagens na entrega.
 */
export async function uploadMediaAction(productId: string, formData: FormData): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(productId)) return { ok: false, error: "Produto inválido." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Escolha um arquivo." };

  const meta = mediaMetaSchema.safeParse({
    altText: String(formData.get("altText") ?? ""),
    isIllustrative: formData.get("isIllustrative") === "on",
  });
  if (!meta.success) {
    return { ok: false, error: meta.error.issues[0]?.message ?? "Texto alternativo inválido.", fieldErrors: { altText: meta.error.issues[0]?.message ?? "" } };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = validateMediaUpload({ name: file.name, size: file.size, bytes });
  if (!result.ok) return { ok: false, error: result.error, fieldErrors: { file: result.error } };
  const media = result.media;

  const supabase = await createSessionClient();
  const { data: existing, error: listError } = await supabase
    .from("product_media")
    .select("sort_order,is_primary,media_type")
    .eq("product_id", productId);
  if (listError) return { ok: false, error: friendlyDbError(listError) };

  const path = `products/${productId}/${crypto.randomUUID()}.${media.ext}`;
  const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType: media.mime,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) {
    return { ok: false, error: "Não foi possível enviar o arquivo. Verifique sua permissão e tente de novo." };
  }

  const nextOrder = Math.max(-1, ...(existing ?? []).map((m) => m.sort_order as number)) + 1;
  const hasPrimary = (existing ?? []).some((m) => m.is_primary);
  const { error: insertError } = await supabase.from("product_media").insert({
    product_id: productId,
    storage_path: path,
    media_type: media.kind,
    alt_text: meta.data.altText,
    is_illustrative: meta.data.isIllustrative,
    is_primary: media.kind === "image" && !hasPrimary,
    sort_order: nextOrder,
    width: media.width,
    height: media.height,
    mime_type: media.mime,
    size_bytes: media.sizeBytes,
  });
  if (insertError) {
    // Não deixa arquivo órfão no Storage.
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    return { ok: false, error: friendlyDbError(insertError, "Não foi possível registrar o arquivo.") };
  }

  updateTag(CATALOG_TAG);
  return { ok: true };
}

export async function updateMediaAction(mediaId: string, input: { altText: string; isIllustrative: boolean }): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(mediaId)) return { ok: false, error: "Mídia inválida." };
  const meta = mediaMetaSchema.safeParse(input);
  if (!meta.success) return { ok: false, error: meta.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("product_media")
    .update({ alt_text: meta.data.altText, is_illustrative: meta.data.isIllustrative })
    .eq("id", mediaId)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Sem permissão para editar esta mídia." };
  updateTag(CATALOG_TAG);
  return { ok: true };
}

export async function setPrimaryMediaAction(mediaId: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(mediaId)) return { ok: false, error: "Mídia inválida." };
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_primary_media", { p_media_id: mediaId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  updateTag(CATALOG_TAG);
  return { ok: true };
}

export async function moveMediaAction(productId: string, mediaId: string, direction: "up" | "down"): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(productId) || !isUuid(mediaId)) return { ok: false, error: "Pedido inválido." };
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("product_media")
    .select("id,sort_order")
    .eq("product_id", productId)
    .order("sort_order")
    .order("created_at");
  if (error || !data) return { ok: false, error: friendlyDbError(error) };

  const ids = data.map((m) => m.id as string);
  const i = ids.indexOf(mediaId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];

  const { error: rpcError } = await supabase.rpc("reorder_media", { p_product_id: productId, p_ordered_ids: ids });
  if (rpcError) return { ok: false, error: friendlyDbError(rpcError) };
  updateTag(CATALOG_TAG);
  return { ok: true };
}

export async function deleteMediaAction(mediaId: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(mediaId)) return { ok: false, error: "Mídia inválida." };
  const supabase = await createSessionClient();

  const { data: media, error } = await supabase
    .from("product_media")
    .select("id,storage_path,is_primary,product:products(status)")
    .eq("id", mediaId)
    .maybeSingle();
  if (error || !media) return { ok: false, error: "Mídia não encontrada." };

  const product = media.product as unknown as { status: string } | null;
  if (media.is_primary && product?.status === "published") {
    return { ok: false, error: "Esta é a foto principal de um produto publicado. Defina outra foto principal antes de remover." };
  }

  const { data: deleted, error: deleteError } = await supabase.from("product_media").delete().eq("id", mediaId).select("id");
  if (deleteError) return { ok: false, error: friendlyDbError(deleteError) };
  if (!deleted?.length) return { ok: false, error: "Sem permissão para remover esta mídia." };

  await removeOrphanFiles([media.storage_path as string]);
  updateTag(CATALOG_TAG);
  return { ok: true };
}

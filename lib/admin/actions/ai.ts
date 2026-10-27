"use server";

import { updateTag } from "next/cache";
import { AuthorizationError, requireStaffAction } from "@/lib/auth/staff";
import { MEDIA_BUCKET } from "@/lib/catalog/mappers";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { isUuid } from "@/lib/catalog/slug";
import { validateMediaUpload } from "@/lib/media/validate";
import { createSessionClient } from "@/lib/supabase/server";
import { getAiStudioSnapshot } from "../ai";
import type { AiStudioSnapshot } from "../ai-types";
import { friendlyDbError } from "../errors";
import { removeOrphanFiles } from "../storage";
import type { ActionResult } from "../types";

async function guard(): Promise<{ ok: false; error: string } | null> {
  try {
    await requireStaffAction();
    return null;
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Sem permissão." };
  }
}

/**
 * Recebe uma foto tirada no celular (fundo qualquer), guarda o original e põe
 * na fila de limpeza de fundo. Mesmas validações do upload comum.
 */
export async function uploadAiPhotoAction(productId: string, formData: FormData): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(productId)) return { ok: false, error: "Produto inválido." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Escolha uma foto." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = validateMediaUpload({ name: file.name, size: file.size, bytes });
  if (!result.ok) return { ok: false, error: result.error };
  if (result.media.kind !== "image") return { ok: false, error: "Envie uma foto (JPG, PNG ou WebP)." };

  const supabase = await createSessionClient();
  const path = `products/${productId}/originais/${crypto.randomUUID()}.${result.media.ext}`;
  const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType: result.media.mime,
    upsert: false,
  });
  if (uploadError) return { ok: false, error: "Não foi possível enviar a foto. Verifique sua permissão e tente de novo." };

  const { error } = await supabase.from("ai_jobs").insert({ product_id: productId, kind: "background_removal", input_path: path });
  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    return { ok: false, error: friendlyDbError(error, "Não foi possível colocar a foto na fila.") };
  }
  return { ok: true };
}

export async function aiStudioSnapshotAction(productId: string): Promise<ActionResult<AiStudioSnapshot>> {
  const denied = await guard();
  if (denied) return denied;
  return { ok: true, data: await getAiStudioSnapshot(productId) };
}

/** O processador grava a mídia com a chave de serviço; a vitrine precisa saber. */
export async function aiResultsSeenAction(): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  updateTag(CATALOG_TAG);
  return { ok: true };
}

/** Gera o 3D a partir de uma foto já limpa (usa o recorte com transparência). */
export async function requestModel3dAction(productId: string, cleanJobId: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(productId) || !isUuid(cleanJobId)) return { ok: false, error: "Pedido inválido." };

  const supabase = await createSessionClient();
  const { data: base } = await supabase
    .from("ai_jobs")
    .select("id,cutout_path,output_media_id")
    .eq("id", cleanJobId)
    .eq("product_id", productId)
    .eq("kind", "background_removal")
    .eq("status", "succeeded")
    .maybeSingle();
  if (!base?.cutout_path) return { ok: false, error: "Escolha uma foto já limpa para gerar o 3D." };

  const { data: pending } = await supabase
    .from("ai_jobs")
    .select("id")
    .eq("product_id", productId)
    .eq("kind", "model_3d")
    .in("status", ["queued", "running"]);
  if (pending?.length) return { ok: false, error: "Já existe um modelo 3D sendo gerado para este produto." };

  const { error } = await supabase.from("ai_jobs").insert({
    product_id: productId,
    kind: "model_3d",
    input_path: base.cutout_path,
    source_media_id: base.output_media_id,
  });
  if (error) return { ok: false, error: friendlyDbError(error, "Não foi possível pedir o modelo 3D.") };
  return { ok: true };
}

/**
 * Pede as fotos de catálogo: a IA recria a cena nos ângulos padrão usando as
 * fotos reais (já enviadas e limpas) como referência.
 */
export async function requestCatalogPhotosAction(productId: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(productId)) return { ok: false, error: "Pedido inválido." };

  const supabase = await createSessionClient();
  const { data: photos } = await supabase
    .from("ai_jobs")
    .select("input_path")
    .eq("product_id", productId)
    .eq("kind", "background_removal")
    .eq("status", "succeeded")
    .order("created_at");
  if (!photos?.length) return { ok: false, error: "Envie e limpe pelo menos uma foto real antes." };

  const { data: pending } = await supabase
    .from("ai_jobs")
    .select("id")
    .eq("product_id", productId)
    .eq("kind", "catalog_photos")
    .in("status", ["queued", "running"]);
  if (pending?.length) return { ok: false, error: "As fotos de catálogo deste produto já estão sendo geradas." };

  const { error } = await supabase
    .from("ai_jobs")
    .insert({ product_id: productId, kind: "catalog_photos", input_path: photos[0].input_path as string });
  if (error) return { ok: false, error: friendlyDbError(error, "Não foi possível pedir as fotos de catálogo.") };
  return { ok: true };
}

/**
 * Aprova uma imagem de catálogo gerada por IA depois de conferida com as fotos
 * reais. O banco registra quem aprovou e quando; só então ela vai para a loja.
 */
export async function approveAiMediaAction(mediaId: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(mediaId)) return { ok: false, error: "Imagem inválida." };
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("product_media")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", mediaId)
    .eq("ai_generated", true)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Sem permissão para aprovar esta imagem." };
  updateTag(CATALOG_TAG);
  return { ok: true };
}

/** Descarta uma foto do estúdio: o job, o original, o recorte e o resultado. */
export async function discardAiJobAction(jobId: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(jobId)) return { ok: false, error: "Pedido inválido." };

  const supabase = await createSessionClient();
  const { data: job } = await supabase
    .from("ai_jobs")
    .select("id,kind,status,input_path,cutout_path,output_media_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { ok: false, error: "Item não encontrado." };
  if (job.status === "running") return { ok: false, error: "Aguarde o processamento terminar para descartar." };

  const paths = [job.cutout_path as string | null].filter(Boolean) as string[];
  if (job.kind === "background_removal") paths.push(job.input_path as string);

  if (job.output_media_id) {
    const { data: media } = await supabase
      .from("product_media")
      .select("id,storage_path,is_primary,product:products(status)")
      .eq("id", job.output_media_id)
      .maybeSingle();
    if (media) {
      const product = media.product as unknown as { status: string } | null;
      if (media.is_primary && product?.status === "published") {
        return { ok: false, error: "Esta é a foto principal de um produto publicado. Defina outra foto principal antes." };
      }
      const { data: removed, error } = await supabase.from("product_media").delete().eq("id", media.id).select("id");
      if (error) return { ok: false, error: friendlyDbError(error) };
      if (!removed?.length) return { ok: false, error: "Sem permissão para remover esta mídia." };
      paths.push(media.storage_path as string);
    }
  }

  // O 3D usa o recorte desta foto: descartar a foto não apaga o 3D já gerado.
  const { data: deleted, error } = await supabase.from("ai_jobs").delete().eq("id", jobId).select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!deleted?.length) return { ok: false, error: "Sem permissão para descartar." };

  const { data: stillUsed } = await supabase.from("ai_jobs").select("input_path").in("input_path", paths);
  const used = new Set((stillUsed ?? []).map((r) => r.input_path as string));
  await removeOrphanFiles(paths.filter((p) => !used.has(p)));
  updateTag(CATALOG_TAG);
  return { ok: true };
}

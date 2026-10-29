"use server";

import { updateTag } from "next/cache";
import { suggestCopy } from "@/lib/ai/copy";
import { photosForCopy, readCopyDraft, storeCopyDraft, type CopyDraft } from "@/lib/ai/copy-draft";
import { cloudAiConfig, needsCloudRun } from "@/lib/ai-cloud/config";
import { kickCloudQueue } from "@/lib/ai-cloud/runner";
import { rateLimit } from "@/lib/auth/rate-limit";
import { AuthorizationError, requireStaffAction } from "@/lib/auth/staff";
import { MEDIA_BUCKET } from "@/lib/catalog/mappers";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { isUuid } from "@/lib/catalog/slug";
import { validateMediaUpload } from "@/lib/media/validate";
import { createSessionClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { getAiStudioSnapshot } from "../ai";
import { getAdminProduct } from "../data";
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
  kickCloudQueue();
  return { ok: true };
}

export async function aiStudioSnapshotAction(productId: string): Promise<ActionResult<AiStudioSnapshot>> {
  const denied = await guard();
  if (denied) return denied;
  const snapshot = await getAiStudioSnapshot(productId);
  // O painel consulta a cada 2 s enquanto há tarefas: é o que mantém a fila andando na nuvem.
  if (needsCloudRun(snapshot.jobs, cloudAiConfig())) kickCloudQueue();
  return { ok: true, data: snapshot };
}

/** O processador (ou a IA na nuvem) grava a mídia com a chave de serviço; a vitrine precisa saber. */
export async function aiResultsSeenAction(): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  updateTag(CATALOG_TAG);
  return { ok: true };
}

/** Gera o 3D a partir de uma foto já limpa (usa o recorte com transparência). */
export async function requestModel3dAction(productId: string, cleanJobId: string | null): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(productId) || (cleanJobId !== null && !isUuid(cleanJobId))) return { ok: false, error: "Pedido inválido." };

  const supabase = await createSessionClient();
  // Com fotos de catálogo prontas, o 3D usa os ângulos delas (o processador busca frente, lado e costas).
  const { data: catalog } = await supabase
    .from("ai_jobs")
    .select("details")
    .eq("product_id", productId)
    .eq("kind", "catalog_photos")
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cutouts = ((catalog?.details as { cutouts?: Record<string, string> } | null)?.cutouts ?? {}) as Record<string, string>;
  let base: { cutout_path: string | null; output_media_id: string | null } | null = null;
  if (cleanJobId) {
    const { data } = await supabase
      .from("ai_jobs")
      .select("cutout_path,output_media_id")
      .eq("id", cleanJobId)
      .eq("product_id", productId)
      .eq("kind", "background_removal")
      .eq("status", "succeeded")
      .maybeSingle();
    base = data;
  }
  const inputPath = cutouts["tres-quartos"] ?? cutouts.frente ?? base?.cutout_path ?? null;
  if (!inputPath) return { ok: false, error: "Gere as fotos de catálogo ou escolha uma foto já limpa para o 3D." };

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
    input_path: inputPath,
    source_media_id: base?.output_media_id ?? null,
  });
  if (error) return { ok: false, error: friendlyDbError(error, "Não foi possível pedir o modelo 3D.") };
  kickCloudQueue();
  return { ok: true };
}

/**
 * Pede as fotos de catálogo: a IA recria a cena nos ângulos padrão usando as
 * fotos reais do celular como referência (não precisa esperar a limpeza).
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
    .neq("status", "failed")
    .order("created_at");
  if (!photos?.length) return { ok: false, error: "Envie pelo menos uma foto do produto antes." };

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
  kickCloudQueue();
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

  // A primeira imagem aprovada vira a foto principal, se o produto ainda não tem uma.
  const { data: media } = await supabase.from("product_media").select("product_id").eq("id", mediaId).single();
  if (media) {
    const { data: primary } = await supabase
      .from("product_media")
      .select("id")
      .eq("product_id", media.product_id)
      .eq("is_primary", true)
      .maybeSingle();
    if (!primary) await supabase.rpc("set_primary_media", { p_media_id: mediaId });
  }
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
    .select("id,kind,status,input_path,cutout_path,output_media_id,details")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { ok: false, error: "Item não encontrado." };
  if (job.status === "running") return { ok: false, error: "Aguarde o processamento terminar para descartar." };

  const paths = [job.cutout_path as string | null].filter(Boolean) as string[];
  if (job.kind === "background_removal") {
    paths.push(job.input_path as string);
    const studioPath = (job.details as { studioPath?: unknown } | null)?.studioPath;
    if (typeof studioPath === "string") paths.push(studioPath);
  }

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

export type CopyDraftResult = { status: "ready"; draft: CopyDraft } | { status: "writing" };

/**
 * Nome, descrições e SEO sugeridos pela IA a partir das fotos e dos dados
 * confirmados. A IA lê as fotos UMA vez por produto (normalmente junto com as
 * fotos de catálogo) e o rascunho fica guardado: aqui só se lê. Nada é salvo no
 * produto: a pessoa revisa e aplica.
 */
export async function copyDraftAction(productId: string): Promise<ActionResult<CopyDraftResult>> {
  let staffId: string;
  try {
    staffId = (await requireStaffAction()).userId;
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Sem permissão." };
  }
  if (!isUuid(productId)) return { ok: false, error: "Produto inválido." };
  if (!process.env.OPENAI_API_KEY) return { ok: false, error: "A chave da OpenAI não está configurada no servidor." };

  const supabase = await createSessionClient();
  const stored = await readCopyDraft(supabase, productId);
  if (stored) return { ok: true, data: { status: "ready", draft: stored } };

  // A IA na nuvem já está lendo as fotos junto com as fotos de catálogo: é só esperar.
  const { data: catalogPending } = await supabase
    .from("ai_jobs")
    .select("id")
    .eq("product_id", productId)
    .eq("kind", "catalog_photos")
    .in("status", ["queued", "running"])
    .limit(1);
  if (catalogPending?.length && cloudAiConfig().engines.catalog_photos) return { ok: true, data: { status: "writing" } };

  // Ninguém leu as fotos ainda: lê agora, uma vez, e guarda para as próximas.
  if (!rateLimit(`copy:${staffId}`, { limit: 10, windowMs: 10 * 60_000 }).allowed) {
    return { ok: false, error: "Muitos pedidos seguidos. Aguarde alguns minutos." };
  }
  const product = await getAdminProduct(productId);
  if (!product) return { ok: false, error: "Produto não encontrado." };
  // Fotos que representam o produto: aprovadas primeiro, sem as que aguardam conferência.
  const photos = product.media
    .filter((m) => m.type === "image" && !m.pendingReview && !m.isIllustrative)
    .sort((a, b) => Number(b.aiGenerated) - Number(a.aiGenerated) || Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
    .slice(0, 4);
  let paths = photos.map((p) => p.storagePath);
  if (!paths.length) {
    // Ainda sem fotos aprovadas: usa as fotos do celular (a versão limpa, se já existir).
    const { data: sent } = await supabase
      .from("ai_jobs")
      .select("input_path,details")
      .eq("product_id", productId)
      .eq("kind", "background_removal")
      .neq("status", "failed")
      .order("created_at")
      .limit(4);
    paths = (sent ?? []).map((j) => {
      const studioPath = (j.details as { studioPath?: unknown } | null)?.studioPath;
      return typeof studioPath === "string" ? studioPath : (j.input_path as string);
    });
  }
  if (!paths.length) return { ok: false, error: "Envie as fotos antes de pedir os textos." };

  const images: Uint8Array[] = [];
  for (const storagePath of paths) {
    const { data } = await supabase.storage.from(MEDIA_BUCKET).download(storagePath);
    if (data) images.push(new Uint8Array(await data.arrayBuffer()));
  }
  try {
    const draft = { ...(await suggestCopy({ product, images: await photosForCopy(images) })), createdAt: new Date().toISOString() };
    const service = createServiceClient();
    if (service) await storeCopyDraft(service, productId, draft);
    return { ok: true, data: { status: "ready", draft } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível gerar os textos." };
  }
}

const applyCopySchema = z.object({
  name: z.string().trim().min(2).max(120).nullable(),
  shortDescription: z.string().trim().min(10).max(240),
  description: z.string().trim().min(40).max(8000),
  seoTitle: z.string().trim().max(70),
  seoDescription: z.string().trim().max(170),
});

/** Aplica os textos revisados ao produto (o nome só se a pessoa escolheu um). */
export async function applyCopyAction(productId: string, input: z.input<typeof applyCopySchema>): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(productId)) return { ok: false, error: "Produto inválido." };
  const parsed = applyCopySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Textos fora do tamanho permitido." };

  const { name, shortDescription, description, seoTitle, seoDescription } = parsed.data;
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("products")
    .update({
      ...(name ? { name } : {}),
      short_description: shortDescription,
      description,
      seo_title: seoTitle || null,
      seo_description: seoDescription || null,
    })
    .eq("id", productId)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Sem permissão para alterar este produto." };
  updateTag(CATALOG_TAG);
  return { ok: true };
}

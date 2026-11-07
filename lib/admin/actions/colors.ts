"use server";

import { updateTag } from "next/cache";
import { kickCloudQueue } from "@/lib/ai-cloud/runner";
import { rateLimit } from "@/lib/auth/rate-limit";
import { AuthorizationError, requireStaffAction, type Staff } from "@/lib/auth/staff";
import { parsePriceToCents } from "@/lib/catalog/money";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { isUuid } from "@/lib/catalog/slug";
import { createSessionClient } from "@/lib/supabase/server";
import { colorBlocker, colorNameTaken, colorSources, COLOR_NAME_MAX, missingColorsMigration, parseColorInput } from "../colors";

const COLORS_NOT_READY = "As Cores ainda não foram ativadas no banco: falta aplicar a atualização das Cores.";
import { getAdminProduct } from "../data";
import { friendlyDbError } from "../errors";
import { removeOrphanFiles } from "../storage";
import type { ActionResult } from "../types";

/**
 * Cores no Estúdio (docs/CORES-NO-ESTUDIO.md): pedir uma cor nova ao GPT a
 * partir das fotos de catálogo aprovadas, publicar a cor depois de conferir
 * foto por foto, ou descartar as fotos geradas. Tudo com a sessão de quem está
 * no painel: valem o papel, a área "itens" e as regras do banco.
 */

async function guard(): Promise<{ staff: Staff } | { ok: false; error: string }> {
  try {
    return { staff: await requireStaffAction("editor", "itens") };
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Sem permissão." };
  }
}

/** Cada cor custa (GPT): limite por pessoa e por produto, além de uma cor por vez em cada produto. */
const LIMIT_PER_PERSON = { limit: 12, windowMs: 60 * 60_000 };
const LIMIT_PER_PRODUCT = { limit: 6, windowMs: 60 * 60_000 };

export async function requestColorVariantAction(productId: string, input: { name: string; color: string }): Promise<ActionResult> {
  const auth = await guard();
  if ("ok" in auth) return auth;
  if (!isUuid(productId)) return { ok: false, error: "Produto inválido." };
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Dê um nome à cor (ex.: Linho bege)." };
  if (name.length > COLOR_NAME_MAX) return { ok: false, error: `Nome da cor com até ${COLOR_NAME_MAX} caracteres.` };
  const hex = parseColorInput(input.color);
  if (!hex) return { ok: false, error: "Cor inválida: use #RRGGBB (ex.: #6B4A35) ou R, G, B (ex.: 107, 74, 53)." };

  const product = await getAdminProduct(productId);
  if (!product) return { ok: false, error: "Produto não encontrado." };
  const blocker = colorBlocker(product.variants);
  if (blocker) return { ok: false, error: blocker };
  if (colorNameTaken(product.variants, name)) return { ok: false, error: `Este produto já tem a cor “${name}”.` };
  const sources = colorSources(product.media);
  if (!sources.length) return { ok: false, error: "Aprove as fotos de catálogo (etapa 2) antes de criar cores." };
  // O banco só aceita tarefa com arquivo da pasta do próprio produto; a cópia de um produto usa os arquivos do original.
  const entry = sources.find((s) => s.media.storagePath.startsWith(`products/${productId}/`));
  if (!entry) {
    return {
      ok: false,
      error: "Este produto é uma cópia: as fotos de catálogo ainda são as do original. Gere as fotos de catálogo deste produto (etapa 2) para criar cores.",
    };
  }

  const supabase = await createSessionClient();
  const { data: pending } = await supabase
    .from("ai_jobs")
    .select("id")
    .eq("product_id", productId)
    .eq("kind", "color_variant")
    .in("status", ["queued", "running"]);
  if (pending?.length) return { ok: false, error: "Já existe uma cor sendo criada para este produto. Aguarde terminar." };

  for (const [key, limit] of [
    [`cores:pessoa:${auth.staff.userId}`, LIMIT_PER_PERSON],
    [`cores:produto:${productId}`, LIMIT_PER_PRODUCT],
  ] as const) {
    const { allowed, retryAfterSeconds } = rateLimit(key, limit);
    if (!allowed) return { ok: false, error: `Muitas cores pedidas em pouco tempo. Tente de novo em ${Math.ceil(retryAfterSeconds / 60)} min.` };
  }

  const { error } = await supabase.from("ai_jobs").insert({
    product_id: productId,
    kind: "color_variant",
    input_path: entry.media.storagePath,
    source_media_id: entry.media.id,
    params: {
      colorName: name,
      colorHex: hex,
      sourceMediaIds: sources.map((s) => s.media.id),
      views: sources.map((s) => s.view),
    },
  });
  if (missingColorsMigration(error)) return { ok: false, error: COLORS_NOT_READY };
  if (error) return { ok: false, error: friendlyDbError(error, "Não foi possível pedir a cor.") };
  kickCloudQueue();
  return { ok: true };
}

type PriceAndStock = { price: string; stock: string };
type PublishInput = PriceAndStock & {
  mediaIds: string[];
  /** Só na primeira cor: a cor atual do produto (a das fotos de catálogo). */
  original?: PriceAndStock & { name: string; color: string };
};

function priceAndStock(input: PriceAndStock, what: string): { priceCents: number; stockQuantity: number | null } | string {
  const priceCents = parsePriceToCents(input.price);
  if (priceCents === null) return `Informe o preço ${what} (ex.: 1.299,90).`;
  const stock = input.stock.trim();
  if (stock && !/^\d{1,7}$/.test(stock)) return `Estoque ${what}: um número inteiro, ou deixe em branco.`;
  return { priceCents, stockQuantity: stock ? Number(stock) : null };
}

/**
 * Publica a cor depois de conferida: cria a variação (na primeira cor, também a
 * da cor atual), aprova e liga as fotos escolhidas, num passo só no banco
 * (publish_color_variant). As fotos não escolhidas são apagadas.
 */
export async function publishColorVariantAction(jobId: string, input: PublishInput): Promise<ActionResult<{ variantId: string }>> {
  const auth = await guard();
  if ("ok" in auth) return auth;
  if (!isUuid(jobId)) return { ok: false, error: "Pedido inválido." };
  const mediaIds = [...new Set(input.mediaIds)];
  if (!mediaIds.length || !mediaIds.every(isUuid)) return { ok: false, error: "Escolha ao menos uma foto para publicar a cor." };
  const color = priceAndStock(input, "desta cor");
  if (typeof color === "string") return { ok: false, error: color };
  let original: { name: string; colorHex: string; priceCents: number; stockQuantity: number | null } | null = null;
  if (input.original) {
    const name = input.original.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > COLOR_NAME_MAX) return { ok: false, error: "Dê o nome da cor atual do produto (ex.: Azul-marinho)." };
    const colorHex = parseColorInput(input.original.color);
    if (!colorHex) return { ok: false, error: "Cor atual inválida: use #RRGGBB ou R, G, B." };
    const values = priceAndStock(input.original, "da cor atual");
    if (typeof values === "string") return { ok: false, error: values };
    original = { name, colorHex, ...values };
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("publish_color_variant", {
    p_job_id: jobId,
    p_media_ids: mediaIds,
    p_color: color,
    p_original: original,
  });
  if (error) return { ok: false, error: friendlyDbError(error, "Não foi possível publicar a cor.") };
  await removeUnpublished(jobId);
  updateTag(CATALOG_TAG);
  return { ok: true, data: { variantId: data as string } };
}

/** Apaga as fotos de uma tarefa de cor que ninguém publicou (linhas e arquivos sem uso). */
async function removeUnpublished(jobId: string): Promise<string | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("product_media")
    .delete()
    .eq("color_job_id", jobId)
    .is("approved_at", null)
    .select("storage_path");
  if (error) return friendlyDbError(error);
  await removeOrphanFiles((data ?? []).map((m) => m.storage_path as string));
  return null;
}

/** Descarta uma cor ainda não publicada: as fotos geradas e a tarefa. */
export async function discardColorJobAction(jobId: string): Promise<ActionResult> {
  const auth = await guard();
  if ("ok" in auth) return auth;
  if (!isUuid(jobId)) return { ok: false, error: "Pedido inválido." };
  const supabase = await createSessionClient();
  const { data: job } = await supabase.from("ai_jobs").select("id,kind,status").eq("id", jobId).maybeSingle();
  if (!job || job.kind !== "color_variant") return { ok: false, error: "Cor não encontrada." };
  if (job.status === "running") return { ok: false, error: "Aguarde as fotos ficarem prontas para descartar." };
  const failed = await removeUnpublished(jobId);
  if (failed) return { ok: false, error: failed };
  const { data: deleted, error } = await supabase.from("ai_jobs").delete().eq("id", jobId).select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!deleted?.length) return { ok: false, error: "Sem permissão para descartar." };
  updateTag(CATALOG_TAG);
  return { ok: true };
}

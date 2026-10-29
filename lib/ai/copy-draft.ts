import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { z } from "zod";
import { ADMIN_PRODUCT_SELECT } from "@/lib/admin/data";
import { mapProduct, type ProductRow } from "@/lib/catalog/mappers";
import { copySuggestionSchema, suggestCopy, type CopySuggestion } from "./copy";

/**
 * Rascunho de nome e descrição escrito pela IA a partir das fotos, UMA vez por
 * produto, e guardado em ai_jobs.details.copy (gravado só pelo servidor). O botão
 * "Aprimorar descrição" e o estúdio só leem esse rascunho: não pagam a IA de novo.
 */
export type CopyDraft = CopySuggestion & { createdAt: string };

const draftSchema = copySuggestionSchema.extend({
  unconfirmedNumbers: z.array(z.string()).default([]),
  createdAt: z.string(),
});

/** Lê o rascunho guardado dentro dos detalhes de uma tarefa de IA (ou null). */
export function parseCopyDraft(details: unknown): CopyDraft | null {
  const parsed = draftSchema.safeParse((details as { copy?: unknown } | null)?.copy);
  return parsed.success ? parsed.data : null;
}

/** O rascunho mais recente do produto, se a IA já leu as fotos. */
export async function readCopyDraft(supabase: SupabaseClient, productId: string): Promise<CopyDraft | null> {
  const { data } = await supabase
    .from("ai_jobs")
    .select("details")
    .eq("product_id", productId)
    .not("details->copy", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? parseCopyDraft(data.details) : null;
}

/** Até 4 fotos, de pé e com no máximo 1024 px: a IA lê bem e gasta menos. */
export async function photosForCopy(photos: (string | Uint8Array)[]) {
  return Promise.all(
    photos.slice(0, 4).map(async (photo) => ({
      mime: "image/jpeg",
      bytes: new Uint8Array(
        await sharp(photo).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(),
      ),
    })),
  );
}

/** Escreve o rascunho a partir das fotos, com os dados confirmados do produto (nada inventado). */
export async function writeCopyDraft(supabase: SupabaseClient, productId: string, photos: (string | Uint8Array)[]): Promise<CopyDraft> {
  const { data, error } = await supabase.from("products").select(ADMIN_PRODUCT_SELECT).eq("id", productId).single();
  if (error || !data) throw new Error("Produto não encontrado.");
  const suggestion = await suggestCopy({ product: mapProduct(data as unknown as ProductRow), images: await photosForCopy(photos) });
  return { ...suggestion, createdAt: new Date().toISOString() };
}

/** Guarda o rascunho na tarefa mais recente já terminada do produto (sem apagar o resto dos detalhes). */
export async function storeCopyDraft(supabase: SupabaseClient, productId: string, draft: CopyDraft): Promise<boolean> {
  const { data: job } = await supabase
    .from("ai_jobs")
    .select("id,details")
    .eq("product_id", productId)
    .in("status", ["succeeded", "failed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!job) return false;
  const { error } = await supabase
    .from("ai_jobs")
    .update({ details: { ...((job.details as Record<string, unknown>) ?? {}), copy: draft } })
    .eq("id", job.id);
  return !error;
}

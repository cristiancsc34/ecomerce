/**
 * Cores no Estúdio: regras sem servidor, usadas pela tela e pelas ações
 * (docs/CORES-NO-ESTUDIO.md).
 */
import type { ProductMedia, ProductVariant } from "@/lib/catalog/types";
import { variantSlug } from "@/lib/catalog/variants";

/** Ângulos das fotos de catálogo como aparecem no texto alternativo (iguais a CATALOG_VIEWS de scripts/ai-pipeline.mjs). */
export const CATALOG_VIEW_LABELS = {
  frente: "vista frontal",
  "tres-quartos": "vista três-quartos",
  lateral: "vista lateral",
  traseira: "vista traseira",
} as const;
export type CatalogView = keyof typeof CATALOG_VIEW_LABELS;
export const CATALOG_VIEW_ORDER = Object.keys(CATALOG_VIEW_LABELS) as CatalogView[];
export const VIEW_TITLE: Record<CatalogView, string> = {
  frente: "Frente",
  "tres-quartos": "Três-quartos",
  lateral: "Lateral",
  traseira: "Traseira",
};

export const COLOR_NAME_MAX = 60;
/** Custo medido nas fotos de catálogo (4 imagens): docs/CORES-NO-ESTUDIO.md. */
export const COLOR_COST_LABEL = "cerca de US$ 0,35 por cor";

/** "#6b4a35", "6B4A35", "107, 74, 53" ou "rgb(107 74 53)" → "#6B4A35". Qualquer outra coisa → null. */
export function parseColorInput(input: string): string | null {
  const text = input.trim();
  const hex = /^#?([0-9a-f]{6})$/i.exec(text);
  if (hex) return `#${hex[1].toUpperCase()}`;
  const rgb = /^(?:rgb\s*\()?\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)?$/i.exec(text);
  if (!rgb) return null;
  const parts = rgb.slice(1, 4).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Ângulo de uma foto de catálogo pelo texto alternativo que o Estúdio grava. */
export function viewOfAlt(alt: string): CatalogView | null {
  const text = alt.toLowerCase();
  return CATALOG_VIEW_ORDER.find((v) => text.includes(CATALOG_VIEW_LABELS[v])) ?? null;
}

type DbError = { message?: string; details?: string | null; hint?: string | null } | null | undefined;

/**
 * O banco ainda não recebeu a migração das Cores (20261105000100/000200): coluna
 * product_media.color_job_id, ai_jobs.params ou o tipo de tarefa 'color_variant'
 * não existem. Enquanto isso, o painel lê e grava do jeito antigo e o passo
 * Cores fica "aguardando a atualização do banco".
 */
export function missingColorsMigration(error: DbError): boolean {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return /color_job_id|ai_jobs\.params|column [\w.]*params does not exist|enum [\w.]*ai_job_kind|"color_variant"/i.test(text);
}

/**
 * Faz a consulta com as colunas das Cores e, se o banco ainda não as tem, repete
 * sem elas. `legacy` diz se precisou repetir.
 */
export async function selectWithColorsFallback<R extends { error: DbError }>(
  build: (columns: string) => PromiseLike<R>,
  columns: string,
  legacyColumns: string,
): Promise<{ result: R; legacy: boolean }> {
  const result = await build(columns);
  if (!missingColorsMigration(result.error)) return { result, legacy: false };
  return { result: await build(legacyColumns), legacy: true };
}

const isColorPhoto = (m: Pick<ProductMedia, "colorJobId">) => Boolean(m.colorJobId);

/** Fotos de catálogo do Estúdio (sem as fotos de cor). */
export function catalogAiMedia(media: ProductMedia[]): ProductMedia[] {
  return media.filter((m) => m.aiGenerated && !isColorPhoto(m)).sort((a, b) => a.sortOrder - b.sortOrder);
}

export type ColorSource = { media: ProductMedia; view: CatalogView | null };

/**
 * Bases de uma cor nova: as fotos de catálogo APROVADAS, uma por ângulo (a mais
 * recente, se o catálogo foi gerado mais de uma vez), na ordem frente,
 * três-quartos, lateral e traseira. Sem ângulo reconhecido, até 4 pela ordem.
 */
export function colorSources(media: ProductMedia[]): ColorSource[] {
  const approved = catalogAiMedia(media).filter((m) => m.type === "image" && !m.pendingReview && !m.variantId);
  const byView = new Map<CatalogView, ProductMedia>();
  const unknown: ProductMedia[] = [];
  for (const m of approved) {
    const view = viewOfAlt(m.altText);
    if (!view) unknown.push(m);
    else if (!byView.has(view) || byView.get(view)!.sortOrder < m.sortOrder) byView.set(view, m);
  }
  const known = CATALOG_VIEW_ORDER.filter((v) => byView.has(v)).map((v) => ({ media: byView.get(v)!, view: v }));
  return [...known, ...unknown.map((m) => ({ media: m, view: null }))].slice(0, CATALOG_VIEW_ORDER.length);
}

/** Por que este produto não pode ganhar cores agora (ou null). */
export function colorBlocker(variants: Pick<ProductVariant, "colorHex">[]): string | null {
  return variants.some((v) => !v.colorHex)
    ? "Este produto tem variações sem cor (por exemplo, tamanhos). Cores e tamanhos no mesmo produto ainda não são possíveis."
    : null;
}

/** O nome já existe entre as cores do produto (compara como no link ?cor=, sem acento nem maiúsculas). */
export function colorNameTaken(variants: Pick<ProductVariant, "name">[], name: string): boolean {
  const slug = variantSlug({ name });
  return variants.some((v) => variantSlug(v) === slug);
}

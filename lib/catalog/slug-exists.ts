import { catalogSource } from "@/config/site";
import { GUIAS } from "@/content/guias";
import { DEMO_CATEGORIES, DEMO_PRODUCTS } from "./demo-data";

/**
 * Confere se o endereço de um produto, categoria ou guia existe, para o
 * proxy.ts responder 404 de verdade antes de a página começar a ser enviada
 * (com o streaming, um "não encontrado" tardio sairia com status 200; issue
 * #31). Sem "server-only": roda no proxy.
 *
 * Devolve `null` quando não dá para saber (banco fora do ar, sem Supabase):
 * na dúvida a página abre normalmente e mostra o "não encontrado" com noindex.
 *
 * "Existe" = o que o visitante (chave pública) consegue ler, pelo RLS do banco.
 * Sem filtro extra de status ou de demonstração aqui: quando a issue #29
 * liberar os produtos de demonstração para o visitante, eles passam a abrir
 * com 200 (com noindex e sem JSON-LD, regra da página), sem mexer no proxy.
 */
export type CatalogKind = "produtos" | "categorias" | "guias";

/** Formato de slug aceito pelo banco (constraint products/categories_slug_format). */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 1_500;
/** Só os que existem ficam guardados (um produto recém-publicado nunca fica preso num 404). */
const seen = new Map<string, number>();

function rememberedAsExisting(key: string): boolean {
  const until = seen.get(key);
  if (!until) return false;
  if (until > Date.now()) return true;
  seen.delete(key);
  return false;
}

async function existsInSupabase(kind: "produtos" | "categorias", slug: string): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  const table = kind === "produtos" ? "products" : "categories";
  const params = new URLSearchParams({ select: "slug", slug: `eq.${slug}`, limit: "1" });
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/${table}?${params}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) ? rows.length > 0 : null;
  } catch {
    return null;
  }
}

export async function catalogSlugExists(kind: CatalogKind, slug: string): Promise<boolean | null> {
  if (!SLUG.test(slug) || slug.length > 120) return false;
  if (kind === "guias") return GUIAS.some((g) => g.slug === slug);
  if (catalogSource() === "demo") {
    return kind === "produtos" ? DEMO_PRODUCTS.some((p) => p.slug === slug) : DEMO_CATEGORIES.some((c) => c.slug === slug);
  }
  const cacheKey = `${kind}:${slug}`;
  if (rememberedAsExisting(cacheKey)) return true;
  const exists = await existsInSupabase(kind, slug);
  if (exists) seen.set(cacheKey, Date.now() + TTL_MS);
  return exists;
}

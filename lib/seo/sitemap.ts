import type { MetadataRoute } from "next";
import type { Guia } from "@/content/guias";
import { imageMedia } from "@/lib/catalog/product-helpers";
import type { Category, Product } from "@/lib/catalog/types";

/** Fotos reais do produto (sem ilustração nem .svg), em URL completa: viram o "sitemap de imagens". */
export function sitemapImages(product: Pick<Product, "media">, base: string): string[] {
  return imageMedia(product)
    .filter((m) => !m.isIllustrative && !m.pendingReview && !m.url.toLowerCase().endsWith(".svg"))
    .map((m) => (m.url.startsWith("http") ? m.url : `${base}${m.url.startsWith("/") ? "" : "/"}${m.url}`));
}

/** Páginas fixas (atendimento e políticas). /entrega-parana fica de fora (noindex, issue #31). */
export const STATIC_PAGES = [
  "/atendimento",
  "/politicas/privacidade",
  "/politicas/trocas-e-devolucoes",
  "/politicas/entrega",
  "/politicas/termos-de-uso",
] as const;

function latest(dates: string[]): string | undefined {
  return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : undefined;
}

export type SitemapInput = {
  base: string;
  products: Product[];
  categories: Pick<Category, "slug">[];
  guides: readonly Pick<Guia, "slug" | "dateModified">[];
  /** Trava de indexação aberta (issue #17)? */
  indexing: boolean;
};

/**
 * Só páginas que podem ir para o Google.
 *
 * - Trava de indexação fechada (issue #17): só o início e as páginas fixas.
 * - Aberta: início, todos os produtos, categorias com produto real, produtos
 *   reais com fotos, guias publicados (índice só com guia) e páginas fixas.
 * - Nunca: produto de demonstração, categoria vazia, /entrega-parana.
 */
export function buildSitemap({ base, products, categories, guides, indexing }: SitemapInput): MetadataRoute.Sitemap {
  const real = products.filter((p) => !p.isDemo);
  const newest = latest(real.map((p) => p.updatedAt));
  const home = { url: `${base}/`, ...(newest ? { lastModified: newest } : {}) };
  const fixed = STATIC_PAGES.map((path) => ({ url: `${base}${path}` }));
  if (!indexing) return [home, ...fixed];

  return [
    home,
    ...(real.length ? [{ url: `${base}/produtos`, ...(newest ? { lastModified: newest } : {}) }] : []),
    ...categories.flatMap((c) => {
      const inCategory = real.filter((p) => p.category?.slug === c.slug);
      if (!inCategory.length) return [];
      const modified = latest(inCategory.map((p) => p.updatedAt));
      return [{ url: `${base}/categorias/${c.slug}`, ...(modified ? { lastModified: modified } : {}) }];
    }),
    ...real.map((p) => {
      const images = sitemapImages(p, base);
      return { url: `${base}/produtos/${p.slug}`, lastModified: p.updatedAt, ...(images.length ? { images } : {}) };
    }),
    ...(guides.length
      ? [
          { url: `${base}/guias`, lastModified: latest(guides.map((g) => g.dateModified)) },
          ...guides.map((g) => ({ url: `${base}/guias/${g.slug}`, lastModified: g.dateModified })),
        ]
      : []),
    ...fixed,
  ];
}

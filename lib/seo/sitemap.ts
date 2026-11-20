import type { MetadataRoute } from "next";
import { CITY_PAGES, DELIVERY_HUB } from "@/content/cidades";
import { imageMedia } from "@/lib/catalog/product-helpers";
import { SECTIONS } from "@/lib/catalog/sections";
import { productsInSection, productsInSubpage, resolveSubpage, sectionCategories, facetsOf } from "@/lib/catalog/taxonomy";
import type { Category, Product } from "@/lib/catalog/types";

/** Fotos reais do produto (sem ilustração nem .svg), em URL completa: viram o "sitemap de imagens". */
export function sitemapImages(product: Pick<Product, "media">, base: string): string[] {
  return imageMedia(product)
    .filter((m) => !m.isIllustrative && !m.pendingReview && !m.url.toLowerCase().endsWith(".svg"))
    .map((m) => (m.url.startsWith("http") ? m.url : `${base}${m.url.startsWith("/") ? "" : "/"}${m.url}`));
}

/** Páginas fixas (atendimento e políticas). */
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

function entry(url: string, products: Product[]): MetadataRoute.Sitemap[number] {
  const modified = latest(products.map((p) => p.updatedAt));
  return { url, ...(modified ? { lastModified: modified } : {}) };
}

export type SitemapInput = {
  base: string;
  products: Product[];
  categories: Category[];
  /** Trava de indexação aberta (issue #17)? */
  indexing: boolean;
};

/**
 * Monta o sitemap. Produto de demonstração nunca entra, nem página de
 * categoria sem produto real.
 *
 * - Trava de indexação fechada (issue #17): só o início e as páginas fixas.
 * - Aberta: início, todos os produtos, seções (/colchoes, /estofados, /moveis)
 *   e subcategorias com produto, entrega no Paraná e páginas de cidade,
 *   cada produto com as suas fotos, e as páginas fixas.
 */
export function buildSitemap({ base, products, categories, indexing }: SitemapInput): MetadataRoute.Sitemap {
  const real = products.filter((p) => !p.isDemo);
  const home = entry(`${base}/`, real);
  const fixed = STATIC_PAGES.map((path) => ({ url: `${base}${path}` }));
  if (!indexing) return [home, ...fixed];

  const listings = SECTIONS.flatMap((section) => {
    const inSection = productsInSection(real, section.key);
    if (!inSection.length) return [];
    const subSlugs = [...new Set([...facetsOf(section.key).map((f) => f.slug), ...sectionCategories(categories, section.key).map((c) => c.slug)])];
    const subs = subSlugs.flatMap((slug) => {
      const sub = resolveSubpage(section.key, slug, categories);
      if (!sub) return [];
      const inSub = productsInSubpage(real, sub);
      return inSub.length ? [entry(`${base}${sub.path}`, inSub)] : [];
    });
    return [entry(`${base}${section.path}`, inSection), ...subs];
  });

  const local = [
    { url: `${base}/entrega`, lastModified: DELIVERY_HUB.updatedAt },
    ...CITY_PAGES.map((c) => ({ url: `${base}/entrega/${c.slug}`, lastModified: c.updatedAt })),
  ];

  return [
    home,
    ...(real.length ? [entry(`${base}/produtos`, real)] : []),
    ...listings,
    ...local,
    ...real.map((p) => {
      const images = sitemapImages(p, base);
      return { url: `${base}/produtos/${p.slug}`, lastModified: p.updatedAt, ...(images.length ? { images } : {}) };
    }),
    ...fixed,
  ];
}

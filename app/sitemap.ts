import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/site";
import { getCategoriesWithProducts, getVisibleProducts } from "@/lib/catalog/queries";
import { sitemapImages } from "@/lib/seo/sitemap";

function latest(dates: string[]): string | undefined {
  return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : undefined;
}

/**
 * Só páginas com conteúdo real: produtos de demonstração e categorias vazias
 * ficam de fora. Cada produto leva as suas fotos (o Google Imagens é uma porta
 * de entrada importante para móveis) e a data da última alteração.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [products, categories] = await Promise.all([getVisibleProducts(), getCategoriesWithProducts()]);
  const real = products.filter((p) => !p.isDemo);
  const newest = latest(real.map((p) => p.updatedAt));

  const listing = [
    { url: `${base}/`, ...(newest ? { lastModified: newest } : {}) },
    ...(real.length ? [{ url: `${base}/produtos`, ...(newest ? { lastModified: newest } : {}) }] : []),
  ];
  const staticPages = ["/atendimento", "/politicas/privacidade", "/politicas/trocas-e-devolucoes", "/politicas/entrega", "/politicas/termos-de-uso"].map(
    (path) => ({ url: `${base}${path}` }),
  );

  return [
    ...listing,
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
    ...staticPages,
  ];
}

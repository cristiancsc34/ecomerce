import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/site";
import { getCategoriesWithProducts, getVisibleProducts } from "@/lib/catalog/queries";

/** Só páginas com conteúdo real: produtos de demonstração e categorias vazias ficam de fora. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [products, categories] = await Promise.all([getVisibleProducts(), getCategoriesWithProducts()]);
  const real = products.filter((p) => !p.isDemo);

  const staticPages = ["", "/produtos", "/guia", "/comparar", "/atendimento", "/politicas/privacidade", "/politicas/trocas-e-devolucoes", "/politicas/entrega", "/politicas/termos-de-uso"].map(
    (path) => ({ url: `${base}${path}` }),
  );

  return [
    ...staticPages,
    ...categories
      .filter((c) => real.some((p) => p.category?.slug === c.slug))
      .map((c) => ({ url: `${base}/categorias/${c.slug}` })),
    ...real.map((p) => ({ url: `${base}/produtos/${p.slug}`, lastModified: p.updatedAt })),
  ];
}

import type { MetadataRoute } from "next";
import { indexingAllowed, siteUrl } from "@/config/site";
import { getCategories, getVisibleProducts } from "@/lib/catalog/queries";
import { buildSitemap } from "@/lib/seo/sitemap";

/**
 * Só páginas com conteúdo real: produtos de demonstração e categorias vazias
 * ficam de fora. Com a trava de indexação fechada (issue #17), só o início e
 * as páginas fixas. Ver lib/seo/sitemap.ts.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const indexing = indexingAllowed();
  if (!indexing) return buildSitemap({ base, products: [], categories: [], indexing });
  const [products, categories] = await Promise.all([getVisibleProducts(), getCategories()]).catch((error: unknown) => {
    // Catálogo fora do ar não derruba o /sitemap.xml: sai o sitemap sem catálogo (início, entrega e páginas fixas).
    console.error("Sitemap: falha ao ler o catálogo; publicando sem produtos e categorias.", error);
    return [[], []] as const;
  });
  return buildSitemap({ base, products: [...products], categories: [...categories], indexing });
}

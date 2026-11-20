import type { MetadataRoute } from "next";
import { indexingAllowed, siteUrl } from "@/config/site";
import { GUIAS } from "@/content/guias";
import { getCategoriesWithProducts, getVisibleProducts } from "@/lib/catalog/queries";
import { buildSitemap } from "@/lib/seo/sitemap";

/**
 * Só páginas com conteúdo real (ver lib/seo/sitemap.ts). Com a trava de
 * indexação fechada (issue #17), só o início e as páginas fixas, sem ler o
 * catálogo. Catálogo fora do ar não derruba o /sitemap.xml.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const indexing = indexingAllowed();
  if (!indexing) return buildSitemap({ base, products: [], categories: [], guides: GUIAS, indexing });
  const [products, categories] = await Promise.all([getVisibleProducts(), getCategoriesWithProducts()]).catch((error: unknown) => {
    // Catálogo fora do ar: sai o sitemap mínimo (início, guias e páginas fixas).
    console.error("Sitemap: falha ao ler o catálogo; publicando só o início e as páginas fixas.", error);
    return [[], []] as const;
  });
  return buildSitemap({ base, products: [...products], categories: [...categories], guides: GUIAS, indexing });
}

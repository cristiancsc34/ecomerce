import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getCatalogRepository } from "./repository";
import type { Category, Product } from "./types";

/** Tag única de invalidação do catálogo público (usada pelo painel ao salvar). */
export const CATALOG_TAG = "catalog";

/**
 * Catálogo visível ao público, em cache. O painel chama `updateTag(CATALOG_TAG)`
 * depois de qualquer alteração, então o tempo de vida é só uma rede de segurança.
 */
export async function getVisibleProducts(): Promise<Product[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return getCatalogRepository().listVisibleProducts();
}

export async function getCategories(): Promise<Category[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return getCatalogRepository().listCategories();
}

/** Categorias que têm pelo menos um produto visível (evita páginas vazias). */
export async function getCategoriesWithProducts(): Promise<(Category & { productCount: number })[]> {
  const [categories, products] = await Promise.all([getCategories(), getVisibleProducts()]);
  return categories
    .map((c) => ({ ...c, productCount: products.filter((p) => p.category?.slug === c.slug).length }))
    .filter((c) => c.productCount > 0);
}

export async function getVisibleProductBySlug(slug: string): Promise<Product | null> {
  const products = await getVisibleProducts();
  return products.find((p) => p.slug === slug) ?? null;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const categories = await getCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

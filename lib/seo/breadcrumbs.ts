import type { Category, Product } from "@/lib/catalog/types";

export type Crumb = { name: string; path: string };

/** Trilha da categoria: Início › Categoria. */
export function categoryBreadcrumbs(category: Pick<Category, "name" | "slug">): Crumb[] {
  return [
    { name: "Início", path: "/" },
    { name: category.name, path: `/categorias/${category.slug}` },
  ];
}

/** Trilha do produto: Início › Categoria › Produto (sem categoria: Início › Todos os produtos › Produto). */
export function productBreadcrumbs(product: Pick<Product, "name" | "slug" | "category">): Crumb[] {
  const self = { name: product.name, path: `/produtos/${product.slug}` };
  const middle = product.category
    ? { name: product.category.name, path: `/categorias/${product.category.slug}` }
    : { name: "Todos os produtos", path: "/produtos" };
  return [{ name: "Início", path: "/" }, middle, self];
}

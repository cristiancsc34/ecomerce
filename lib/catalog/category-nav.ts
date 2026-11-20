/**
 * Itens do menu de categorias do cabeçalho. Só entram categorias com produto
 * visível; com uma categoria (ou nenhuma) o menu não aparece, porque "Todos"
 * e a única categoria mostrariam a mesma coisa.
 */
export type CategoryNavItem = { href: string; label: string; path: string };

export function categoryNavItems(
  categories: { slug: string; name: string; productCount: number }[],
): CategoryNavItem[] {
  const withProducts = categories.filter((c) => c.productCount > 0);
  if (withProducts.length <= 1) return [];
  return [
    { href: "/#produtos", label: "Todos", path: "/" },
    ...withProducts.map((c) => ({ href: `/categorias/${c.slug}`, label: c.name, path: `/categorias/${c.slug}` })),
  ];
}

/** O item da página atual (pílula destacada). */
export function isActiveNavItem(item: CategoryNavItem, pathname: string | null): boolean {
  return pathname !== null && pathname === item.path;
}

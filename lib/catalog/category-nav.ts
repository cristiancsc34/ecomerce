import { SECTIONS, sectionKeyForCategory } from "./sections";

/**
 * Itens do menu de categorias do cabeçalho: as seções da loja (Colchões,
 * Estofados, Móveis) que têm produto visível, agrupando as categorias do banco.
 * Com uma seção (ou nenhuma) o menu não aparece, porque "Todos" e a única
 * seção mostrariam a mesma coisa.
 */
export type CategoryNavItem = { href: string; label: string; path: string };

export function categoryNavItems(
  categories: { slug: string; name: string; productCount: number }[],
): CategoryNavItem[] {
  const counts = new Map<string, number>();
  for (const c of categories) {
    const key = sectionKeyForCategory(c.slug);
    counts.set(key, (counts.get(key) ?? 0) + c.productCount);
  }
  const withProducts = SECTIONS.filter((s) => (counts.get(s.key) ?? 0) > 0);
  if (withProducts.length <= 1) return [];
  return [
    { href: "/#produtos", label: "Todos", path: "/" },
    ...withProducts.map((s) => ({ href: s.path, label: s.name, path: s.path })),
  ];
}

/** O item da página atual (pílula destacada): a seção e as suas subpáginas. */
export function isActiveNavItem(item: CategoryNavItem, pathname: string | null): boolean {
  if (pathname === null) return false;
  if (item.path === "/") return pathname === "/";
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

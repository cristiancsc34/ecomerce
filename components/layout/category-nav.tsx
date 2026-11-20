import { Suspense } from "react";
import { categoryNavItems } from "@/lib/catalog/category-nav";
import { getCategoriesWithProducts } from "@/lib/catalog/queries";
import { CategoryPills, CategoryPillsAtual } from "./category-pills";

/**
 * Menu de categorias abaixo da busca: só categorias com produto, e some com uma
 * categoria ou nenhuma. Os dados vêm do cache do catálogo, então o menu já sai no
 * HTML (não empurra a página depois). Rotas com parâmetro desconhecido no build
 * não sabem a página atual na pré-renderização: o fallback é igual, sem destaque.
 */
export async function CategoryNav() {
  const items = categoryNavItems(await getCategoriesWithProducts());
  if (!items.length) return null;
  return (
    <nav aria-label="Categorias" className="container-page">
      <Suspense fallback={<CategoryPills items={items} pathname={null} />}>
        <CategoryPillsAtual items={items} />
      </Suspense>
    </nav>
  );
}

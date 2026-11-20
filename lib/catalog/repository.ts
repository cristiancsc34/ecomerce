import "server-only";
import { catalogSource } from "@/config/site";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { selectCategoriesWithFallback } from "./category-columns";
import { DEMO_CATEGORIES, DEMO_PRODUCTS } from "./demo-data";
import { devExamplesEnabled, withDevExamples } from "./dev-examples";
import { mapCategory, mapProduct, PUBLIC_PRODUCT_COLUMNS, type CategoryRow, type ProductRow } from "./mappers";
import type { Category, Product } from "./types";
import { VISIBLE_PRODUCT_FILTERS } from "./visibility";

/** Fonte de dados da vitrine. Retorna apenas o que pode ser exibido ao público. */
export interface CatalogRepository {
  listVisibleProducts(): Promise<Product[]>;
  listCategories(): Promise<Category[]>;
}

/**
 * Modo demonstração: expõe os produtos placeholder para que a vitrine possa
 * ser vista e testada sem banco. Eles continuam marcados como `isDemo` e a
 * interface sempre mostra os avisos de dado ilustrativo.
 */
const demoRepository: CatalogRepository = {
  async listVisibleProducts() {
    // Cores de exemplo: só com CATALOG_DEV_EXAMPLES=1, fora da Vercel (ver dev-examples.ts).
    return devExamplesEnabled() ? withDevExamples(DEMO_PRODUCTS) : DEMO_PRODUCTS;
  },
  async listCategories() {
    return DEMO_CATEGORIES;
  },
};

const supabaseRepository: CatalogRepository = {
  async listVisibleProducts() {
    const supabase = createPublicSupabaseClient();
    let query = supabase.from("products").select(PUBLIC_PRODUCT_COLUMNS);
    for (const [column, value] of VISIBLE_PRODUCT_FILTERS) query = query.eq(column, value);
    const { data, error } = await query.order("published_at", { ascending: false }).limit(500);
    if (error) throw new Error(`Falha ao carregar o catálogo: ${error.message}`);
    return ((data ?? []) as unknown as ProductRow[]).map(mapProduct);
  },
  async listCategories() {
    const supabase = createPublicSupabaseClient();
    // Sem a migração de SEO das categorias, lê sem as colunas novas.
    const {
      result: { data, error },
    } = await selectCategoriesWithFallback((columns) =>
      supabase.from("categories").select(columns).order("sort_order").order("name"),
    );
    if (error) throw new Error(`Falha ao carregar categorias: ${error.message}`);
    return ((data ?? []) as unknown as CategoryRow[]).map(mapCategory);
  },
};

export function getCatalogRepository(): CatalogRepository {
  return catalogSource() === "demo" ? demoRepository : supabaseRepository;
}

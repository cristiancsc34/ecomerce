import "server-only";
import { catalogSource } from "@/config/site";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { DEMO_CATEGORY, DEMO_PRODUCTS } from "./demo-data";
import { mapCategory, mapProduct, PUBLIC_PRODUCT_COLUMNS, type CategoryRow, type ProductRow } from "./mappers";
import type { Category, Product } from "./types";

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
    return DEMO_PRODUCTS;
  },
  async listCategories() {
    return [DEMO_CATEGORY];
  },
};

const supabaseRepository: CatalogRepository = {
  async listVisibleProducts() {
    const supabase = createPublicSupabaseClient();
    const { data, error } = await supabase
      .from("products")
      .select(PUBLIC_PRODUCT_COLUMNS)
      .eq("status", "published")
      .eq("is_demo", false)
      .order("published_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`Falha ao carregar o catálogo: ${error.message}`);
    return ((data ?? []) as unknown as ProductRow[]).map(mapProduct);
  },
  async listCategories() {
    const supabase = createPublicSupabaseClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id,slug,name,description,sort_order,requires_3d")
      .order("sort_order")
      .order("name");
    if (error) throw new Error(`Falha ao carregar categorias: ${error.message}`);
    return ((data ?? []) as CategoryRow[]).map(mapCategory);
  },
};

export function getCatalogRepository(): CatalogRepository {
  return catalogSource() === "demo" ? demoRepository : supabaseRepository;
}

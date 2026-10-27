import "server-only";
import { requireStaffAction } from "@/lib/auth/staff";
import { mapCategory, mapProduct, type CategoryRow, type ProductRow } from "@/lib/catalog/mappers";
import { PRODUCT_STATUSES, type Category, type Product, type ProductStatus } from "@/lib/catalog/types";
import { normalizeText } from "@/lib/catalog/query";
import { isUuid } from "@/lib/catalog/slug";
import { createSessionClient } from "@/lib/supabase/server";
import type { AuditEvent } from "./types";

/**
 * Leituras do painel. Sempre com a sessão do usuário (RLS) e checando a equipe
 * antes, para que um módulo importado por engano não vaze dados.
 */
const ADMIN_PRODUCT_SELECT =
  "id,name,slug,short_description,description,status,is_demo,price_cents,compare_at_price_cents,currency,sku,stock_quantity,dimensions,attributes,faq,seo_title,seo_description,created_at,updated_at,published_at," +
  "category:categories(id,slug,name,requires_3d)," +
  "media:product_media(id,storage_path,media_type,alt_text,sort_order,is_primary,is_illustrative,width,height)," +
  "variants:product_variants(id,name,sku,price_cents,stock_quantity,attributes,sort_order)";

export async function listAdminProducts(filter: { status?: ProductStatus | null; q?: string } = {}): Promise<Product[]> {
  await requireStaffAction();
  const supabase = await createSessionClient();
  let query = supabase.from("products").select(ADMIN_PRODUCT_SELECT).order("updated_at", { ascending: false }).limit(500);
  if (filter.status && (PRODUCT_STATUSES as readonly string[]).includes(filter.status)) {
    query = query.eq("status", filter.status);
  }
  const { data, error } = await query;
  if (error) throw new Error("Falha ao carregar produtos.");
  let products = ((data ?? []) as unknown as ProductRow[]).map(mapProduct);
  if (filter.q) {
    const term = normalizeText(filter.q);
    products = products.filter((p) => normalizeText(`${p.name} ${p.slug} ${p.sku ?? ""}`).includes(term));
  }
  return products;
}

export async function getAdminProduct(id: string): Promise<Product | null> {
  await requireStaffAction();
  if (!isUuid(id)) return null;
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("products").select(ADMIN_PRODUCT_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error("Falha ao carregar o produto.");
  return data ? mapProduct(data as unknown as ProductRow) : null;
}

export async function listAdminCategories(): Promise<(Category & { productCount: number })[]> {
  await requireStaffAction();
  const supabase = await createSessionClient();
  const [{ data: cats, error }, { data: prods }] = await Promise.all([
    supabase.from("categories").select("id,slug,name,description,sort_order,requires_3d").order("sort_order").order("name"),
    supabase.from("products").select("category_id"),
  ]);
  if (error) throw new Error("Falha ao carregar categorias.");
  const counts = new Map<string, number>();
  for (const p of (prods ?? []) as { category_id: string | null }[]) {
    if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  }
  return ((cats ?? []) as CategoryRow[]).map((c) => ({ ...mapCategory(c), productCount: counts.get(c.id) ?? 0 }));
}

export async function getDashboardStats(): Promise<{ byStatus: Record<ProductStatus, number>; demo: number; total: number }> {
  await requireStaffAction();
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("products").select("status,is_demo");
  if (error) throw new Error("Falha ao carregar o resumo.");
  const byStatus = { draft: 0, review: 0, published: 0, archived: 0 } as Record<ProductStatus, number>;
  let demo = 0;
  for (const row of (data ?? []) as { status: ProductStatus; is_demo: boolean }[]) {
    if (row.status in byStatus) byStatus[row.status] += 1;
    if (row.is_demo) demo += 1;
  }
  return { byStatus, demo, total: data?.length ?? 0 };
}

export async function listAuditEvents({ limit = 20, productId }: { limit?: number; productId?: string } = {}): Promise<AuditEvent[]> {
  await requireStaffAction();
  const supabase = await createSessionClient();
  let query = supabase
    .from("audit_events")
    .select("id,action,entity_type,entity_id,details,created_at,actor_id")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (productId && isUuid(productId)) query = query.eq("entity_id", productId);
  const { data, error } = await query;
  if (error) throw new Error("Falha ao carregar a atividade.");
  return (data ?? []).map((e) => ({
    id: e.id as number,
    action: e.action as string,
    entityType: e.entity_type as string,
    entityId: (e.entity_id as string | null) ?? null,
    details: (e.details as Record<string, unknown>) ?? {},
    createdAt: e.created_at as string,
    actorId: (e.actor_id as string | null) ?? null,
  }));
}

import "server-only";
import type { OrderProductOption } from "@/components/admin/order-form";
import { requireStaffAction } from "@/lib/auth/staff";
import { isUuid } from "@/lib/catalog/slug";
import type { DeliveryMethod, OrderAddress, OrderStatus, PaymentMethod } from "@/lib/orders/status";
import { createSessionClient } from "@/lib/supabase/server";
import { listAdminProducts } from "./data";

/** Leituras de pedidos do painel (sessão do usuário; o RLS só libera a equipe). */

/** De onde veio o pedido: registrado pela equipe no painel ou feito pelo cliente no site. */
export type OrderSource = "painel" | "site";

export type OrderSummary = {
  id: string;
  code: string;
  status: OrderStatus;
  customerName: string;
  totalCents: number;
  deliveryMethod: DeliveryMethod;
  scheduledDate: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  source: OrderSource;
};

export type OrderItem = {
  productId: string | null;
  variantId: string | null;
  name: string;
  variantName: string | null;
  unitPriceCents: number;
  quantity: number;
};

export type OrderEvent = { id: string; status: OrderStatus; publicNote: string | null; internalNote: string | null; createdAt: string };

export type OrderDetail = Omit<OrderSummary, "itemCount"> & {
  customerPhone: string | null;
  customerEmail: string | null;
  whatsappOptIn: boolean;
  address: OrderAddress;
  carrier: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  scheduledWindow: string | null;
  deliveryNotes: string | null;
  assembly: boolean;
  subtotalCents: number;
  shippingCents: number | null;
  discountCents: number;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  internalNotes: string | null;
  publicToken: string;
  items: OrderItem[];
  events: OrderEvent[];
};

type Row = Record<string, unknown>;

const toSource = (v: unknown): OrderSource => (v === "site" ? "site" : "painel");

export async function listOrders(): Promise<OrderSummary[]> {
  await requireStaffAction();
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id,code,status,customer_name,total_cents,delivery_method,scheduled_date,created_at,updated_at,source,items:order_items(quantity)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Falha ao carregar os pedidos.");
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    status: r.status as OrderStatus,
    customerName: r.customer_name as string,
    totalCents: r.total_cents as number,
    deliveryMethod: r.delivery_method as DeliveryMethod,
    scheduledDate: (r.scheduled_date as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    itemCount: ((r.items as { quantity: number }[]) ?? []).reduce((n, i) => n + i.quantity, 0),
    source: toSource(r.source),
  }));
}

export async function getOrder(id: string): Promise<OrderDetail | null> {
  await requireStaffAction();
  if (!isUuid(id)) return null;
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "*,items:order_items(product_id,variant_id,name,variant_name,unit_price_cents,quantity,sort_order)," +
        "events:order_events(id,status,public_note,internal_note,created_at)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Falha ao carregar o pedido.");
  if (!data) return null;
  const r = data as unknown as Row;
  const items = ((r.items as Row[]) ?? []).sort((a, b) => (a.sort_order as number) - (b.sort_order as number));
  const events = ((r.events as Row[]) ?? []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return {
    id: r.id as string,
    code: r.code as string,
    status: r.status as OrderStatus,
    customerName: r.customer_name as string,
    customerPhone: (r.customer_phone as string | null) ?? null,
    customerEmail: (r.customer_email as string | null) ?? null,
    whatsappOptIn: Boolean(r.whatsapp_opt_in),
    address: (r.address as OrderAddress) ?? {},
    deliveryMethod: r.delivery_method as DeliveryMethod,
    carrier: (r.carrier as string | null) ?? null,
    trackingCode: (r.tracking_code as string | null) ?? null,
    trackingUrl: (r.tracking_url as string | null) ?? null,
    scheduledDate: (r.scheduled_date as string | null) ?? null,
    scheduledWindow: (r.scheduled_window as string | null) ?? null,
    deliveryNotes: (r.delivery_notes as string | null) ?? null,
    assembly: Boolean(r.assembly),
    subtotalCents: r.subtotal_cents as number,
    shippingCents: (r.shipping_cents as number | null) ?? null,
    discountCents: r.discount_cents as number,
    totalCents: r.total_cents as number,
    paymentMethod: (r.payment_method as PaymentMethod | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
    internalNotes: (r.internal_notes as string | null) ?? null,
    publicToken: r.public_token as string,
    source: toSource(r.source),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    items: items.map((i) => ({
      productId: (i.product_id as string | null) ?? null,
      variantId: (i.variant_id as string | null) ?? null,
      name: i.name as string,
      variantName: (i.variant_name as string | null) ?? null,
      unitPriceCents: i.unit_price_cents as number,
      quantity: i.quantity as number,
    })),
    events: events.map((e) => ({
      id: e.id as string,
      status: e.status as OrderStatus,
      publicNote: (e.public_note as string | null) ?? null,
      internalNote: (e.internal_note as string | null) ?? null,
      createdAt: e.created_at as string,
    })),
  };
}

/** Produtos que podem entrar num pedido (sem arquivados e sem demonstração), com o preço confirmado, se houver. */
export async function orderProductOptions(): Promise<OrderProductOption[]> {
  const products = await listAdminProducts();
  return products
    .filter((p) => p.status !== "archived" && !p.isDemo)
    .map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.priceCents,
      variants: p.variants.map((v) => ({ id: v.id, name: v.name, priceCents: v.priceCents })),
    }));
}

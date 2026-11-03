import "server-only";
import { isSupabaseConfigured } from "@/config/site";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { DeliveryMethod, OrderStatus } from "./status";

/** O que o cliente vê do próprio pedido (função public.order_tracking: sem dados internos). */
export type OrderTracking = {
  code: string;
  status: OrderStatus;
  customerFirstName: string;
  createdAt: string;
  paidAt: string | null;
  deliveryMethod: DeliveryMethod;
  carrier: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  scheduledDate: string | null;
  scheduledWindow: string | null;
  assembly: boolean;
  place: { bairro?: string | null; cidade?: string | null; uf?: string | null };
  subtotalCents: number;
  shippingCents: number | null;
  discountCents: number;
  totalCents: number;
  items: { name: string; variantName: string | null; quantity: number; unitPriceCents: number }[];
  events: { status: OrderStatus; note: string | null; at: string }[];
};

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Za-z]{2,5}-\d{1,10}$/;

export async function getOrderTracking(code: string, token: string | undefined): Promise<OrderTracking | null> {
  if (!isSupabaseConfigured() || !token || !TOKEN.test(token) || !CODE.test(code)) return null;
  const { data, error } = await createPublicSupabaseClient().rpc("order_tracking", { p_code: code, p_token: token });
  if (error || !data) return null;
  return data as OrderTracking;
}

/** Número do pedido + celular → link secreto (ou null). */
export async function findOrderToken(code: string, phone: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !CODE.test(code.trim())) return null;
  const { data, error } = await createPublicSupabaseClient().rpc("order_tracking_token", { p_code: code.trim(), p_phone: phone });
  if (error || !data) return null;
  return data as string;
}

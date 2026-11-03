import "server-only";
import { requireStaffAction } from "@/lib/auth/staff";
import { isUuid } from "@/lib/catalog/slug";
import type { CepRange } from "@/lib/shipping/ranges";
import type { ShippingOption } from "@/lib/shipping/types";
import { createSessionClient } from "@/lib/supabase/server";

/** Painel → Entrega e avisos: leituras (sessão da equipe + RLS). */

export type NotificationSettings = { notifyEmail: boolean; notifyWhatsapp: boolean };

export type AdminShippingOption = ShippingOption & { cepRanges: CepRange[]; active: boolean; sortOrder: number };

export async function getNotificationSettings(): Promise<NotificationSettings | null> {
  await requireStaffAction();
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("notification_settings").select("notify_email,notify_whatsapp").maybeSingle();
  if (error || !data) return null;
  return { notifyEmail: data.notify_email as boolean, notifyWhatsapp: data.notify_whatsapp as boolean };
}

export async function listShippingOptions(): Promise<AdminShippingOption[] | null> {
  await requireStaffAction();
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("shipping_options")
    .select("id,name,method,cep_ranges,price_cents,days_min,days_max,details,active,sort_order")
    .order("sort_order")
    .order("created_at");
  if (error) return null;
  return (data ?? []).map((o) => ({
    id: o.id as string,
    name: o.name as string,
    method: o.method as ShippingOption["method"],
    cepRanges: (o.cep_ranges ?? []) as CepRange[],
    priceCents: (o.price_cents as number | null) ?? null,
    daysMin: (o.days_min as number | null) ?? null,
    daysMax: (o.days_max as number | null) ?? null,
    details: (o.details as string | null) ?? null,
    active: o.active as boolean,
    sortOrder: o.sort_order as number,
  }));
}

export type OrderNotification = {
  event: string;
  channel: "email" | "whatsapp";
  status: "pending" | "sending" | "sent" | "failed" | "cancelled";
  attempts: number;
  createdAt: string;
  sentAt: string | null;
  lastError: string | null;
};

/** Avisos automáticos de um pedido (sem o conteúdo das mensagens). */
export async function listOrderNotifications(orderId: string): Promise<OrderNotification[]> {
  await requireStaffAction();
  if (!isUuid(orderId)) return [];
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("order_notifications", { p_order_id: orderId });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((n) => ({
    event: n.event as string,
    channel: n.channel as OrderNotification["channel"],
    status: n.status as OrderNotification["status"],
    attempts: n.attempts as number,
    createdAt: n.created_at as string,
    sentAt: (n.sent_at as string | null) ?? null,
    lastError: (n.last_error as string | null) ?? null,
  }));
}

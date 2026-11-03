import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { brand } from "@/config/brand";
import { siteUrl } from "@/config/site";
import { orderMessage, trackingLink } from "@/lib/orders/messages";
import { STATUS_LABEL, type DeliveryMethod, type OrderStatus } from "@/lib/orders/status";
import { createServiceClient } from "@/lib/supabase/service";
import { dispatchClaimed, type OutboxRow, type OutboxUpdate } from "./outbox";
import { configuredProviders } from "./providers";
import type { NotificationProvider, OutgoingMessage } from "./types";

/**
 * Avisos automáticos de cada etapa do pedido. O banco põe na fila (trigger em order_events, só com o canal ligado
 * pelo dono e, no WhatsApp, com o aceite do cliente); aqui o texto é montado com os dados ATUAIS do pedido e enviado
 * pelos provedores configurados. Roda logo depois de cada mudança (after) e pela rota /api/avisos (agendada).
 */

type QueuedPayload = { orderId: string; eventId: string; status: OrderStatus };

export type OrderForMessage = {
  id: string;
  code: string;
  public_token: string;
  source: string;
  customer_name: string;
  delivery_method: DeliveryMethod;
  total_cents: number;
  carrier: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  scheduled_date: string | null;
  scheduled_window: string | null;
  items: { name: string; variant_name: string | null; quantity: number; sort_order: number }[];
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Texto em HTML simples: escapado, com quebras de linha e links https clicáveis. */
function textToHtml(text: string): string {
  const body = escapeHtml(text)
    .replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2E6E9E">$1</a>')
    .split("\n")
    .join("<br>");
  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1F2B38">${body}</body></html>`;
}

const isQueued = (p: unknown): p is QueuedPayload =>
  typeof p === "object" && p !== null && typeof (p as QueuedPayload).orderId === "string" && typeof (p as QueuedPayload).status === "string";

/**
 * Monta o aviso de uma etapa. O texto é o mesmo da mensagem que a equipe manda pelo painel (lib/orders/messages),
 * com o link de acompanhamento.
 */
export function renderStatusNotification(
  channel: "email" | "whatsapp",
  to: string,
  status: OrderStatus,
  order: OrderForMessage,
  options: { site: string; brandName: string; dedupeKey: string; publicNote?: string | null },
): OutgoingMessage {
  const link = trackingLink(options.site, order.code, order.public_token);
  const text = orderMessage({
    brandName: options.brandName,
    code: order.code,
    customerName: order.customer_name,
    status,
    deliveryMethod: order.delivery_method,
    trackingLink: link,
    items: [...order.items].sort((a, b) => a.sort_order - b.sort_order).map((i) => ({ name: i.name, variantName: i.variant_name, quantity: i.quantity })),
    totalCents: order.total_cents,
    carrier: order.carrier,
    trackingCode: order.tracking_code,
    trackingUrl: order.tracking_url,
    scheduledDate: order.scheduled_date,
    scheduledWindow: order.scheduled_window,
    publicNote: options.publicNote,
  });
  const firstName = order.customer_name.trim().split(/\s+/)[0] || "cliente";
  const event = `pedido_${status}`;
  return channel === "email"
    ? {
        channel,
        event,
        to,
        text,
        email: { subject: `Pedido ${order.code}: ${STATUS_LABEL[status]} — ${options.brandName}`, html: textToHtml(text) },
        idempotencyKey: options.dedupeKey,
      }
    : { channel, event, to, text, template: { name: event, language: "pt_BR", params: [firstName, order.code, link] }, idempotencyKey: options.dedupeKey };
}

type ClaimedRow = OutboxRow & { dedupe_key: string; recipient: string };

/** Converte as linhas reservadas em mensagens prontas (as antigas já vêm prontas; as novas são montadas aqui). */
async function prepare(supabase: SupabaseClient, rows: ClaimedRow[]): Promise<{ ready: OutboxRow[]; broken: OutboxUpdate[] }> {
  const ids = [...new Set(rows.map((r): unknown => r.payload).filter(isQueued).map((p) => p.orderId))];
  const orders = new Map<string, OrderForMessage>();
  const notes = new Map<string, string | null>();
  if (ids.length) {
    const { data } = await supabase
      .from("orders")
      .select(
        "id,code,public_token,source,customer_name,delivery_method,total_cents,carrier,tracking_code,tracking_url,scheduled_date,scheduled_window,items:order_items(name,variant_name,quantity,sort_order)",
      )
      .in("id", ids);
    for (const o of (data ?? []) as OrderForMessage[]) orders.set(o.id, o);
    const eventIds = rows.map((r): unknown => r.payload).filter(isQueued).map((p) => p.eventId);
    const { data: events } = await supabase.from("order_events").select("id,public_note").in("id", eventIds);
    for (const e of (events ?? []) as { id: string; public_note: string | null }[]) notes.set(e.id, e.public_note);
  }
  const site = siteUrl();
  const ready: OutboxRow[] = [];
  const broken: OutboxUpdate[] = [];
  for (const row of rows) {
    const payload: unknown = row.payload;
    if (!isQueued(payload)) {
      ready.push(row);
      continue;
    }
    const order = orders.get(payload.orderId);
    if (!order) {
      broken.push({ id: row.id, status: "failed", last_error: "pedido não encontrado" });
      continue;
    }
    const note = notes.get(payload.eventId);
    ready.push({
      ...row,
      payload: renderStatusNotification(row.channel, row.recipient, payload.status, order, {
        site,
        brandName: brand.name,
        dedupeKey: row.dedupe_key,
        publicNote: note,
      }),
    });
  }
  return { ready, broken };
}

/** Envia os avisos vencidos da fila. Nunca lança: erros ficam registrados em cada aviso (com nova tentativa). */
export async function processOrderNotifications(
  { limit = 20, providers = configuredProviders(), client }: { limit?: number; providers?: NotificationProvider[]; client?: SupabaseClient | null } = {},
): Promise<{ sent: number; retry: number; failed: number }> {
  const supabase = client === undefined ? createServiceClient() : client;
  const result = { sent: 0, retry: 0, failed: 0 };
  if (!supabase) return result;
  try {
    const { data, error } = await supabase.rpc("claim_notifications", { p_limit: limit });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ClaimedRow[];
    if (!rows.length) return result;
    const { ready, broken } = await prepare(supabase, rows);
    const updates = [...broken, ...(await dispatchClaimed(ready, providers))];
    for (const u of updates) {
      const { id, ...fields } = u;
      await supabase.from("notification_outbox").update(fields).eq("id", id);
      if (u.status === "sent") result.sent++;
      else if (u.status === "pending") result.retry++;
      else result.failed++;
    }
  } catch (e) {
    console.error("avisos: falha ao processar a fila", e instanceof Error ? e.message : e);
  }
  return result;
}

/** Depois de responder, a mesma função envia os avisos da etapa (sem atrasar a tela do cliente ou da equipe). */
export function kickOrderNotifications() {
  if (!configuredProviders().length) return;
  after(async () => {
    await processOrderNotifications();
  });
}

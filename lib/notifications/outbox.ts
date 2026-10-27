import { renderOrderMessages } from "./templates";
import type { NotificationChannel, NotificationProvider, OrderEvent, OrderForNotification, OutgoingMessage } from "./types";

/**
 * Fila de saída (tabela notification_outbox). Funções puras: quem grava e lê
 * do banco é o servidor/processador com a chave de serviço.
 */

export const MAX_ATTEMPTS = 5;
/** Espera antes da tentativa N+1 (1 min, 5 min, 30 min, 2 h). */
const BACKOFF_MINUTES = [1, 5, 30, 120];

export type OutboxInsert = {
  dedupe_key: string;
  order_ref: string;
  event: OrderEvent;
  channel: NotificationChannel;
  recipient: string;
  payload: OutgoingMessage;
};

/** Linhas a gravar quando o pedido muda de estado. Use `upsert ... on conflict (dedupe_key) do nothing`. */
export function planOrderNotifications(event: OrderEvent, order: OrderForNotification): OutboxInsert[] {
  return renderOrderMessages(event, order).map((message) => ({
    dedupe_key: `${event}:${order.id}:${message.channel}`,
    order_ref: order.id,
    event,
    channel: message.channel,
    recipient: message.to,
    payload: message,
  }));
}

export type OutboxRow = {
  id: string;
  channel: NotificationChannel;
  attempts: number;
  payload: OutgoingMessage;
};

export type OutboxUpdate =
  | { id: string; status: "sent"; provider_message_id: string; sent_at: string; last_error: null }
  | { id: string; status: "pending"; next_attempt_at: string; last_error: string }
  | { id: string; status: "failed"; last_error: string };

function shortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

/**
 * Envia os avisos já reservados por claim_notifications() e diz como atualizar
 * cada linha: enviado, nova tentativa mais tarde ou falha definitiva.
 */
export async function dispatchClaimed(
  rows: OutboxRow[],
  providers: NotificationProvider[],
  now: Date = new Date(),
): Promise<OutboxUpdate[]> {
  const byChannel = new Map(providers.map((p) => [p.channel, p]));
  const updates: OutboxUpdate[] = [];
  for (const row of rows) {
    const provider = byChannel.get(row.channel);
    if (!provider) {
      updates.push({ id: row.id, status: "failed", last_error: `sem provedor configurado para ${row.channel}` });
      continue;
    }
    try {
      const { providerMessageId } = await provider.send(row.payload);
      updates.push({ id: row.id, status: "sent", provider_message_id: providerMessageId, sent_at: now.toISOString(), last_error: null });
    } catch (error) {
      if (row.attempts >= MAX_ATTEMPTS) {
        updates.push({ id: row.id, status: "failed", last_error: shortError(error) });
      } else {
        const wait = BACKOFF_MINUTES[Math.min(row.attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 1;
        updates.push({
          id: row.id,
          status: "pending",
          next_attempt_at: new Date(now.getTime() + wait * 60_000).toISOString(),
          last_error: shortError(error),
        });
      }
    }
  }
  return updates;
}

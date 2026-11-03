import Link from "next/link";
import type { OrderNotification } from "@/lib/admin/shipping";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { Badge } from "@/components/ui/badge";
import { Card } from "./ui";

const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

const STATUS = {
  pending: { label: "na fila", tone: "warm" },
  sending: { label: "enviando", tone: "info" },
  sent: { label: "enviado", tone: "success" },
  failed: { label: "falhou", tone: "danger" },
  cancelled: { label: "cancelado", tone: "neutral" },
} as const;

function eventLabel(event: string): string {
  const status = event.replace(/^pedido_/, "") as OrderStatus;
  return STATUS_LABEL[status] ?? event;
}

/** Avisos automáticos que o cliente recebeu (ou que estão na fila) para este pedido. */
export function OrderNotificationsList({ notifications }: { notifications: OrderNotification[] }) {
  return (
    <Card title="Avisos automáticos" description="E-mail e WhatsApp enviados sozinhos a cada etapa.">
      {notifications.length ? (
        <ul className="space-y-2 text-sm" data-testid="avisos-automaticos">
          {notifications.map((n, i) => (
            <li key={`${n.event}-${n.channel}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium">{eventLabel(n.event)}</span>
              <span className="text-muted">· {n.channel === "email" ? "e-mail" : "WhatsApp"}</span>
              <Badge tone={STATUS[n.status].tone}>{STATUS[n.status].label}</Badge>
              <span className="w-full text-xs text-muted">
                {dateTime.format(new Date(n.sentAt ?? n.createdAt))}
                {n.status === "failed" && n.lastError ? ` · ${n.lastError}` : ""}
                {n.status === "pending" && n.attempts > 0 ? ` · nova tentativa (${n.attempts}ª)` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          Nenhum aviso automático. Para ligar, vá em{" "}
          <Link href="/admin/entrega" className="link">
            Entrega e avisos
          </Link>
          ; até lá, use “Abrir no WhatsApp” acima.
        </p>
      )}
    </Card>
  );
}

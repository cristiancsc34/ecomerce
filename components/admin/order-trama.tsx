"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { refreshFromTramaAction, requeueTramaAction } from "@/lib/admin/actions/orders";
import type { OrderIntegration } from "@/lib/admin/trama";
import { formatDeliveryDate } from "@/lib/orders/messages";
import type { OrderStatus } from "@/lib/orders/status";
import { ROTULO_STATUS_TRAMA } from "@/lib/trama/mapear";
import type { StatusTrama } from "@/lib/trama/contrato";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalIcon } from "@/components/ui/icons";
import { Card } from "./ui";

const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

const FINANCEIRO: Record<string, string> = {
  a_receber: "a receber",
  parcial: "parcial",
  em_conferencia: "em conferência",
  divergente: "divergente",
  pago: "pago",
  cancelado: "cancelado",
};

/**
 * Fábrica e logística: o pedido confirmado vai para o Trama, que reserva do estoque (logística) ou abre a ordem de
 * produção (fábrica). Aqui a equipe vê o número e a etapa lá, o erro quando algo precisa ser corrigido e os botões
 * para enviar de novo ou conferir agora.
 */
export function OrderTrama({ orderId, orderStatus, integration }: { orderId: string; orderStatus: OrderStatus; integration: OrderIntegration }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"enviar" | "atualizar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const i = integration;

  async function run(kind: "enviar" | "atualizar") {
    setBusy(kind);
    setError(null);
    setDone(null);
    const r = kind === "enviar" ? await requeueTramaAction(orderId) : await refreshFromTramaAction(orderId);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setDone(kind === "enviar" ? "Pedido na fila do Trama. Atualize a página em alguns segundos." : "Conferido com o Trama.");
    router.refresh();
  }

  const confirmado = orderStatus === "pago" || orderStatus === "em_preparacao";
  const podeEnviar = i.configured && confirmado && (i.status === null || i.status === "erro" || i.status === "ignorado");
  const podeRepetirCancelamento = i.configured && i.status === "enviado" && orderStatus === "cancelado" && i.cancelStatus === "recusado";

  let resumo: ReactNode;
  if (!i.configured && i.status !== "enviado") {
    resumo = (
      <p className="text-sm text-muted">
        Integração desligada neste site. Com <code>TRAMA_API_URL</code> e <code>TRAMA_API_KEY</code> configurados, os pedidos confirmados
        vão sozinhos para a fábrica e a logística.
      </p>
    );
  } else if (i.status === null) {
    resumo = (
      <p className="text-sm text-muted">
        {orderStatus === "recebido"
          ? "Vai para a fábrica e a logística quando o pagamento for confirmado (ou ao começar a preparar)."
          : "Este pedido não foi enviado ao Trama."}
      </p>
    );
  } else if (i.status === "pendente" || i.status === "enviando") {
    resumo = (
      <p className="text-sm">
        <Badge tone="warm">{i.status === "enviando" ? "enviando" : "na fila"}</Badge>
        {i.lastError ? <span className="mt-1 block text-xs text-muted">Última tentativa: {i.lastError}</span> : null}
        {i.nextAttemptAt && i.attempts > 0 ? (
          <span className="block text-xs text-muted">Nova tentativa em {dateTime.format(new Date(i.nextAttemptAt))}</span>
        ) : null}
      </p>
    );
  } else if (i.status === "erro") {
    resumo = (
      <div className="space-y-1 text-sm">
        <Badge tone="danger">precisa de atenção</Badge>
        <p>{i.lastError ?? "O Trama recusou o pedido."}</p>
        <p className="text-xs text-muted">Corrija (SKU igual ao do Trama, preço igual ao catálogo de lá) e envie de novo.</p>
      </div>
    );
  } else if (i.status === "ignorado") {
    resumo = (
      <p className="text-sm text-muted">
        <Badge tone="neutral">não enviado</Badge> {i.lastError}
      </p>
    );
  } else {
    const status = i.erpStatus as StatusTrama | null;
    resumo = (
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Pedido no Trama</dt>
          <dd className="font-semibold">nº {i.erpNumber ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Etapa lá</dt>
          <dd className="text-right">
            <Badge tone={status === "entregue" ? "success" : status === "cancelado" ? "neutral" : "info"}>
              {status && status in ROTULO_STATUS_TRAMA ? ROTULO_STATUS_TRAMA[status] : (i.erpStatus ?? "—")}
            </Badge>
          </dd>
        </div>
        {i.erpFinancialStatus ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Pagamento lá</dt>
            <dd>{FINANCEIRO[i.erpFinancialStatus] ?? i.erpFinancialStatus}</dd>
          </div>
        ) : null}
        {i.erpForecast ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Previsão do Trama</dt>
            <dd>{formatDeliveryDate(i.erpForecast)}</dd>
          </div>
        ) : null}
        <p className="pt-1 text-xs text-muted">
          Enviado {i.sentAt ? dateTime.format(new Date(i.sentAt)) : ""}
          {i.syncedAt ? ` · conferido ${dateTime.format(new Date(i.syncedAt))}` : ""}. As próximas etapas (produção, agendamento, rota e
          entrega) vêm do Trama sozinhas. A previsão é só para a equipe: o cliente vê a data quando a entrega for agendada.
        </p>
        {i.cancelStatus === "pendente" ? <p className="text-xs">Cancelamento a caminho do Trama.</p> : null}
        {i.cancelStatus === "recusado" ? (
          <p className="rounded-lg bg-[#FDECEA] p-2 text-xs">
            O Trama não cancelou: {i.cancelError ?? "o pedido já está em produção ou a caminho"}. Resolva no Trama com a fábrica ou a
            expedição.
          </p>
        ) : null}
        {i.erpTrackingUrl ? (
          <a href={i.erpTrackingUrl} target="_blank" rel="noopener" className="link inline-flex items-center gap-1 text-xs">
            Rastreio no Trama <ExternalIcon className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </dl>
    );
  }

  return (
    <Card title="Fábrica e logística" description="Trama: reserva do estoque ou ordem de produção, rota e entrega.">
      <div data-testid="trama">{resumo}</div>
      {podeEnviar || podeRepetirCancelamento || (i.configured && i.status === "enviado") ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {podeEnviar || podeRepetirCancelamento ? (
            <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => run("enviar")}>
              {busy === "enviar"
                ? "Enviando…"
                : podeRepetirCancelamento
                  ? "Pedir o cancelamento de novo"
                  : i.status === null
                    ? "Enviar para o Trama"
                    : "Enviar de novo"}
            </Button>
          ) : null}
          {i.configured && i.status === "enviado" ? (
            <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("atualizar")}>
              {busy === "atualizar" ? "Conferindo…" : "Conferir agora"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="mt-2 text-sm text-success">
          {done}
        </p>
      ) : null}
    </Card>
  );
}

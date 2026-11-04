import "server-only";
import { isUuid } from "@/lib/catalog/slug";
import { createSessionClient } from "@/lib/supabase/server";
import { tramaLigada } from "@/lib/trama/config";

/** Situação do pedido no Trama (fábrica e logística), para o painel. Ver docs/INTEGRACAO-TRAMA.md. */
export type OrderIntegration = {
  configured: boolean;
  status: "pendente" | "enviando" | "enviado" | "erro" | "ignorado" | null;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  erpNumber: number | null;
  erpStatus: string | null;
  erpFinancialStatus: string | null;
  erpForecast: string | null;
  erpTrackingUrl: string | null;
  sentAt: string | null;
  syncedAt: string | null;
  cancelStatus: "pendente" | "feito" | "recusado" | null;
  cancelError: string | null;
};

export async function getOrderIntegration(orderId: string): Promise<OrderIntegration> {
  const empty: OrderIntegration = {
    configured: tramaLigada(),
    status: null,
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    erpNumber: null,
    erpStatus: null,
    erpFinancialStatus: null,
    erpForecast: null,
    erpTrackingUrl: null,
    sentAt: null,
    syncedAt: null,
    cancelStatus: null,
    cancelError: null,
  };
  if (!isUuid(orderId)) return empty;
  const supabase = await createSessionClient();
  const { data } = await supabase.from("order_integration").select("*").eq("order_id", orderId).maybeSingle();
  if (!data) return empty;
  const r = data as Record<string, unknown>;
  return {
    ...empty,
    status: r.status as OrderIntegration["status"],
    attempts: Number(r.attempts ?? 0),
    nextAttemptAt: (r.next_attempt_at as string | null) ?? null,
    lastError: (r.last_error as string | null) ?? null,
    erpNumber: (r.erp_number as number | null) ?? null,
    erpStatus: (r.erp_status as string | null) ?? null,
    erpFinancialStatus: (r.erp_financial_status as string | null) ?? null,
    erpForecast: (r.erp_forecast as string | null) ?? null,
    erpTrackingUrl: (r.erp_tracking_url as string | null) ?? null,
    sentAt: (r.sent_at as string | null) ?? null,
    syncedAt: (r.synced_at as string | null) ?? null,
    cancelStatus: (r.cancel_status as OrderIntegration["cancelStatus"]) ?? null,
    cancelError: (r.cancel_error as string | null) ?? null,
  };
}

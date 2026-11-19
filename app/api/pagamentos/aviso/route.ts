import { isOnlinePaymentEnabled } from "@/lib/payments";

/**
 * Aviso de pagamento do banco (webhook). Fica fechado até o Blue ser ligado (lib/payments).
 * Quando ligado: confere a assinatura, marca o pedido como pago de forma idempotente e responde 200.
 */
export async function POST() {
  if (!isOnlinePaymentEnabled()) {
    return Response.json({ ok: false, error: "Pagamento online ainda não está ligado." }, { status: 503 });
  }
  return Response.json({ ok: false, error: "Provedor de pagamento sem implementação." }, { status: 501 });
}

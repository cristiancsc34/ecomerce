import { NextResponse } from "next/server";
import { kickOrderNotifications } from "@/lib/notifications/order-dispatch";
import { assinaturaConfere } from "@/lib/trama/assinatura";
import { tramaWebhookSegredo } from "@/lib/trama/config";
import { WebhookDaTrama } from "@/lib/trama/contrato";
import { atualizarDaTrama } from "@/lib/trama/sincronizar";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Webhooks do Trama (fábrica e logística): pedido entrou em produção, ficou pronto, entrega agendada, saiu para
 * entrega, entregue, cancelado, pagamento confirmado. Ver docs/INTEGRACAO-TRAMA.md.
 *
 *   1. confere a assinatura HMAC do corpo cru (X-Trama-Assinatura) com TRAMA_WEBHOOK_SEGREDO;
 *   2. ignora entregas repetidas (X-Trama-Entrega);
 *   3. lê de novo a etapa atual pela API (o webhook só avisa; a fonte é o GET, que nunca chega fora de ordem)
 *      e aplica na linha do tempo do pedido.
 * Responde 2xx em até 10 s, senão o Trama tenta de novo (1 min, 5 min, 30 min, 2 h e 12 h).
 */
const MAX_CORPO = 64 * 1024;

export async function POST(request: Request) {
  const segredo = tramaWebhookSegredo();
  const supabase = createServiceClient();
  if (!segredo || !supabase) return NextResponse.json({ erro: "Integração com o Trama desligada." }, { status: 503 });

  const corpo = await request.text();
  if (corpo.length > MAX_CORPO) return NextResponse.json({ erro: "Corpo grande demais." }, { status: 413 });
  if (!assinaturaConfere(corpo, segredo, request.headers.get("x-trama-assinatura"))) {
    return NextResponse.json({ erro: "Assinatura inválida." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  const webhook = WebhookDaTrama.safeParse(json);
  if (!webhook.success) return NextResponse.json({ erro: "Formato inesperado." }, { status: 400 });

  const entrega = request.headers.get("x-trama-entrega")?.trim().slice(0, 100) || null;
  const code = webhook.data.pedido.referencia_externa;
  if (entrega) {
    const { error } = await supabase
      .from("trama_webhook_receipts")
      .insert({ delivery_id: entrega, event: webhook.data.evento.slice(0, 60), order_code: code.slice(0, 80) });
    if (error?.code === "23505") return NextResponse.json({ ok: true, repetido: true });
    if (error) return NextResponse.json({ erro: "Tente de novo." }, { status: 503 });
  }

  const resultado = await atualizarDaTrama({ code });
  if (!resultado.ok && resultado.repetir) {
    // Deixa o Trama mandar de novo: a entrega volta a valer.
    if (entrega) await supabase.from("trama_webhook_receipts").delete().eq("delivery_id", entrega);
    return NextResponse.json({ erro: "Tente de novo." }, { status: 503 });
  }
  if (resultado.ok && resultado.passos) kickOrderNotifications();
  // Pedido que não é desta loja (ou ainda não chegou ao Trama por aqui): nada a fazer, sem novas tentativas.
  return NextResponse.json(resultado.ok ? { ok: true, status: resultado.status } : { ok: true, ignorado: resultado.erro });
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { brand } from "@/config/brand";
import { processOrderNotifications } from "@/lib/notifications/order-dispatch";
import { configuredProviders } from "@/lib/notifications/providers";
import type { DeliveryMethod, OrderStatus } from "@/lib/orders/status";
import { createServiceClient } from "@/lib/supabase/service";
import { cancelarPedidoNaTrama, consultarPedidoNaTrama, criarPedidoNaTrama, type Fetch } from "./cliente";
import { tramaConfig, type TramaConfig } from "./config";
import type { PedidoConsultadoNaTrama } from "./contrato";
import { montarPedidoParaTrama, passosDaTrama, proximaTentativa, type PedidoDaLoja } from "./mapear";

/**
 * Loja ↔ Trama (fábrica e logística). Ver docs/INTEGRACAO-TRAMA.md.
 *
 *   * processarFilaDoTrama: envia os pedidos confirmados (fila order_integration) e os cancelamentos;
 *   * atualizarDaTrama: lê a etapa atual no Trama e aplica na loja (webhook, botão do painel e a rota agendada);
 *   * kickTrama: depois de cada mudança no painel, envia em segundo plano sem atrasar a tela.
 *
 * Tudo com a chave de serviço (o servidor é quem fala com o Trama). Nunca lança: o resultado de cada pedido fica
 * gravado na fila (com nova tentativa quando a falha é passageira).
 */

type Deps = { client?: SupabaseClient | null; config?: TramaConfig | null; fetcher?: Fetch; agora?: () => Date };

type FilaRow = {
  order_id: string;
  status: "pendente" | "enviando" | "enviado" | "erro" | "ignorado";
  attempts: number;
  cancel_status: "pendente" | "feito" | "recusado" | null;
  erp_status: string | null;
};

type ItemRow = {
  name: string;
  variant_name: string | null;
  unit_price_cents: number;
  quantity: number;
  sort_order: number;
  product: { sku: string | null } | null;
  variant: { sku: string | null } | null;
};

type OrderRow = Omit<PedidoDaLoja, "items"> & {
  id: string;
  scheduled_date: string | null;
  scheduled_window: string | null;
  items: ItemRow[];
};

const ORDER_COLUMNS =
  "id,code,status,customer_name,customer_phone,customer_email,whatsapp_opt_in,address,delivery_method,delivery_notes,assembly," +
  "shipping_cents,discount_cents,total_cents,payment_method,paid_at,scheduled_date,scheduled_window," +
  "items:order_items(name,variant_name,unit_price_cents,quantity,sort_order,product:products(sku),variant:product_variants(sku))";

async function lerPedido(supabase: SupabaseClient, orderId: string): Promise<OrderRow | null> {
  const { data, error } = await supabase.from("orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as OrderRow | null) ?? null;
}

const paraPedidoDaLoja = (o: OrderRow): PedidoDaLoja => ({
  ...o,
  items: o.items.map((i) => ({
    name: i.name,
    variant_name: i.variant_name,
    unit_price_cents: i.unit_price_cents,
    quantity: i.quantity,
    sort_order: i.sort_order,
    variant_sku: i.variant?.sku ?? null,
    product_sku: i.product?.sku ?? null,
  })),
});

const corta = (t: string) => t.slice(0, 480);

async function gravarFila(supabase: SupabaseClient, orderId: string, campos: Record<string, unknown>) {
  const { error } = await supabase.from("order_integration").update(campos).eq("order_id", orderId);
  if (error) throw new Error(error.message);
}

/** Aplica a etapa do Trama na loja (uma transação no banco: public.trama_apply). Devolve se algo mudou na linha do tempo. */
async function aplicar(
  supabase: SupabaseClient,
  pedido: Pick<OrderRow, "id" | "status" | "delivery_method" | "scheduled_date" | "scheduled_window">,
  consulta: Pick<PedidoConsultadoNaTrama, "numero" | "status" | "status_financeiro" | "previsao_entrega" | "entrega">,
  anterior: string | null,
  extra: { trackingUrl?: string | null } = {},
): Promise<{ passos: number; status: OrderStatus }> {
  const passos = passosDaTrama(consulta, pedido, anterior);
  const { data, error } = await supabase.rpc("trama_apply", {
    p_order_id: pedido.id,
    p_steps: passos,
    p_erp: {
      number: consulta.numero,
      status: consulta.status,
      financialStatus: consulta.status_financeiro,
      ...(consulta.previsao_entrega !== undefined ? { forecast: consulta.previsao_entrega ?? "" } : {}),
      ...(extra.trackingUrl ? { trackingUrl: extra.trackingUrl } : {}),
    },
  });
  if (error) throw new Error(error.message);
  return { passos: passos.length, status: data as OrderStatus };
}

type Resumo = { enviados: number; cancelados: number; repetir: number; erros: number; ignorados: number; etapas: number };

async function enviar(supabase: SupabaseClient, config: TramaConfig, row: FilaRow, deps: Required<Pick<Deps, "fetcher" | "agora">>, r: Resumo) {
  const pedido = await lerPedido(supabase, row.order_id);
  if (!pedido) {
    await gravarFila(supabase, row.order_id, { status: "ignorado", last_error: "Pedido não encontrado." });
    r.ignorados++;
    return;
  }
  if (pedido.status !== "pago" && pedido.status !== "em_preparacao") {
    await gravarFila(supabase, row.order_id, {
      status: "ignorado",
      last_error:
        pedido.status === "cancelado"
          ? "Pedido cancelado na loja antes de ir para o Trama."
          : "O pedido já tinha passado da preparação na loja; não foi enviado para a fábrica.",
    });
    r.ignorados++;
    return;
  }
  const montagem = montarPedidoParaTrama(paraPedidoDaLoja(pedido), brand.name);
  if (!montagem.ok) {
    await gravarFila(supabase, row.order_id, { status: "erro", last_error: corta(montagem.problemas.join(" ")) });
    r.erros++;
    return;
  }
  const resposta = await criarPedidoNaTrama(config, montagem.pedido, deps.fetcher);
  if (resposta.tipo === "ok") {
    const criado = resposta.dados;
    await gravarFila(supabase, row.order_id, { status: "enviado", sent_at: deps.agora().toISOString(), attempts: 0, last_error: null });
    // A primeira etapa já diz o caminho: reservado do estoque (pronto) ou aguardando a fábrica (confirmado).
    const aplicado = await aplicar(supabase, pedido, { ...criado, entrega: null }, null, { trackingUrl: criado.url_rastreio });
    r.enviados++;
    r.etapas += aplicado.passos;
    return;
  }
  if (resposta.tipo === "corrigir") {
    await gravarFila(supabase, row.order_id, { status: "erro", last_error: corta(resposta.mensagem) });
    r.erros++;
    return;
  }
  const quando = resposta.esperarSegundos
    ? new Date(deps.agora().getTime() + resposta.esperarSegundos * 1000)
    : proximaTentativa(row.attempts, deps.agora());
  if (!quando) {
    await gravarFila(supabase, row.order_id, { status: "erro", last_error: corta(`${resposta.mensagem} (desisti depois de ${row.attempts} tentativas)`) });
    r.erros++;
    return;
  }
  await gravarFila(supabase, row.order_id, { status: "pendente", next_attempt_at: quando.toISOString(), last_error: corta(resposta.mensagem) });
  r.repetir++;
}

async function cancelar(supabase: SupabaseClient, config: TramaConfig, row: FilaRow, deps: Required<Pick<Deps, "fetcher" | "agora">>, r: Resumo) {
  const { data } = await supabase.from("orders").select("code").eq("id", row.order_id).maybeSingle();
  const code = (data as { code: string } | null)?.code;
  if (!code) {
    await gravarFila(supabase, row.order_id, { cancel_status: "feito" });
    return;
  }
  const resposta = await cancelarPedidoNaTrama(config, code, "Pedido cancelado na loja.", deps.fetcher);
  if (resposta.tipo === "ok" || (resposta.tipo === "corrigir" && resposta.http === 404)) {
    await gravarFila(supabase, row.order_id, { cancel_status: "feito", cancel_error: null, ...(resposta.tipo === "ok" ? { erp_status: "cancelado" } : {}) });
    r.cancelados++;
    return;
  }
  if (resposta.tipo === "corrigir") {
    // 409: já está em produção ou a caminho. O cancelamento precisa ser feito no Trama, por alguém da loja.
    await gravarFila(supabase, row.order_id, { cancel_status: "recusado", cancel_error: corta(resposta.mensagem) });
    r.erros++;
    return;
  }
  const quando = proximaTentativa(row.attempts, deps.agora());
  await gravarFila(
    supabase,
    row.order_id,
    quando
      ? { next_attempt_at: quando.toISOString(), cancel_error: corta(resposta.mensagem) }
      : { cancel_status: "recusado", cancel_error: corta(`${resposta.mensagem} (desisti depois de ${row.attempts} tentativas)`) },
  );
  if (quando) r.repetir++;
  else r.erros++;
}

/** Envia o que está vencido na fila: pedidos confirmados e cancelamentos. */
export async function processarFilaDoTrama({ limit = 20, ...deps }: Deps & { limit?: number } = {}): Promise<Resumo> {
  const r: Resumo = { enviados: 0, cancelados: 0, repetir: 0, erros: 0, ignorados: 0, etapas: 0 };
  const config = deps.config === undefined ? tramaConfig() : deps.config;
  const supabase = deps.client === undefined ? createServiceClient() : deps.client;
  if (!config || !supabase) return r;
  const d = { fetcher: deps.fetcher ?? fetch, agora: deps.agora ?? (() => new Date()) };
  try {
    const { data, error } = await supabase.rpc("claim_order_integrations", { p_limit: limit });
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as FilaRow[]) {
      try {
        if (row.status === "enviado" && row.cancel_status === "pendente") await cancelar(supabase, config, row, d, r);
        else await enviar(supabase, config, row, d, r);
      } catch (e) {
        // Falha ao gravar no banco: o item fica em "enviando" e volta sozinho em 10 minutos.
        console.error("trama: falha no pedido da fila", row.order_id, e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error("trama: falha ao ler a fila", e instanceof Error ? e.message : e);
  }
  return r;
}

export type Atualizacao = { ok: true; status: OrderStatus; passos: number } | { ok: false; erro: string; repetir: boolean };

/** Lê a etapa atual do pedido no Trama e aplica na loja. `orderId` ou o código do pedido (referência no Trama). */
export async function atualizarDaTrama(alvo: { orderId: string } | { code: string }, deps: Deps = {}): Promise<Atualizacao> {
  const config = deps.config === undefined ? tramaConfig() : deps.config;
  const supabase = deps.client === undefined ? createServiceClient() : deps.client;
  if (!config || !supabase) return { ok: false, erro: "A integração com o Trama não está configurada.", repetir: false };
  const coluna = "orderId" in alvo ? "id" : "code";
  const valor = "orderId" in alvo ? alvo.orderId : alvo.code;
  const { data: o, error } = await supabase
    .from("orders")
    .select("id,code,status,delivery_method,scheduled_date,scheduled_window,integration:order_integration(status,erp_status)")
    .eq(coluna, valor)
    .maybeSingle();
  if (error) return { ok: false, erro: "Não foi possível ler o pedido.", repetir: true };
  const pedido = o as
    | {
        id: string;
        code: string;
        status: OrderStatus;
        delivery_method: DeliveryMethod;
        scheduled_date: string | null;
        scheduled_window: string | null;
        integration: { status: string; erp_status: string | null } | { status: string; erp_status: string | null }[] | null;
      }
    | null;
  const integracao = Array.isArray(pedido?.integration) ? pedido.integration[0] : pedido?.integration;
  if (!pedido || integracao?.status !== "enviado") return { ok: false, erro: "Este pedido ainda não está no Trama.", repetir: false };
  const resposta = await consultarPedidoNaTrama(config, pedido.code, deps.fetcher ?? fetch);
  if (resposta.tipo !== "ok") return { ok: false, erro: resposta.mensagem, repetir: resposta.tipo === "repetir" };
  try {
    const aplicado = await aplicar(supabase, pedido, resposta.dados, integracao.erp_status);
    return { ok: true, ...aplicado };
  } catch (e) {
    console.error("trama: falha ao aplicar a etapa", pedido.code, e instanceof Error ? e.message : e);
    return { ok: false, erro: "Não foi possível gravar a etapa do Trama.", repetir: true };
  }
}

/**
 * Rede de segurança dos webhooks: confere no Trama os pedidos ainda abertos que estão há mais tempo sem conferência.
 * Usada pela rota agendada.
 */
export async function atualizarPedidosAbertos({ limit = 20, ...deps }: Deps & { limit?: number } = {}): Promise<{ conferidos: number; etapas: number }> {
  const supabase = deps.client === undefined ? createServiceClient() : deps.client;
  const r = { conferidos: 0, etapas: 0 };
  if (!supabase || !(deps.config === undefined ? tramaConfig() : deps.config)) return r;
  const { data } = await supabase
    .from("order_integration")
    .select("order_id")
    .eq("status", "enviado")
    .or("erp_status.is.null,erp_status.not.in.(entregue,cancelado,devolvido)")
    .order("synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  for (const { order_id } of (data ?? []) as { order_id: string }[]) {
    const a = await atualizarDaTrama({ orderId: order_id }, { ...deps, client: supabase });
    r.conferidos++;
    if (a.ok) r.etapas += a.passos;
  }
  return r;
}

/** Avisos ao cliente das etapas que acabaram de entrar (só se o dono ligou e há provedor). */
export async function enviarAvisosDasEtapas() {
  if (configuredProviders().length) await processOrderNotifications();
}

/** Depois de responder (painel ou checkout), envia a fila ao Trama sem atrasar a tela. */
export function kickTrama() {
  if (!tramaConfig()) return;
  after(async () => {
    const r = await processarFilaDoTrama();
    if (r.etapas) await enviarAvisosDasEtapas();
  });
}

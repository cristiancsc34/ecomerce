import { NEXT_STATUSES, type DeliveryMethod, type OrderAddress, type OrderStatus, type PaymentMethod } from "@/lib/orders/status";
import type { FormaPagamentoTrama, JanelaTrama, PedidoConsultadoNaTrama, PedidoParaTrama, StatusTrama } from "./contrato";

/**
 * Regras puras da integração loja ↔ Trama (testadas em tests/unit/trama.test.ts):
 *   * pedido da loja → corpo do POST /api/v1/pedidos;
 *   * etapa no Trama → etapas na loja (a linha do tempo que o cliente acompanha).
 * Nada inventado: o recado ao cliente só descreve o que aconteceu no Trama; prazo, só a data agendada lá.
 */

// -----------------------------------------------------------------------------
// Loja → Trama
// -----------------------------------------------------------------------------

export type PedidoDaLoja = {
  code: string;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  whatsapp_opt_in: boolean;
  address: OrderAddress;
  delivery_method: DeliveryMethod;
  delivery_notes: string | null;
  assembly: boolean;
  shipping_cents: number | null;
  discount_cents: number;
  total_cents: number;
  payment_method: PaymentMethod | null;
  paid_at: string | null;
  items: {
    name: string;
    variant_name: string | null;
    unit_price_cents: number;
    quantity: number;
    sort_order: number;
    /** SKU da variação, se tiver; senão o do produto. Precisa ser o mesmo SKU cadastrado no Trama. */
    variant_sku: string | null;
    product_sku: string | null;
  }[];
};

const FORMA: Record<PaymentMethod, FormaPagamentoTrama> = {
  pix: "pix",
  cartao: "cartao_credito",
  boleto: "boleto",
  dinheiro: "dinheiro",
  // Link de pagamento e "outro": o dinheiro já entrou; no Trama fica como transferência (a forma real vai na observação).
  link: "transferencia",
  outro: "transferencia",
};

const PAGAMENTO_TEXTO: Record<PaymentMethod, string> = {
  pix: "Pix",
  cartao: "cartão",
  boleto: "boleto",
  dinheiro: "dinheiro",
  link: "link de pagamento",
  outro: "outra forma",
};

const corta = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

export type MontagemDoPedido = { ok: true; pedido: PedidoParaTrama } | { ok: false; problemas: string[] };

/**
 * Monta o pedido no formato do Trama. Problemas que só uma pessoa resolve (item sem SKU, endereço incompleto)
 * voltam como lista, sem chamar a API.
 */
export function montarPedidoParaTrama(p: PedidoDaLoja, nomeDaLoja: string): MontagemDoPedido {
  const problemas: string[] = [];
  const itens = [...p.items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => {
      const sku = (i.variant_sku ?? i.product_sku ?? "").trim();
      if (!sku) problemas.push(`"${i.name}${i.variant_name ? ` · ${i.variant_name}` : ""}" está sem SKU no catálogo da loja.`);
      // Variação sem SKU própria (ex.: cor ou tecido escolhido): vai para a fábrica como acabamento combinado.
      const personalizacao = !i.variant_sku && i.variant_name ? `Variação escolhida: ${i.variant_name}` : undefined;
      return {
        sku,
        quantidade: i.quantity,
        preco_unitario_centavos: i.unit_price_cents,
        desconto_centavos: 0 as const,
        ...(personalizacao ? { personalizacao: corta(personalizacao, 2000) } : {}),
      };
    });
  if (!itens.length) problemas.push("O pedido não tem itens.");
  if (itens.length > 30) problemas.push("O Trama aceita até 30 itens por pedido.");
  if (itens.some((i) => i.quantidade > 50)) problemas.push("O Trama aceita até 50 unidades do mesmo item.");

  const retirada = p.delivery_method === "retirada";
  const a = p.address ?? {};
  const cep = (a.cep ?? "").replace(/\D/g, "");
  if (!retirada) {
    if (cep.length !== 8) problemas.push("Endereço sem CEP válido.");
    for (const [campo, rotulo] of [
      ["rua", "rua"],
      ["bairro", "bairro"],
      ["cidade", "cidade"],
    ] as const) {
      if (!a[campo]?.trim()) problemas.push(`Endereço sem ${rotulo}.`);
    }
    if (!/^[A-Za-z]{2}$/.test(a.uf?.trim() ?? "")) problemas.push("Endereço sem UF.");
  }
  if (problemas.length) return { ok: false, problemas };

  const pago = p.paid_at !== null;
  const observacoes = [
    `Pedido ${p.code} da loja ${nomeDaLoja}.`,
    p.delivery_method === "transportadora" ? "Forma de entrega escolhida na loja: transportadora." : null,
    p.delivery_notes ? `Acesso para a entrega: ${p.delivery_notes}` : null,
    p.assembly ? "Inclui montagem." : null,
    pago && p.payment_method ? `Pagamento confirmado pela loja: ${PAGAMENTO_TEXTO[p.payment_method]}.` : null,
    !pago ? "Pagamento na entrega (combinado pela loja)." : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ok: true,
    pedido: {
      referencia_externa: p.code,
      cliente: {
        nome: corta(p.customer_name.trim(), 160),
        email: p.customer_email?.trim().toLowerCase() || null,
        telefone: p.customer_phone || null,
        documento: null,
        aceita_marketing: false,
        notificar_whatsapp: p.whatsapp_opt_in,
      },
      entrega: retirada
        ? { modalidade: "retirada", endereco: null }
        : {
            modalidade: "entrega",
            endereco: {
              cep,
              logradouro: corta(a.rua!.trim(), 200),
              numero: corta(a.numero?.trim() || "s/n", 20),
              complemento: a.complemento?.trim() ? corta(a.complemento.trim(), 120) : null,
              bairro: corta(a.bairro!.trim(), 120),
              cidade: corta(a.cidade!.trim(), 120),
              uf: a.uf!.trim().toUpperCase(),
              referencia: a.referencia?.trim() ? corta(a.referencia.trim(), 200) : null,
            },
          },
      itens,
      frete_centavos: p.shipping_cents ?? 0,
      desconto_centavos: p.discount_cents,
      pagamento: pago
        ? {
            situacao: "pago",
            forma: p.payment_method ? FORMA[p.payment_method] : "transferencia",
            valor_centavos: p.total_cents,
            // Sem gateway: a confirmação foi feita pela equipe da loja; o número do pedido identifica o pagamento.
            id_transacao_gateway: `loja:${p.code}`,
          }
        : { situacao: "na_entrega" },
      observacoes: corta(observacoes, 2000),
    },
  };
}

// -----------------------------------------------------------------------------
// Trama → loja
// -----------------------------------------------------------------------------

export type PassoNaLoja = {
  status: OrderStatus;
  note?: string;
  delivery?: { scheduledDate: string | null; scheduledWindow: string | null };
};

export const ROTULO_STATUS_TRAMA: Record<StatusTrama, string> = {
  confirmado: "Confirmado, aguardando a fábrica ou a reserva",
  em_producao: "Em produção na fábrica",
  pronto_para_envio: "Pronto, aguardando a entrega",
  agendado: "Entrega agendada",
  em_rota: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
};

export const ROTULO_JANELA: Record<JanelaTrama, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  comercial: "Horário comercial",
};

/**
 * Caminho mais curto de uma etapa da loja até outra, pela ordem da loja (NEXT_STATUSES). Cancelar e devolver só
 * entram quando são o destino. null = não dá para chegar (ex.: de "entregue" para "em preparação").
 */
export function caminhoNaLoja(de: OrderStatus, para: OrderStatus): OrderStatus[] | null {
  if (de === para) return [];
  const finais: OrderStatus[] = ["cancelado", "devolucao_solicitada", "devolvido"];
  const anterior = new Map<OrderStatus, OrderStatus>();
  const fila: OrderStatus[] = [de];
  const visto = new Set<OrderStatus>([de]);
  while (fila.length) {
    const atual = fila.shift()!;
    for (const proximo of NEXT_STATUSES[atual]) {
      if (visto.has(proximo)) continue;
      if (proximo !== para && finais.includes(proximo) && !finais.includes(para)) continue;
      visto.add(proximo);
      anterior.set(proximo, atual);
      if (proximo === para) {
        const caminho: OrderStatus[] = [para];
        let s = atual;
        while (s !== de) {
          caminho.unshift(s);
          s = anterior.get(s)!;
        }
        return caminho;
      }
      fila.push(proximo);
    }
  }
  return null;
}

/** Leva o pedido até `alvo`, com o recado e a entrega só na última etapa. Sem caminho: só o recado na etapa atual. */
function ate(atual: OrderStatus, alvo: OrderStatus, ultimo: Omit<PassoNaLoja, "status"> = {}): PassoNaLoja[] {
  const caminho = caminhoNaLoja(atual, alvo);
  if (caminho === null) return ultimo.note ? [{ status: atual, ...ultimo, delivery: undefined }] : [];
  if (!caminho.length) return ultimo.note || ultimo.delivery ? [{ status: atual, ...ultimo }] : [];
  return caminho.map((status, i) => (i === caminho.length - 1 ? { status, ...ultimo } : { status }));
}

/**
 * O que muda na loja quando o Trama está em `consulta.status`. `anterior` é a última etapa do Trama já aplicada
 * (null na primeira vez): sem mudança lá, nada muda aqui (a não ser a data da entrega remarcada).
 */
export function passosDaTrama(
  consulta: Pick<PedidoConsultadoNaTrama, "status" | "entrega">,
  pedido: { status: OrderStatus; delivery_method: DeliveryMethod; scheduled_date: string | null; scheduled_window: string | null },
  anterior: string | null,
): PassoNaLoja[] {
  const atual = pedido.status;
  const retirada = pedido.delivery_method === "retirada";
  const mudou = consulta.status !== anterior;
  switch (consulta.status) {
    case "confirmado":
      return [];
    case "em_producao":
      if (!mudou) return [];
      return ate(atual, "em_preparacao", { note: "Seu pedido entrou em produção na fábrica." });
    case "pronto_para_envio": {
      if (!mudou) return [];
      // Voltou da rota sem entregar (ou a entrega foi desmarcada): a data vai ser combinada de novo.
      if (atual === "saiu_para_entrega" || atual === "enviado") {
        return ate(atual, "enviado", {
          note: "Não foi possível entregar na data combinada. Vamos combinar uma nova data com você.",
          delivery: { scheduledDate: null, scheduledWindow: null },
        });
      }
      return ate(atual, "em_preparacao", {
        note: retirada ? "Seu pedido está pronto para retirar na loja." : "Seu pedido está pronto. Vamos combinar a data da entrega com você.",
      });
    }
    case "agendado": {
      const data = consulta.entrega?.data ?? null;
      const janela = consulta.entrega?.janela ? ROTULO_JANELA[consulta.entrega.janela] : null;
      const remarcou = data !== pedido.scheduled_date || janela !== pedido.scheduled_window;
      if (!mudou && !remarcou) return [];
      return ate(atual, "enviado", { note: "Entrega agendada.", delivery: { scheduledDate: data, scheduledWindow: janela } });
    }
    case "em_rota":
      return mudou ? ate(atual, "saiu_para_entrega") : [];
    case "entregue":
      return mudou ? ate(atual, "entregue", { note: retirada ? "Pedido retirado na loja." : "Pedido entregue." }) : [];
    case "cancelado":
      return mudou ? ate(atual, "cancelado", { note: "Pedido cancelado." }) : [];
    case "devolvido":
      return mudou ? ate(atual, "devolvido") : [];
  }
}

// -----------------------------------------------------------------------------
// Novas tentativas
// -----------------------------------------------------------------------------

/** Depois de cada falha passageira (rede, Trama fora do ar): 1 min, 5 min, 30 min, 2 h e 12 h; depois, erro. */
export const ESPERA_MINUTOS = [1, 5, 30, 120, 720] as const;

export function proximaTentativa(tentativas: number, agora: Date): Date | null {
  const minutos = ESPERA_MINUTOS[tentativas - 1];
  return minutos === undefined ? null : new Date(agora.getTime() + minutos * 60_000);
}

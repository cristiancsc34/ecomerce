/**
 * Etapas do pedido, do registro à entrega (espelha supabase/migrations/20261103000100_orders.sql).
 * Textos para a equipe (painel) e para o cliente (página "Acompanhar pedido").
 * Ver docs/LOGISTICA.md.
 */

export const ORDER_STATUSES = [
  "recebido",
  "pago",
  "em_preparacao",
  "enviado",
  "saiu_para_entrega",
  "entregue",
  "cancelado",
  "devolucao_solicitada",
  "devolvido",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const DELIVERY_METHODS = ["entrega_propria", "transportadora", "retirada"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const PAYMENT_METHODS = ["pix", "cartao", "boleto", "dinheiro", "link", "outro"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  recebido: "Pedido recebido",
  pago: "Pagamento confirmado",
  em_preparacao: "Em preparação",
  enviado: "Enviado",
  saiu_para_entrega: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
  devolucao_solicitada: "Troca ou devolução solicitada",
  devolvido: "Devolvido",
};

export const DELIVERY_LABEL: Record<DeliveryMethod, string> = {
  entrega_propria: "Entrega da loja",
  transportadora: "Transportadora",
  retirada: "Retirada na loja",
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  cartao: "Cartão",
  boleto: "Boleto",
  dinheiro: "Dinheiro",
  link: "Link de pagamento",
  outro: "Outro",
};

/** Ordem das etapas (a mesma regra do banco: private.order_transition_allowed). */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  recebido: ["pago", "em_preparacao", "cancelado"],
  pago: ["em_preparacao", "cancelado"],
  em_preparacao: ["enviado", "saiu_para_entrega", "entregue", "cancelado"],
  enviado: ["saiu_para_entrega", "entregue", "cancelado"],
  saiu_para_entrega: ["entregue", "enviado"],
  entregue: ["devolucao_solicitada"],
  devolucao_solicitada: ["devolvido", "entregue"],
  cancelado: [],
  devolvido: [],
};

export const canMoveTo = (from: OrderStatus, to: OrderStatus) => NEXT_STATUSES[from].includes(to);

export const OPEN_STATUSES: OrderStatus[] = ["recebido", "pago", "em_preparacao", "enviado", "saiu_para_entrega", "devolucao_solicitada"];
export const isOpen = (status: OrderStatus) => OPEN_STATUSES.includes(status);

/** Botões de próximo passo no painel, do mais comum ao menos comum, conforme a forma de entrega. */
export function staffActions(status: OrderStatus, method: DeliveryMethod): { to: OrderStatus; label: string; primary?: boolean }[] {
  const actions: Record<OrderStatus, { to: OrderStatus; label: string; primary?: boolean }[]> = {
    recebido: [
      { to: "pago", label: "Confirmar pagamento", primary: true },
      { to: "em_preparacao", label: "Preparar sem pagamento (paga na entrega)" },
      { to: "cancelado", label: "Cancelar pedido" },
    ],
    pago: [
      { to: "em_preparacao", label: "Começar a preparar", primary: true },
      { to: "cancelado", label: "Cancelar pedido" },
    ],
    em_preparacao:
      method === "retirada"
        ? [
            { to: "entregue", label: "Cliente retirou", primary: true },
            { to: "cancelado", label: "Cancelar pedido" },
          ]
        : method === "transportadora"
          ? [
              { to: "enviado", label: "Entregar à transportadora", primary: true },
              { to: "cancelado", label: "Cancelar pedido" },
            ]
          : [
              { to: "enviado", label: "Agendar a entrega", primary: true },
              { to: "saiu_para_entrega", label: "Saiu para entrega agora" },
              { to: "cancelado", label: "Cancelar pedido" },
            ],
    enviado: [
      { to: "saiu_para_entrega", label: "Saiu para entrega", primary: true },
      { to: "entregue", label: "Marcar como entregue" },
      { to: "cancelado", label: "Cancelar pedido" },
    ],
    saiu_para_entrega: [
      { to: "entregue", label: "Marcar como entregue", primary: true },
      { to: "enviado", label: "Não deu para entregar (reagendar)" },
    ],
    entregue: [{ to: "devolucao_solicitada", label: "Cliente pediu troca ou devolução" }],
    devolucao_solicitada: [
      { to: "devolvido", label: "Produto devolvido", primary: true },
      { to: "entregue", label: "Cliente desistiu da devolução" },
    ],
    cancelado: [],
    devolvido: [],
  };
  return actions[status];
}

/** O que o cliente lê em cada etapa (página "Acompanhar pedido"). Nada de prazo inventado. */
export const CUSTOMER_STATUS_TEXT: Record<OrderStatus, string> = {
  recebido: "Recebemos o seu pedido. Assim que o pagamento for confirmado, começamos a preparar.",
  pago: "Pagamento confirmado. O seu pedido entra na fila de preparação.",
  em_preparacao: "Estamos separando e embalando o seu pedido com cuidado.",
  enviado: "Seu pedido já está a caminho ou com a entrega agendada. Veja os detalhes abaixo.",
  saiu_para_entrega: "O seu pedido saiu para entrega hoje. Deixe alguém no endereço para receber.",
  entregue: "Pedido entregue. Esperamos que você goste!",
  cancelado: "Este pedido foi cancelado. Se tiver dúvidas, fale com o atendimento.",
  devolucao_solicitada: "Recebemos o seu pedido de troca ou devolução e vamos combinar a retirada com você.",
  devolvido: "A devolução foi concluída.",
};

/** Linha do tempo "feliz" que o cliente vê (as etapas que faltam aparecem apagadas). */
export function customerSteps(method: DeliveryMethod): OrderStatus[] {
  if (method === "retirada") return ["recebido", "pago", "em_preparacao", "entregue"];
  return ["recebido", "pago", "em_preparacao", "enviado", "saiu_para_entrega", "entregue"];
}

/** Celular do Brasil com DDD → só dígitos com 55. Outros formatos: só dígitos. Vazio → null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** 5511987654321 → (11) 98765-4321. */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return `+${digits}`;
}

export type OrderAddress = {
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  referencia?: string;
};

export function formatAddress(a: OrderAddress): string {
  const line1 = [a.rua, a.numero].filter(Boolean).join(", ");
  const line2 = [a.complemento, a.bairro].filter(Boolean).join(" · ");
  const line3 = [a.cidade, a.uf].filter(Boolean).join("/");
  const cep = a.cep ? `CEP ${a.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : "";
  return [line1, line2, [line3, cep].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
}

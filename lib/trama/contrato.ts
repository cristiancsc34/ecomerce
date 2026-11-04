import { z } from "zod";

/**
 * Contrato da API v1 do Trama (plataforma da fábrica e da logística), como está em docs/14-api-ecommerce.md do
 * repositório do Trama. Só o que a loja usa. Valores em centavos; datas "AAAA-MM-DD".
 */

export const STATUS_TRAMA = [
  "confirmado",
  "em_producao",
  "pronto_para_envio",
  "agendado",
  "em_rota",
  "entregue",
  "cancelado",
  "devolvido",
] as const;
export type StatusTrama = (typeof STATUS_TRAMA)[number];

export const JANELAS_TRAMA = ["manha", "tarde", "comercial"] as const;
export type JanelaTrama = (typeof JANELAS_TRAMA)[number];

export type FormaPagamentoTrama = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "boleto" | "transferencia";

/** Corpo do POST /api/v1/pedidos. */
export type PedidoParaTrama = {
  referencia_externa: string;
  cliente: {
    nome: string;
    email: string | null;
    telefone: string | null;
    documento: null;
    aceita_marketing: false;
    notificar_whatsapp: boolean;
  };
  entrega: {
    modalidade: "entrega" | "retirada";
    endereco: {
      cep: string;
      logradouro: string;
      numero: string;
      complemento: string | null;
      bairro: string;
      cidade: string;
      uf: string;
      referencia: string | null;
    } | null;
  };
  itens: { sku: string; quantidade: number; preco_unitario_centavos: number; desconto_centavos: 0; personalizacao?: string }[];
  frete_centavos: number;
  desconto_centavos: number;
  pagamento:
    | { situacao: "na_entrega" }
    | { situacao: "pago"; forma: FormaPagamentoTrama; valor_centavos: number; id_transacao_gateway: string };
  observacoes: string | null;
};

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Resposta do POST /api/v1/pedidos (201 criado; 200 quando o mesmo pedido já estava lá). */
export const PedidoCriadoNaTrama = z.object({
  numero: z.number().int().positive(),
  status: z.enum(STATUS_TRAMA),
  status_financeiro: z.string().regex(/^[a-z_]{3,30}$/),
  previsao_entrega: data.nullable().optional(),
  url_rastreio: z.string().regex(/^https?:\/\//).max(500).nullable().optional(),
});
export type PedidoCriadoNaTrama = z.infer<typeof PedidoCriadoNaTrama>;

/** Resposta do GET /api/v1/pedidos/{referencia_externa}. */
export const PedidoConsultadoNaTrama = z.object({
  numero: z.number().int().positive(),
  referencia_externa: z.string(),
  status: z.enum(STATUS_TRAMA),
  status_financeiro: z.string().regex(/^[a-z_]{3,30}$/),
  previsao_entrega: data.nullable().optional(),
  entrega: z
    .object({ data: data.nullable().optional(), janela: z.enum(JANELAS_TRAMA).nullable().optional() })
    .nullable()
    .optional(),
});
export type PedidoConsultadoNaTrama = z.infer<typeof PedidoConsultadoNaTrama>;

/** Erro padrão da API: { erro: { codigo, mensagem, campos? } }. */
export const ErroDaTrama = z.object({
  erro: z.object({
    codigo: z.string().max(80),
    mensagem: z.string().max(500),
    campos: z.record(z.string(), z.string()).optional(),
  }),
});

/** Corpo do webhook (X-Trama-Evento). A loja usa só a referência: o estado atual é lido de novo pela API. */
export const WebhookDaTrama = z.object({
  evento: z.string().regex(/^[a-z_.]{3,60}$/),
  pedido: z.object({ referencia_externa: z.string().min(1).max(80) }),
});

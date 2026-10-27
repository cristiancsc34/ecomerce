/**
 * Avisos de pedido por WhatsApp e e-mail — ESTRUTURA. Nenhum provedor real
 * está ligado: o envio de verdade entra quando o checkout e o provedor forem
 * escolhidos (ver docs/NOTIFICACOES.md).
 */

export type NotificationChannel = "email" | "whatsapp";
export type OrderEvent = "pedido_confirmado" | "pedido_enviado" | "pedido_entregue";

/** Só o necessário para avisar o cliente. Valores vêm do pedido gravado no servidor, nunca do navegador. */
export type OrderForNotification = {
  /** Id interno do pedido (vira parte da chave de idempotência). */
  id: string;
  /** Código que o cliente vê, ex.: "CX-1042". */
  code: string;
  customer: {
    name: string;
    email: string | null;
    /** Número com DDI, só dígitos, ex.: "5548999990000". */
    whatsapp: string | null;
    /** WhatsApp só com consentimento explícito no checkout (regra do WhatsApp e LGPD). */
    whatsappOptIn: boolean;
  };
  items: { name: string; quantity: number; unitPriceCents: number }[];
  totalCents: number;
  /** null = frete ainda não calculado/informado: a mensagem não cita frete. */
  shippingCents: number | null;
  /** Link de rastreio, quando houver (pedido enviado). */
  trackingUrl: string | null;
};

/**
 * Mensagem pronta para um canal. No WhatsApp, avisos iniciados pela loja
 * exigem modelo (template) aprovado pela Meta: `template` leva o nome e os
 * parâmetros; `text` é a mesma mensagem por extenso (prévia e testes).
 */
export type OutgoingMessage = {
  channel: NotificationChannel;
  event: OrderEvent;
  to: string;
  text: string;
  email?: { subject: string; html: string };
  template?: { name: OrderEvent; language: "pt_BR"; params: string[] };
};

export interface NotificationProvider {
  channel: NotificationChannel;
  /** Nome do provedor (ex.: "teste", "resend", "whatsapp-cloud"). */
  name: string;
  send(message: OutgoingMessage): Promise<{ providerMessageId: string }>;
}

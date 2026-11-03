import { formatPrice } from "@/lib/catalog/money";
import { type DeliveryMethod, type OrderStatus } from "./status";

/**
 * Mensagens de WhatsApp para avisar o cliente a cada etapa. Enquanto não há um
 * provedor de envio automático (docs/NOTIFICACOES.md), a equipe envia com um
 * toque: o painel abre o WhatsApp com o texto pronto.
 *
 * Regras (as mesmas dos avisos automáticos): só dados do pedido; nenhum prazo
 * prometido além da data que a equipe agendou; rastreio só com link https.
 */
export type OrderMessageInput = {
  brandName: string;
  code: string;
  customerName: string;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  trackingLink: string;
  items: { name: string; variantName: string | null; quantity: number }[];
  totalCents: number;
  carrier: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  scheduledDate: string | null;
  scheduledWindow: string | null;
  publicNote?: string | null;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" });

/** "2026-11-10" → "terça-feira, 10/11". */
export function formatDeliveryDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

export function orderMessage(o: OrderMessageInput): string {
  const firstName = o.customerName.trim().split(/\s+/)[0];
  const items = o.items.map((i) => `${i.quantity}× ${i.name}${i.variantName ? ` (${i.variantName})` : ""}`).join("\n");
  const when = o.scheduledDate ? `${formatDeliveryDate(o.scheduledDate)}${o.scheduledWindow ? `, ${o.scheduledWindow}` : ""}` : null;
  const tracking = o.trackingUrl?.startsWith("https://") ? o.trackingUrl : null;
  const lines: (string | null)[] = [`Olá, ${firstName}!`];

  switch (o.status) {
    case "recebido":
      lines.push(`Recebemos o seu pedido ${o.code} na ${o.brandName}:`, "", items, `Total: ${formatPrice(o.totalCents)}`);
      break;
    case "pago":
      lines.push(`Pagamento confirmado! O seu pedido ${o.code} entrou na fila de preparação.`);
      break;
    case "em_preparacao":
      lines.push(`O seu pedido ${o.code} está sendo preparado.`);
      break;
    case "enviado":
      if (o.deliveryMethod === "transportadora") {
        lines.push(`O seu pedido ${o.code} foi enviado${o.carrier ? ` pela ${o.carrier}` : ""}.`);
        if (o.trackingCode) lines.push(`Código de rastreio: ${o.trackingCode}`);
        if (tracking) lines.push(`Rastreio: ${tracking}`);
      } else {
        lines.push(when ? `A entrega do pedido ${o.code} está agendada para ${when}.` : `O seu pedido ${o.code} está a caminho.`);
      }
      break;
    case "saiu_para_entrega":
      lines.push(`O seu pedido ${o.code} saiu para entrega hoje. Por favor, deixe alguém no endereço para receber.`);
      break;
    case "entregue":
      lines.push(
        `O seu pedido ${o.code} foi entregue. Esperamos que você goste!`,
        "Se algo chegou diferente do combinado, responda esta mensagem com fotos.",
      );
      break;
    case "cancelado":
      lines.push(`O seu pedido ${o.code} foi cancelado. Se tiver alguma dúvida, é só responder esta mensagem.`);
      break;
    case "devolucao_solicitada":
      lines.push(`Recebemos o seu pedido de troca ou devolução do pedido ${o.code}. Vamos combinar a retirada com você.`);
      break;
    case "devolvido":
      lines.push(`A devolução do pedido ${o.code} foi concluída.`);
      break;
  }
  if (o.publicNote?.trim()) lines.push("", o.publicNote.trim());
  lines.push("", `Acompanhe o pedido: ${o.trackingLink}`);
  return lines.filter((l) => l !== null).join("\n");
}

/** Link que abre o WhatsApp do cliente com a mensagem pronta (o número precisa ter DDI). */
export function whatsappMessageLink(phoneDigits: string, text: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

/** Link de acompanhamento que vai para o cliente (página pública, com o código secreto do pedido). */
export function trackingLink(siteUrl: string, code: string, token: string): string {
  return `${siteUrl}/pedido/${encodeURIComponent(code)}?t=${token}`;
}

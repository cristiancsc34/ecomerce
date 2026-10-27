import { brand } from "@/config/brand";
import { formatPrice } from "@/lib/catalog/money";
import type { OrderEvent, OrderForNotification, OutgoingMessage } from "./types";

/**
 * Textos dos avisos. Só citam o que está no pedido: nada de prazo de entrega,
 * brinde ou promessa que a loja não confirmou. Frete só aparece se informado.
 */

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "cliente";
}

const HEADLINES: Record<OrderEvent, (code: string) => string> = {
  pedido_confirmado: (code) => `Pagamento confirmado! Recebemos o seu pedido ${code}.`,
  pedido_enviado: (code) => `Seu pedido ${code} foi enviado.`,
  pedido_entregue: (code) => `Seu pedido ${code} foi entregue.`,
};

const SUBJECTS: Record<OrderEvent, (code: string) => string> = {
  pedido_confirmado: (code) => `Pedido ${code} confirmado — ${brand.name}`,
  pedido_enviado: (code) => `Pedido ${code} enviado — ${brand.name}`,
  pedido_entregue: (code) => `Pedido ${code} entregue — ${brand.name}`,
};

function summaryLines(order: OrderForNotification): string[] {
  const lines = order.items.map((i) => `${i.quantity}× ${i.name} — ${formatPrice(i.unitPriceCents * i.quantity)}`);
  if (order.shippingCents !== null) lines.push(`Frete: ${order.shippingCents === 0 ? "grátis" : formatPrice(order.shippingCents)}`);
  lines.push(`Total: ${formatPrice(order.totalCents)}`);
  return lines;
}

function plainText(event: OrderEvent, order: OrderForNotification): string {
  const parts = [`Olá, ${firstName(order.customer.name)}!`, HEADLINES[event](order.code), "", ...summaryLines(order)];
  if (event === "pedido_enviado" && order.trackingUrl) parts.push("", `Acompanhe a entrega: ${order.trackingUrl}`);
  parts.push("", `Qualquer dúvida, é só responder esta mensagem. Obrigado por comprar na ${brand.name}!`);
  return parts.join("\n");
}

function html(event: OrderEvent, order: OrderForNotification): string {
  const rows = summaryLines(order)
    .map((l) => `<li style="margin:4px 0">${escapeHtml(l)}</li>`)
    .join("");
  const tracking =
    event === "pedido_enviado" && order.trackingUrl && /^https:\/\//.test(order.trackingUrl)
      ? `<p><a href="${escapeHtml(order.trackingUrl)}">Acompanhar a entrega</a></p>`
      : "";
  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#1F2B38">
<p>Olá, ${escapeHtml(firstName(order.customer.name))}!</p>
<p><strong>${escapeHtml(HEADLINES[event](order.code))}</strong></p>
<ul style="padding-left:18px">${rows}</ul>
${tracking}
<p>Qualquer dúvida, é só responder este e-mail. Obrigado por comprar na ${escapeHtml(brand.name)}!</p>
</body></html>`;
}

/** Uma mensagem por canal disponível: e-mail se houver e-mail; WhatsApp só com número E consentimento. */
export function renderOrderMessages(event: OrderEvent, order: OrderForNotification): OutgoingMessage[] {
  const text = plainText(event, order);
  const messages: OutgoingMessage[] = [];
  const email = order.customer.email?.trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    messages.push({ channel: "email", event, to: email, text, email: { subject: SUBJECTS[event](order.code), html: html(event, order) } });
  }
  const phone = order.customer.whatsapp?.replace(/\D/g, "") ?? "";
  if (order.customer.whatsappOptIn && phone.length >= 12 && phone.length <= 15) {
    messages.push({
      channel: "whatsapp",
      event,
      to: phone,
      text,
      template: {
        name: event,
        language: "pt_BR",
        params: [firstName(order.customer.name), order.code, formatPrice(order.totalCents)],
      },
    });
  }
  return messages;
}

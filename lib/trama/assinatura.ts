import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Assinatura dos webhooks do Trama: `X-Trama-Assinatura: sha256=<HMAC-SHA256 do corpo cru, em hex>`, com o segredo
 * da integração. Conferida em tempo constante, sobre o corpo exatamente como chegou (antes de ler o JSON).
 */
export function assinar(corpo: string, segredo: string): string {
  return `sha256=${createHmac("sha256", segredo).update(corpo, "utf8").digest("hex")}`;
}

export function assinaturaConfere(corpo: string, segredo: string, recebida: string | null): boolean {
  if (!recebida) return false;
  const esperada = Buffer.from(assinar(corpo, segredo));
  const veio = Buffer.from(recebida.trim());
  return esperada.length === veio.length && timingSafeEqual(esperada, veio);
}

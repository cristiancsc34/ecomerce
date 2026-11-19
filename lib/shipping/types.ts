import type { DeliveryMethod } from "@/lib/orders/status";

/** Frete por região (vale no navegador e no servidor). Ver docs/FRETE-E-AVISOS.md. */

export type ShippingOption = {
  id: string;
  name: string;
  method: DeliveryMethod;
  /** null = a combinar com a loja (nunca um valor inventado). */
  priceCents: number | null;
  daysMin: number | null;
  daysMax: number | null;
  /** Texto do dono (ex.: endereço e horário da retirada). */
  details: string | null;
  /**
   * Cotação de transportadora (Melhor Envio), calculada pelo CEP e pelas caixas dos produtos. O prazo é o da
   * transportadora, contado a partir da postagem. No pedido, o servidor cota de novo e o banco confere o valor.
   */
  carrier?: { provider: "melhor_envio"; serviceId: number; company: string; service: string };
};

/** Id da opção de transportadora na tela (as formas da loja usam o id do banco). */
export const carrierOptionId = (serviceId: number) => `melhor_envio:${serviceId}`;

/** "de 2 a 5 dias úteis" / "em até 5 dias úteis" / null (sem prazo informado: não prometer nada). */
export function shippingEta(o: { daysMin: number | null; daysMax: number | null }): string | null {
  const { daysMin: min, daysMax: max } = o;
  const plural = (n: number) => (n === 1 ? "dia útil" : "dias úteis");
  if (max === null && min === null) return null;
  if (max === null) return `a partir de ${min} ${plural(min!)}`;
  if (min === null || min === max) return max === 0 ? "no mesmo dia útil" : `em até ${max} ${plural(max)}`;
  return `de ${min} a ${max} ${plural(max)}`;
}

/** "R$ 99,00" / "Grátis" / "A combinar" / "Sem custo" (retirada). */
export function shippingPriceLabel(o: Pick<ShippingOption, "method" | "priceCents">, format: (cents: number) => string): string {
  if (o.method === "retirada") return "Sem custo";
  if (o.priceCents === null) return "A combinar";
  return o.priceCents === 0 ? "Grátis" : format(o.priceCents);
}

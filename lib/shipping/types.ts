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
};

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

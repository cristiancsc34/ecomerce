import { z } from "zod";

/**
 * Caixas do produto JÁ EMBALADO, para cotar o frete com a transportadora (vale no navegador e no servidor).
 * Peso em kg e medidas em cm, como o dono mede. Sem caixas cadastradas, a loja não cota: frete "a combinar".
 * As mesmas regras valem no banco: supabase/migrations/20261119000200_frete_transportadoras.sql.
 */

export type ShippingBox = { weightKg: number; lengthCm: number; widthCm: number; heightCm: number };

export const MAX_BOXES = 10;
export const MAX_BOX_VALUE = 1000;

const measure = (label: string) =>
  z
    .number(`Informe ${label}.`)
    .refine((n) => Number.isFinite(n), `Informe ${label}.`)
    .gt(0, `${label[0].toUpperCase()}${label.slice(1)}: maior que zero.`)
    .max(MAX_BOX_VALUE, `${label[0].toUpperCase()}${label.slice(1)}: no máximo ${MAX_BOX_VALUE}.`);

export const shippingBoxSchema = z.strictObject({
  weightKg: measure("o peso (kg)"),
  lengthCm: measure("o comprimento (cm)"),
  widthCm: measure("a largura (cm)"),
  heightCm: measure("a altura (cm)"),
});

export const shippingBoxesSchema = z.array(shippingBoxSchema).max(MAX_BOXES, `No máximo ${MAX_BOXES} caixas.`);

/** Lê o que veio do banco; qualquer coisa fora do formato vira "sem caixas" (não cota, nunca inventa). */
export function parseBoxes(value: unknown): ShippingBox[] {
  const r = shippingBoxesSchema.safeParse(value);
  return r.success ? r.data : [];
}

/** Caixas que valem para um item: as da variação, se tiver; senão, as do produto. */
export function boxesFor(product: unknown, variant: unknown): ShippingBox[] {
  const own = parseBoxes(variant);
  return own.length ? own : parseBoxes(product);
}

/** Divide o valor (em centavos) entre as caixas, sem perder centavos: a soma é sempre o valor original. */
export function splitCents(totalCents: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(totalCents / parts);
  return Array.from({ length: parts }, (_, i) => (i === parts - 1 ? totalCents - base * (parts - 1) : base));
}

/** "2 caixas: 32,5 kg, 200 × 40 × 30 cm; …" (painel). */
export function describeBoxes(boxes: ShippingBox[]): string {
  if (!boxes.length) return "Sem caixas cadastradas";
  const n = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  const list = boxes.map((b) => `${n(b.weightKg)} kg, ${n(b.lengthCm)} × ${n(b.widthCm)} × ${n(b.heightCm)} cm`).join("; ");
  return `${boxes.length} ${boxes.length === 1 ? "caixa" : "caixas"}: ${list}`;
}

import { z } from "zod";
import { parsePriceToCents } from "@/lib/catalog/money";
import { parseCepRanges } from "@/lib/shipping/ranges";
import { DELIVERY_METHODS } from "@/lib/orders/status";

/** Painel → Entrega e avisos: formulários. */

export const notificationSettingsSchema = z.object({
  notifyEmail: z.boolean(),
  notifyWhatsapp: z.boolean(),
});
export type NotificationSettingsInput = z.input<typeof notificationSettingsSchema>;

const days = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d{1,3}$/.test(v) && Number(v) <= 120), "Dias úteis entre 0 e 120.")
  .transform((v) => (v === "" ? null : Number(v)));

export const shippingOptionSchema = z
  .object({
    name: z.string().trim().min(2, "Dê um nome (ex.: Entrega em Florianópolis).").max(80),
    method: z.enum(DELIVERY_METHODS),
    cepRanges: z.string().max(4000),
    price: z.string().trim().max(20),
    daysMin: days,
    daysMax: days,
    details: z.string().trim().max(500, "Use no máximo 500 caracteres."),
    active: z.boolean(),
  })
  .transform((o, ctx) => {
    const { ranges, errors } = parseCepRanges(o.cepRanges);
    if (errors.length) ctx.addIssue({ code: "custom", path: ["cepRanges"], message: errors[0] });
    if (o.method !== "retirada" && !ranges.length) {
      ctx.addIssue({ code: "custom", path: ["cepRanges"], message: "Informe os CEPs atendidos (ex.: 88000-000 a 88139-999)." });
    }
    if (ranges.length > 50) ctx.addIssue({ code: "custom", path: ["cepRanges"], message: "No máximo 50 faixas." });
    let priceCents: number | null = null;
    if (o.method !== "retirada" && o.price) {
      priceCents = parsePriceToCents(o.price);
      if (priceCents === null) ctx.addIssue({ code: "custom", path: ["price"], message: "Valor inválido. Ex.: 99,90 (vazio = a combinar)." });
    }
    if (o.daysMin !== null && o.daysMax !== null && o.daysMin > o.daysMax) {
      ctx.addIssue({ code: "custom", path: ["daysMax"], message: "O prazo máximo precisa ser maior ou igual ao mínimo." });
    }
    return {
      name: o.name,
      method: o.method,
      cep_ranges: o.method === "retirada" ? [] : ranges,
      price_cents: o.method === "retirada" ? 0 : priceCents,
      days_min: o.daysMin,
      days_max: o.daysMax,
      details: o.details || null,
      active: o.active,
    };
  });
export type ShippingOptionInput = z.input<typeof shippingOptionSchema>;

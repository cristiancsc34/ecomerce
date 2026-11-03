import { z } from "zod";
import { DELIVERY_METHODS, normalizePhone, ORDER_STATUSES, PAYMENT_METHODS } from "@/lib/orders/status";

/** Pedido registrado pela equipe no painel (venda fechada pelo atendimento). */

const text = (max: number) => z.string().trim().max(max);

export const orderItemSchema = z.object({
  productId: z.uuid().nullable(),
  variantId: z.uuid().nullable(),
  name: text(200).min(1, "Item sem nome."),
  variantName: text(120).nullable(),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
  quantity: z.number().int().min(1, "Quantidade mínima: 1.").max(99),
});

export const orderAddressSchema = z.object({
  cep: z.string().transform((v) => v.replace(/\D/g, "")),
  rua: text(160),
  numero: text(20),
  complemento: text(80),
  bairro: text(80),
  cidade: text(80),
  uf: text(2).transform((v) => v.toUpperCase()),
  referencia: text(200),
});

export const orderInputSchema = z
  .object({
    customerName: text(120).min(2, "Informe o nome do cliente."),
    customerPhone: text(30)
      .transform((v) => normalizePhone(v))
      .refine((v) => v === null || /^\d{12,15}$/.test(v), "Celular com DDD, ex.: (11) 98765-4321."),
    customerEmail: text(200)
      .transform((v) => v || null)
      .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "E-mail inválido."),
    whatsappOptIn: z.boolean(),
    address: orderAddressSchema,
    deliveryMethod: z.enum(DELIVERY_METHODS),
    deliveryNotes: text(1000),
    assembly: z.boolean(),
    shippingCents: z.number().int().min(0).nullable(),
    discountCents: z.number().int().min(0),
    paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
    internalNotes: text(2000),
    items: z.array(orderItemSchema).min(1, "Inclua pelo menos um item.").max(30),
    status: z.enum(["recebido", "pago"]).optional(),
  })
  .superRefine((o, ctx) => {
    if (o.deliveryMethod === "retirada") return;
    const a = o.address;
    if (a.cep.length !== 8) ctx.addIssue({ code: "custom", path: ["address", "cep"], message: "CEP com 8 dígitos." });
    for (const [key, label] of [["rua", "a rua"], ["numero", "o número"], ["cidade", "a cidade"], ["uf", "a UF"]] as const) {
      if (!a[key]) ctx.addIssue({ code: "custom", path: ["address", key], message: `Informe ${label} da entrega.` });
    }
  });

export type OrderInput = z.input<typeof orderInputSchema>;
export type OrderOutput = z.output<typeof orderInputSchema>;

/** Avançar etapa: notas e dados da entrega (só os informados mudam). */
export const orderStatusInputSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  publicNote: text(500),
  internalNote: text(1000),
  delivery: z
    .object({
      carrier: text(80),
      trackingCode: text(80),
      trackingUrl: text(500).refine((v) => !v || /^https:\/\/\S+$/.test(v), "O link de rastreio precisa começar com https://"),
      scheduledDate: z.string().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida."),
      scheduledWindow: text(40),
    })
    .partial(),
});

export type OrderStatusInput = z.input<typeof orderStatusInputSchema>;

/** Converte o pedido validado no formato das funções do banco (create_order / update_order). */
export function orderToRpc(o: OrderOutput) {
  const retirada = o.deliveryMethod === "retirada";
  return {
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerEmail: o.customerEmail,
    whatsappOptIn: o.whatsappOptIn && Boolean(o.customerPhone),
    address: retirada ? {} : Object.fromEntries(Object.entries(o.address).filter(([, v]) => v)),
    deliveryMethod: o.deliveryMethod,
    deliveryNotes: o.deliveryNotes,
    assembly: o.assembly,
    shippingCents: retirada ? 0 : o.shippingCents,
    discountCents: o.discountCents,
    paymentMethod: o.paymentMethod,
    internalNotes: o.internalNotes,
    items: o.items,
    ...(o.status ? { status: o.status } : {}),
  };
}

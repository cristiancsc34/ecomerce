import { z } from "zod";
import { normalizePhone } from "@/lib/orders/status";

/**
 * Pedido feito pelo site (sem pagamento online: a loja confirma pagamento e entrega pelo WhatsApp).
 * O navegador manda só ids e quantidades; preço, nome e totais vêm do banco (public.place_site_order).
 * As mesmas regras valem no banco: supabase/migrations/20261103000200_site_checkout.sql.
 */

export const SITE_DELIVERY_METHODS = ["entrega_propria", "retirada"] as const;
export type SiteDeliveryMethod = (typeof SITE_DELIVERY_METHODS)[number];

export const CHECKOUT_MAX_ITEMS = 20;
export const CHECKOUT_MAX_QUANTITY = 10;

const text = (max: number, message = `No máximo ${max} caracteres.`) => z.string().trim().max(max, message);

export const checkoutItemSchema = z.object({
  productId: z.uuid("Produto inválido. Atualize a sacola."),
  variantId: z.uuid("Opção inválida. Escolha o tamanho de novo.").nullable(),
  quantity: z
    .number("Quantidade inválida.")
    .int("Quantidade inválida.")
    .min(1, "Quantidade mínima: 1.")
    .max(CHECKOUT_MAX_QUANTITY, `Quantidade máxima: ${CHECKOUT_MAX_QUANTITY} por item.`),
});

export const checkoutAddressSchema = z.object({
  cep: z.string().transform((v) => v.replace(/\D/g, "")),
  rua: text(160),
  numero: text(20),
  complemento: text(80),
  bairro: text(80),
  cidade: text(80),
  uf: text(2, "UF com 2 letras, ex.: SP.").transform((v) => v.toUpperCase()),
  referencia: text(200),
});

export const checkoutInputSchema = z
  .object({
    customerName: text(120, "Nome muito longo.").min(2, "Informe seu nome."),
    customerPhone: text(30)
      .transform((v) => normalizePhone(v) ?? "")
      .refine((v) => /^\d{12,15}$/.test(v), "Informe o celular com DDD, ex.: (11) 98765-4321."),
    customerEmail: text(200)
      .transform((v) => v || null)
      .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "E-mail inválido. Confira ou deixe em branco."),
    whatsappOptIn: z
      .boolean()
      .refine((v) => v, "Para fazer o pedido, aceite que a loja fale com você pelo WhatsApp."),
    deliveryMethod: z.enum(SITE_DELIVERY_METHODS, "Escolha entre entrega e retirada na loja."),
    address: checkoutAddressSchema,
    deliveryNotes: text(1000, "Observações: no máximo 1000 caracteres."),
    acceptTerms: z.boolean().refine((v) => v, "Para fazer o pedido, aceite as condições de compra."),
    items: z
      .array(checkoutItemSchema)
      .min(1, "A sacola está vazia.")
      .max(CHECKOUT_MAX_ITEMS, `A sacola aceita até ${CHECKOUT_MAX_ITEMS} itens diferentes.`),
  })
  .superRefine((o, ctx) => {
    // Mesmo produto e mesma opção em duas linhas: o banco soma; a soma também respeita o limite.
    const totals = new Map<string, number>();
    for (const item of o.items) {
      const key = `${item.productId}:${item.variantId ?? ""}`;
      totals.set(key, (totals.get(key) ?? 0) + item.quantity);
    }
    if ([...totals.values()].some((q) => q > CHECKOUT_MAX_QUANTITY)) {
      ctx.addIssue({ code: "custom", path: ["items"], message: `Quantidade máxima: ${CHECKOUT_MAX_QUANTITY} por item.` });
    }

    if (o.deliveryMethod === "retirada") return;
    const a = o.address;
    if (a.cep.length !== 8) ctx.addIssue({ code: "custom", path: ["address", "cep"], message: "CEP com 8 números." });
    for (const [key, label] of [["rua", "a rua"], ["numero", "o número (ou s/n)"], ["cidade", "a cidade"]] as const) {
      if (!a[key]) ctx.addIssue({ code: "custom", path: ["address", key], message: `Informe ${label}.` });
    }
    if (!/^[A-Z]{2}$/.test(a.uf)) ctx.addIssue({ code: "custom", path: ["address", "uf"], message: "UF com 2 letras, ex.: SP." });
  });

/** O que a tela envia (formato do contrato do checkout). */
export type CheckoutInput = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  whatsappOptIn: boolean;
  deliveryMethod: SiteDeliveryMethod;
  address: {
    cep: string;
    rua: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
    referencia: string;
  };
  deliveryNotes: string;
  acceptTerms: boolean;
  items: { productId: string; variantId: string | null; quantity: number }[];
};

export type CheckoutOutput = z.output<typeof checkoutInputSchema>;

// O tipo do contrato e a entrada do schema precisam ser iguais (erro de compilação se divergirem).
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contractMatchesSchema: Same<CheckoutInput, z.input<typeof checkoutInputSchema>> = true;
void contractMatchesSchema;

/** Converte o pedido validado no formato de public.place_site_order (só ids e quantidades nos itens). */
export function checkoutToRpc(o: CheckoutOutput) {
  const retirada = o.deliveryMethod === "retirada";
  return {
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerEmail: o.customerEmail ?? "",
    whatsappOptIn: o.whatsappOptIn,
    deliveryMethod: o.deliveryMethod,
    address: retirada ? {} : o.address,
    deliveryNotes: o.deliveryNotes,
    acceptTerms: o.acceptTerms,
    items: o.items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
  };
}

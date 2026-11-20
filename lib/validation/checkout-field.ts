import { checkoutInputSchema, type CheckoutInput } from "@/lib/validation/checkout";

/**
 * Validação de UM campo do checkout (ao sair do campo), com o mesmo checkoutInputSchema e as mesmas mensagens.
 *
 * O schema só confere o endereço (superRefine) quando o resto do pedido passa. Por isso o campo é conferido
 * dentro de um pedido de referência válido: só o erro daquele campo volta, sem depender dos outros.
 */
export type CheckoutFieldKey =
  | "customerName"
  | "customerPhone"
  | "customerEmail"
  | `address.${keyof CheckoutInput["address"]}`;

const VALID_BASE: CheckoutInput = {
  customerName: "Cliente",
  customerPhone: "11987654321",
  customerEmail: "",
  whatsappOptIn: true,
  deliveryMethod: "entrega_propria",
  address: { cep: "01001000", rua: "Rua", numero: "1", complemento: "", bairro: "", cidade: "Cidade", uf: "SP", referencia: "" },
  shippingOptionId: null,
  paymentMethod: "pix",
  deliveryNotes: "",
  acceptTerms: true,
  items: [{ productId: "00000000-0000-4000-8000-000000000000", variantId: null, quantity: 1 }],
};

/** Mensagem de erro do campo (a mesma do envio) ou undefined se o valor passa. */
export function checkoutFieldError(key: CheckoutFieldKey, value: string): string | undefined {
  const input: CheckoutInput = { ...VALID_BASE, address: { ...VALID_BASE.address } };
  if (key.startsWith("address.")) {
    input.address[key.slice("address.".length) as keyof CheckoutInput["address"]] = value;
  } else {
    input[key as "customerName" | "customerPhone" | "customerEmail"] = value;
  }
  const parsed = checkoutInputSchema.safeParse(input);
  if (parsed.success) return undefined;
  return parsed.error.issues.find((i) => i.path.map(String).join(".") === key)?.message;
}

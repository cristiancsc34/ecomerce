import { z } from "zod";

export const MAX_QUANTITY_PER_LINE = 10;
export const MAX_CART_LINES = 20;

/** O navegador guarda só identificadores e quantidades — nunca preço. */
export const cartItemSchema = z.object({
  productId: z.uuid(),
  variantId: z.uuid().nullable(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
});

export type CartItem = z.infer<typeof cartItemSchema>;

export const cartQuoteRequestSchema = z.object({
  items: z.array(cartItemSchema).max(MAX_CART_LINES),
});

export type CartQuoteLine = {
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  variantName: string | null;
  imageUrl: string | null;
  imageAlt: string;
  imageIsIllustrative: boolean;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  isDemo: boolean;
};

export type CartQuote = {
  lines: CartQuoteLine[];
  subtotalCents: number;
  /** Mensagens para o cliente sobre itens removidos ou ajustados. */
  issues: string[];
  /** Algum item é de demonstração (valores ilustrativos). */
  hasDemoItems: boolean;
  /** Itens normalizados que o navegador deve guardar após a cotação. */
  normalizedItems: CartItem[];
};

import { availability, primaryImage } from "@/lib/catalog/product-helpers";
import type { Product } from "@/lib/catalog/types";
import { MAX_CART_LINES, MAX_QUANTITY_PER_LINE, type CartItem, type CartQuote, type CartQuoteLine } from "./types";

/**
 * Recalcula o carrinho a partir do catálogo do servidor.
 * O preço SEMPRE vem do catálogo; o navegador só informa ids e quantidades.
 * Função pura, para poder ser testada sem rede.
 */
export function quoteCart(items: CartItem[], products: Product[]): CartQuote {
  const byId = new Map(products.map((p) => [p.id, p]));
  const issues = new Set<string>();

  // Junta linhas repetidas (mesmo produto e variação).
  const merged = new Map<string, CartItem>();
  for (const item of items.slice(0, MAX_CART_LINES)) {
    const key = `${item.productId}:${item.variantId ?? ""}`;
    const prev = merged.get(key);
    const quantity = Math.min(MAX_QUANTITY_PER_LINE, (prev?.quantity ?? 0) + item.quantity);
    if (prev && prev.quantity + item.quantity > MAX_QUANTITY_PER_LINE) {
      issues.add(`A quantidade máxima por item é ${MAX_QUANTITY_PER_LINE}.`);
    }
    merged.set(key, { ...item, quantity });
  }
  if (items.length > MAX_CART_LINES) issues.add(`A sacola aceita até ${MAX_CART_LINES} itens diferentes.`);

  const lines: CartQuoteLine[] = [];
  for (const item of merged.values()) {
    const product: Product | undefined = byId.get(item.productId);
    if (!product) {
      issues.add("Um item não está mais disponível e foi removido da sacola.");
      continue;
    }

    let variant = null;
    if (product.variants.length) {
      variant = product.variants.find((v) => v.id === item.variantId) ?? null;
      if (!variant) {
        issues.add(`Escolha novamente o tamanho de “${product.name}”: a opção anterior não existe mais.`);
        continue;
      }
    } else if (item.variantId) {
      issues.add(`“${product.name}” mudou e foi removido da sacola. Adicione de novo, por favor.`);
      continue;
    }

    const unitPriceCents = variant ? variant.priceCents : product.priceCents;
    if (unitPriceCents === null) {
      issues.add(`“${product.name}” está sem preço no momento e foi removido da sacola.`);
      continue;
    }

    if (availability(product, variant) === "out_of_stock") {
      issues.add(`“${product.name}” está indisponível no momento e foi removido da sacola.`);
      continue;
    }

    let quantity = item.quantity;
    // Mesma regra de availability(): variação sem controle herda o estoque do produto.
    const stock = variant ? (variant.stockQuantity ?? product.stockQuantity) : product.stockQuantity;
    if (stock !== null && quantity > stock) {
      quantity = stock;
      issues.add(`A quantidade de “${product.name}” foi ajustada ao estoque disponível.`);
    }

    const image = primaryImage(product);
    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      slug: product.slug,
      name: product.name,
      variantName: variant?.name ?? null,
      imageUrl: image?.url ?? null,
      imageAlt: image?.altText ?? "",
      imageIsIllustrative: image?.isIllustrative ?? false,
      unitPriceCents,
      quantity,
      lineTotalCents: unitPriceCents * quantity,
      isDemo: product.isDemo,
    });
  }

  return {
    lines,
    subtotalCents: lines.reduce((sum, l) => sum + l.lineTotalCents, 0),
    issues: [...issues],
    hasDemoItems: lines.some((l) => l.isDemo),
    normalizedItems: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
  };
}

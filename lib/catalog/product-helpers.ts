import type { Product, ProductMedia, ProductVariant, SizeKey } from "./types";

/**
 * Preços que o cliente consegue de fato comprar: com variações, só os preços
 * delas (o preço-base é ignorado, como na sacola); sem variações, o preço-base.
 * Nunca anunciar um "a partir de" que não pode ser comprado.
 */
export function purchasablePrices(product: Pick<Product, "priceCents" | "variants">): number[] {
  if (product.variants.length) return product.variants.map((v) => v.priceCents);
  return product.priceCents !== null ? [product.priceCents] : [];
}

/** Menor preço comprável. */
export function fromPriceCents(product: Pick<Product, "priceCents" | "variants">): number | null {
  const prices = purchasablePrices(product);
  return prices.length ? Math.min(...prices) : null;
}

/** Maior preço comprável. */
export function toPriceCents(product: Pick<Product, "priceCents" | "variants">): number | null {
  const prices = purchasablePrices(product);
  return prices.length ? Math.max(...prices) : null;
}

export function hasPriceRange(product: Pick<Product, "priceCents" | "variants">): boolean {
  const from = fromPriceCents(product);
  const to = toPriceCents(product);
  return from !== null && to !== null && from !== to;
}

export function sortedVariants(product: Pick<Product, "variants">): ProductVariant[] {
  return [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function productSizes(product: Pick<Product, "variants">): SizeKey[] {
  const sizes = new Set<SizeKey>();
  for (const v of product.variants) if (v.size) sizes.add(v.size);
  return [...sizes];
}

export function imageMedia(product: Pick<Product, "media">): ProductMedia[] {
  return product.media
    .filter((m) => m.type === "image")
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
}

/** Imagens e vídeos da galeria, com a principal primeiro. */
export function galleryMedia(product: Pick<Product, "media">): ProductMedia[] {
  return product.media
    .filter((m) => m.type === "image" || m.type === "video")
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
}

export function primaryImage(product: Pick<Product, "media">): ProductMedia | null {
  return imageMedia(product)[0] ?? null;
}

export function model3d(product: Pick<Product, "media">): ProductMedia | null {
  return product.media.find((m) => m.type === "model_3d") ?? null;
}

/**
 * Disponibilidade somente quando o estoque é controlado.
 * `null` = não controlado → a interface não exibe nada (não inventamos estoque).
 */
export function availability(
  product: Pick<Product, "stockQuantity" | "variants">,
  variant?: ProductVariant | null,
): "in_stock" | "out_of_stock" | null {
  const fromQty = (qty: number) => (qty > 0 ? "in_stock" : "out_of_stock");

  if (variant) {
    // Estoque da variação; se ela não for controlada, herda o do produto.
    if (variant.stockQuantity !== null) return fromQty(variant.stockQuantity);
    return product.stockQuantity !== null ? fromQty(product.stockQuantity) : null;
  }

  // Sem variação escolhida: só conclui algo se TODAS as variações forem controladas.
  if (product.variants.length && product.variants.every((v) => v.stockQuantity !== null)) {
    return product.variants.some((v) => (v.stockQuantity ?? 0) > 0) ? "in_stock" : "out_of_stock";
  }
  return product.stockQuantity !== null ? fromQty(product.stockQuantity) : null;
}

export function hasConfirmedSpecs(product: Pick<Product, "attributes" | "dimensions">): boolean {
  const a = product.attributes;
  return Boolean(
    a.firmness ||
      a.materials?.length ||
      a.layers?.length ||
      a.fabric ||
      a.warranty ||
      a.care?.length ||
      a.extraSpecs?.length ||
      product.dimensions.heightCm ||
      product.dimensions.weightKg,
  );
}

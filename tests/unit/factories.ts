import type { Product, ProductMedia, ProductVariant } from "@/lib/catalog/types";

let seq = 0;
const uuid = () => {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
};

export function makeVariant(partial: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: uuid(),
    name: "Casal (138 × 188 cm)",
    sku: null,
    priceCents: 150000,
    stockQuantity: null,
    size: "casal",
    widthCm: 138,
    lengthCm: 188,
    sortOrder: 0,
    ...partial,
  };
}

export function makeMedia(partial: Partial<ProductMedia> = {}): ProductMedia {
  return {
    id: uuid(),
    type: "image",
    url: "https://example.supabase.co/storage/v1/object/public/product-media/products/x/a.jpg",
    storagePath: "products/x/a.jpg",
    altText: "Foto do colchão de frente",
    sortOrder: 0,
    isPrimary: true,
    isIllustrative: false,
    width: 1200,
    height: 900,
    ...partial,
  };
}

export function makeProduct(partial: Partial<Product> = {}): Product {
  const id = partial.id ?? uuid();
  return {
    id,
    slug: `produto-${id.slice(-4)}`,
    name: "Colchão Teste",
    shortDescription: "Descrição curta",
    description: "Descrição completa revisada.",
    category: { id: "00000000-0000-4000-8000-0000000000c1", slug: "colchoes", name: "Colchões", requires3d: false },
    status: "published",
    isDemo: false,
    priceCents: null,
    compareAtPriceCents: null,
    currency: "BRL",
    sku: null,
    stockQuantity: null,
    dimensions: {},
    attributes: {},
    faq: [],
    seoTitle: null,
    seoDescription: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    publishedAt: "2026-10-01T00:00:00.000Z",
    media: [makeMedia()],
    variants: [makeVariant()],
    ...partial,
  };
}

import { arFiles, galleryMedia, model3d } from "./product-helpers";
import { slugify } from "./slug";
import type { Product, ProductMedia, ProductVariant } from "./types";

/**
 * Variantes de cor ou tecido. Uma variação com cor (`colorHex`) entra no seletor
 * "Cor" da página. Fotos e modelo 3D podem ser da variação (`variantId`) ou do
 * produto. Sem variação com cor, nada disso aparece.
 */

/** Variações com cor, na ordem do catálogo. */
export function colorVariants(product: Pick<Product, "variants">): ProductVariant[] {
  return [...product.variants].filter((v) => v.colorHex).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Nome da cor no link (?cor=marrom): o nome da variação sem acento. */
export function variantSlug(variant: Pick<ProductVariant, "name">): string {
  return slugify(variant.name);
}

export function findColorVariant(product: Pick<Product, "variants">, slug: string | null | undefined): ProductVariant | null {
  if (!slug) return null;
  return colorVariants(product).find((v) => variantSlug(v) === slug) ?? null;
}

/** Fotos da galeria: as da variação, se ela tiver; senão as do produto (sem variação). */
export function galleryFor(product: Pick<Product, "media">, variantId: string | null): ProductMedia[] {
  const all = galleryMedia(product);
  const own = variantId ? all.filter((m) => m.variantId === variantId) : [];
  return own.length ? own : all.filter((m) => m.variantId === null);
}

export type VariantModel = {
  model: ProductMedia | null;
  /** O modelo é da própria variação (troca o arquivo). */
  own: boolean;
  /** Cor para pintar o material principal quando o modelo não é da variação. */
  tint: string | null;
  usdzUrl: string | null;
  realScale: boolean;
};

/**
 * Modelo 3D para a variação escolhida:
 * - a variação tem modelo próprio → troca o arquivo (e o AR usa esse arquivo);
 * - não tem → modelo do produto; o visualizador usa a variante do próprio .glb
 *   (KHR_materials_variants, pelo nome da cor) ou pinta o material principal.
 * A primeira cor da lista é a das fotos e do modelo do produto.
 */
export function modelFor(product: Pick<Product, "media" | "dimensions" | "variants">, variant: ProductVariant | null): VariantModel {
  const models = product.media.filter((m) => m.type === "model_3d");
  const own = variant ? (models.find((m) => m.variantId === variant.id) ?? null) : null;
  const base = models.find((m) => m.variantId === null) ?? model3d(product);
  const model = own ?? base;
  const ar = arFiles(product, model);
  // A primeira cor é a das fotos e do modelo do produto: não pinta. As outras, sem
  // modelo próprio, são pintadas na hora — o .usdz pronto (na cor original) não vale.
  const first = colorVariants(product)[0];
  const tinted = Boolean(variant && !own && variant.id !== first?.id);
  return {
    model,
    own: Boolean(own),
    tint: tinted ? variant!.colorHex : null,
    usdzUrl: tinted ? null : ar.usdzUrl,
    realScale: ar.realScale,
  };
}

/** Dados da variação para o navegador (sem nada além do que a página mostra). */
export type ColorOption = {
  id: string;
  slug: string;
  name: string;
  hex: string;
  /** Miniatura: a primeira foto da variação (ou nenhuma; o seletor mostra a cor). */
  thumbnailUrl: string | null;
  gallery: ProductMedia[];
  model: VariantModel;
};

export function colorOptions(product: Pick<Product, "variants" | "media" | "dimensions">): ColorOption[] {
  return colorVariants(product).map((v) => {
    const own = galleryFor(product, v.id).filter((m) => m.variantId === v.id);
    return {
      id: v.id,
      slug: variantSlug(v),
      name: v.name,
      hex: v.colorHex!,
      thumbnailUrl: own.find((m) => m.type === "image")?.url ?? null,
      gallery: galleryFor(product, v.id),
      model: modelFor(product, v),
    };
  });
}

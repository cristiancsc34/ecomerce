import { brand } from "@/config/brand";
import { imageMedia } from "@/lib/catalog/product-helpers";
import type { Category, Product, ProductMedia } from "@/lib/catalog/types";

/** Tamanho que o Google costuma mostrar do resumo. */
export const META_DESCRIPTION_MAX = 160;

/** Junta espaços e corta na última palavra inteira, com reticências. */
export function clip(text: string, max = META_DESCRIPTION_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

/** Medidas do cadastro em texto ("L 80 × P 90 × A 95 cm"), ou null. */
export function measuresText(product: Pick<Product, "dimensions">): string | null {
  const d = product.dimensions;
  const parts = [
    d.widthCm ? `L ${d.widthCm}` : null,
    d.lengthCm ? `P ${d.lengthCm}` : null,
    d.heightCm ? `A ${d.heightCm}` : null,
  ].filter(Boolean);
  return parts.length >= 2 ? `${parts.join(" × ")} cm` : null;
}

/**
 * Resumo do produto para o Google. Ordem: o que a equipe escreveu para o
 * Google, a descrição curta, o começo da descrição; sem nada disso, uma frase
 * montada só com dados do cadastro (nome, categoria, medidas, 3D).
 */
export function productDescription(product: Product, has3d: boolean): string {
  const written = product.seoDescription ?? product.shortDescription ?? product.description;
  if (written?.trim()) return clip(written);
  const measures = measuresText(product);
  const parts = [
    `${product.name}${product.category ? ` (${product.category.name.toLowerCase()})` : ""} na ${brand.name}`,
    measures ? `medidas ${measures}` : null,
    has3d ? "veja em 3D" : null,
  ].filter(Boolean);
  return clip(`${parts.join(", ")}.`);
}

/** Título do produto (sem o nome da loja; o modelo do layout acrescenta). */
export function productTitle(product: Pick<Product, "seoTitle" | "name">): string {
  return product.seoTitle?.trim() || product.name;
}

/** Foto que pode ir para o Google e o WhatsApp (real, não ilustrativa nem .svg). */
export function shareableImage(product: Pick<Product, "media">): ProductMedia | null {
  return (
    imageMedia(product).find((m) => !m.isIllustrative && !m.pendingReview && !m.url.toLowerCase().endsWith(".svg")) ?? null
  );
}

export function categoryTitle(category: Pick<Category, "seoTitle" | "name">): string {
  return category.seoTitle?.trim() || category.name;
}

/** Resumo da categoria: o escrito pela equipe; sem ele, uma frase com a contagem real. */
export function categoryDescription(category: Pick<Category, "seoDescription" | "description" | "name">, productCount: number): string {
  const written = category.seoDescription ?? category.description;
  if (written?.trim()) return clip(written);
  const count = productCount === 1 ? "1 modelo" : `${productCount} modelos`;
  return clip(`Veja ${count} de ${category.name.toLowerCase()} na ${brand.name}. ${brand.slogan}`);
}

/**
 * Campos fixos do Open Graph. O Next substitui o objeto `openGraph` inteiro em
 * cada página (não mescla com o do layout), então cada página repete estes.
 */
export const OPEN_GRAPH_BASE = { siteName: brand.name, locale: "pt_BR" } as const;

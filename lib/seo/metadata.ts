import { brand } from "@/config/brand";
import { categorySeo } from "@/content/categorias-seo";
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

type CategoryText = Pick<Category, "name" | "seoTitle" | "seoDescription" | "description" | "content"> & { slug?: string };

/**
 * Título da categoria: o escrito no painel para o Google; sem ele, o texto
 * padrão por slug (content/categorias-seo.ts); sem os dois, o nome.
 */
export function categoryTitle(category: Pick<CategoryText, "seoTitle" | "name" | "slug">): string {
  return category.seoTitle?.trim() || (category.slug ? categorySeo(category.slug)?.title : null) || category.name;
}

/**
 * Resumo da categoria: o escrito no painel para o Google; sem ele, o texto
 * padrão por slug; depois a descrição da categoria; por fim, uma frase com a
 * contagem real.
 */
export function categoryDescription(
  category: Pick<CategoryText, "seoDescription" | "description" | "name" | "slug">,
  productCount: number,
): string {
  const written =
    category.seoDescription?.trim() || (category.slug ? categorySeo(category.slug)?.description : null) || category.description?.trim();
  if (written) return clip(written);
  const count = productCount === 1 ? "1 modelo" : `${productCount} modelos`;
  return clip(`Veja ${count} de ${category.name.toLowerCase()} na ${brand.name}. ${brand.slogan}`);
}

/**
 * Texto da página da categoria: o escrito no painel (parágrafos separados por
 * linha em branco); sem ele, o texto padrão por slug. Perguntas frequentes vêm
 * do texto padrão (o painel ainda não tem esse campo).
 */
export function categoryContent(category: Pick<CategoryText, "content" | "slug">): {
  paragraphs: string[];
  faq: { question: string; answer: string }[];
} {
  const fallback = category.slug ? categorySeo(category.slug) : null;
  const own = category.content
    ?.split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return { paragraphs: own?.length ? own : (fallback?.content ?? []), faq: fallback?.faq ?? [] };
}

/**
 * Campos fixos do Open Graph. O Next substitui o objeto `openGraph` inteiro em
 * cada página (não mescla com o do layout), então cada página repete estes.
 */
export const OPEN_GRAPH_BASE = { siteName: brand.name, locale: "pt_BR" } as const;

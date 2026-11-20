/**
 * Guias de compra (issue #31). Estrutura pronta; os textos ficam com o az
 * growth e só entram aqui depois de revisados pelo Cristian. Nada de artigo
 * inventado: enquanto a lista estiver vazia, /guias fica com `noindex` e fora
 * do sitemap, e /guias/<slug> responde 404.
 *
 * Para publicar um guia, acrescente um objeto na lista `GUIAS` (um arquivo por
 * guia em content/guias/ também serve, importado aqui).
 */
export type Guia = {
  slug: string;
  title: string;
  /** Resumo do Google, até 155 caracteres. */
  description: string;
  /** Slug da categoria a que o guia leva (ex.: "colchoes"). */
  categorySlug: string;
  /** Nome de quem escreveu (obrigatório para o JSON-LD Article). */
  author: string;
  /** Datas no formato AAAA-MM-DD. */
  datePublished: string;
  dateModified: string;
  /** Parágrafos do texto. */
  body: string[];
};

export const GUIAS: readonly Guia[] = [];

export function guiaBySlug(slug: string): Guia | null {
  return GUIAS.find((g) => g.slug === slug) ?? null;
}

/** Até 3 guias de uma categoria (para a página da categoria). */
export function guiasDaCategoria(categorySlug: string, limit = 3): Guia[] {
  return GUIAS.filter((g) => g.categorySlug === categorySlug).slice(0, limit);
}

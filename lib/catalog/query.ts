import { fromPriceCents, productSizes } from "./product-helpers";
import {
  FIRMNESS_LEVELS,
  SIZE_KEYS,
  type Firmness,
  type Product,
  type SizeKey,
} from "./types";

export const SORT_OPTIONS = ["relevancia", "menor-preco", "maior-preco", "novidades"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const SORT_LABELS: Record<SortOption, string> = {
  relevancia: "Relevância",
  "menor-preco": "Menor preço",
  "maior-preco": "Maior preço",
  novidades: "Novidades",
};

export type CatalogQuery = {
  q: string;
  categoria: string | null;
  tamanhos: SizeKey[];
  firmezas: Firmness[];
  /** Em reais inteiros, como digitado no filtro. */
  precoMin: number | null;
  precoMax: number | null;
  ordem: SortOption;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const EMPTY_QUERY: CatalogQuery = {
  q: "",
  categoria: null,
  tamanhos: [],
  firmezas: [],
  precoMin: null,
  precoMax: null,
  ordem: "relevancia",
};

const MAX_QUERY_LENGTH = 100;

function values(raw: string | string[] | undefined): string[] {
  if (raw === undefined) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

function first(raw: string | string[] | undefined): string {
  return values(Array.isArray(raw) ? raw.slice(0, 1) : raw)[0] ?? "";
}

function pickAllowed<T extends string>(raw: string | string[] | undefined, allowed: readonly T[]): T[] {
  const set = new Set<T>();
  for (const v of values(raw)) {
    if ((allowed as readonly string[]).includes(v)) set.add(v as T);
  }
  // Ordem canônica (a da lista permitida) para URLs estáveis.
  return allowed.filter((a) => set.has(a));
}

function reais(raw: string | string[] | undefined): number | null {
  const v = first(raw);
  if (!/^\d{1,7}$/.test(v)) return null;
  return Number(v);
}

/** Lê os parâmetros da URL de forma tolerante: valores inválidos são ignorados. */
export function parseCatalogQuery(params: RawSearchParams): CatalogQuery {
  const q = (Array.isArray(params.q) ? params.q[0] : params.q ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
  const categoriaRaw = first(params.categoria);
  const categoria = /^[a-z0-9-]{1,80}$/.test(categoriaRaw) ? categoriaRaw : null;
  let precoMin = reais(params.preco_min);
  let precoMax = reais(params.preco_max);
  if (precoMin !== null && precoMax !== null && precoMin > precoMax) {
    [precoMin, precoMax] = [precoMax, precoMin];
  }
  const ordemRaw = first(params.ordem);
  const ordem = (SORT_OPTIONS as readonly string[]).includes(ordemRaw)
    ? (ordemRaw as SortOption)
    : "relevancia";

  return {
    q,
    categoria,
    tamanhos: pickAllowed(params.tamanho, SIZE_KEYS),
    firmezas: pickAllowed(params.firmeza, FIRMNESS_LEVELS),
    precoMin,
    precoMax,
    ordem,
  };
}

/** Serializa para URL. Listas viram parâmetros repetidos, como num <form method="get">. */
export function catalogQueryToSearchParams(query: CatalogQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (query.q) sp.set("q", query.q);
  if (query.categoria) sp.set("categoria", query.categoria);
  for (const t of query.tamanhos) sp.append("tamanho", t);
  for (const f of query.firmezas) sp.append("firmeza", f);
  if (query.precoMin !== null) sp.set("preco_min", String(query.precoMin));
  if (query.precoMax !== null) sp.set("preco_max", String(query.precoMax));
  if (query.ordem !== "relevancia") sp.set("ordem", query.ordem);
  return sp;
}

export function hasActiveFilters(query: CatalogQuery): boolean {
  return Boolean(
    query.q ||
      query.categoria ||
      query.tamanhos.length ||
      query.firmezas.length ||
      query.precoMin !== null ||
      query.precoMax !== null,
  );
}

/** Minúsculas e sem acentos: "Colchão Híbrido" → "colchao hibrido". */
export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Pontua o produto para a busca. Todos os termos precisam aparecer em algum
 * campo; retorna null quando algum termo não aparece.
 */
export function searchScore(product: Product, q: string): number | null {
  const terms = normalizeText(q).split(/\s+/).filter((t) => t.length > 0);
  if (!terms.length) return 0;

  const fields: [string, number][] = [
    [product.name, 5],
    [product.category?.name ?? "", 3],
    [product.shortDescription ?? "", 2],
    [
      [
        product.description ?? "",
        ...(product.attributes.materials ?? []),
        ...(product.attributes.layers ?? []),
        product.attributes.fabric ?? "",
        product.attributes.firmness ?? "",
        ...product.variants.map((v) => v.name),
      ].join(" "),
      1,
    ],
  ];
  const normalizedFields = fields.map(([text, weight]) => [normalizeText(text), weight] as const);

  let score = 0;
  for (const term of terms) {
    let termScore = 0;
    for (const [text, weight] of normalizedFields) {
      if (text.includes(term)) termScore += weight;
    }
    if (termScore === 0) return null;
    score += termScore;
  }
  return score;
}

function productPrices(product: Product): number[] {
  return [
    ...(product.priceCents !== null ? [product.priceCents] : []),
    ...product.variants.map((v) => v.priceCents),
  ];
}

function recency(product: Product): string {
  return product.publishedAt ?? product.createdAt;
}

export function applyCatalogQuery(products: Product[], query: CatalogQuery): Product[] {
  const scored: { product: Product; score: number }[] = [];

  for (const product of products) {
    if (query.categoria && product.category?.slug !== query.categoria) continue;

    if (query.tamanhos.length) {
      const sizes = productSizes(product);
      if (!query.tamanhos.some((t) => sizes.includes(t))) continue;
    }

    if (query.firmezas.length) {
      const f = product.attributes.firmness;
      if (!f || !query.firmezas.includes(f)) continue;
    }

    if (query.precoMin !== null || query.precoMax !== null) {
      const min = query.precoMin !== null ? query.precoMin * 100 : -Infinity;
      const max = query.precoMax !== null ? query.precoMax * 100 : Infinity;
      if (!productPrices(product).some((p) => p >= min && p <= max)) continue;
    }

    const score = query.q ? searchScore(product, query.q) : 0;
    if (score === null) continue;
    scored.push({ product, score });
  }

  const byName = (a: Product, b: Product) => a.name.localeCompare(b.name, "pt-BR");
  const priceOf = (p: Product) => fromPriceCents(p);

  scored.sort((a, b) => {
    switch (query.ordem) {
      case "menor-preco":
      case "maior-preco": {
        const pa = priceOf(a.product);
        const pb = priceOf(b.product);
        if (pa === null && pb === null) return byName(a.product, b.product);
        if (pa === null) return 1;
        if (pb === null) return -1;
        const diff = query.ordem === "menor-preco" ? pa - pb : pb - pa;
        return diff || byName(a.product, b.product);
      }
      case "novidades":
        return recency(b.product).localeCompare(recency(a.product)) || byName(a.product, b.product);
      case "relevancia":
      default:
        return (
          b.score - a.score ||
          recency(b.product).localeCompare(recency(a.product)) ||
          byName(a.product, b.product)
        );
    }
  });

  return scored.map((s) => s.product);
}

export type CatalogFacets = {
  categories: { slug: string; name: string; count: number }[];
  sizes: { key: SizeKey; count: number }[];
  firmness: { key: Firmness; count: number }[];
  price: { minReais: number; maxReais: number } | null;
};

/**
 * Filtros disponíveis a partir dos dados existentes. Um atributo que nenhum
 * produto tem não vira filtro (não mostramos filtros vazios).
 */
export function catalogFacets(products: Product[]): CatalogFacets {
  const categories = new Map<string, { slug: string; name: string; count: number }>();
  const sizes = new Map<SizeKey, number>();
  const firmness = new Map<Firmness, number>();
  const prices: number[] = [];

  for (const p of products) {
    if (p.category) {
      const c = categories.get(p.category.slug) ?? { slug: p.category.slug, name: p.category.name, count: 0 };
      c.count += 1;
      categories.set(p.category.slug, c);
    }
    for (const s of productSizes(p)) sizes.set(s, (sizes.get(s) ?? 0) + 1);
    if (p.attributes.firmness) {
      firmness.set(p.attributes.firmness, (firmness.get(p.attributes.firmness) ?? 0) + 1);
    }
    prices.push(...productPrices(p));
  }

  return {
    categories: [...categories.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    sizes: SIZE_KEYS.filter((k) => sizes.has(k)).map((key) => ({ key, count: sizes.get(key)! })),
    firmness: FIRMNESS_LEVELS.filter((k) => firmness.has(k)).map((key) => ({ key, count: firmness.get(key)! })),
    price: prices.length
      ? { minReais: Math.floor(Math.min(...prices) / 100), maxReais: Math.ceil(Math.max(...prices) / 100) }
      : null,
  };
}

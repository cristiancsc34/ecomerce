import { describe, expect, it } from "vitest";
import {
  applyCatalogQuery,
  catalogFacets,
  catalogQueryToSearchParams,
  EMPTY_QUERY,
  hasActiveFilters,
  normalizeText,
  parseCatalogQuery,
} from "@/lib/catalog/query";
import { makeProduct, makeVariant } from "./factories";

const nuvem = makeProduct({
  name: "Nuvem Essencial",
  slug: "nuvem",
  attributes: { firmness: "medio-macio", materials: ["Espuma"] },
  variants: [makeVariant({ size: "solteiro", priceCents: 89900 }), makeVariant({ size: "casal", priceCents: 129900 })],
  publishedAt: "2026-10-01T00:00:00Z",
});
const brisa = makeProduct({
  name: "Brisa Premium",
  slug: "brisa",
  shortDescription: "Firmeza média",
  attributes: { firmness: "medio" },
  variants: [makeVariant({ size: "queen", priceCents: 219900 }), makeVariant({ size: "king", priceCents: 279900 })],
  publishedAt: "2026-10-03T00:00:00Z",
});
const sereno = makeProduct({
  name: "Sereno Híbrido",
  slug: "sereno",
  attributes: { firmness: "medio-firme" },
  variants: [makeVariant({ size: "casal", priceCents: 249900 })],
  publishedAt: "2026-10-02T00:00:00Z",
});
const all = [nuvem, brisa, sereno];

describe("parseCatalogQuery", () => {
  it("lê filtros repetidos e separados por vírgula, ignorando valores inválidos", () => {
    const q = parseCatalogQuery({
      q: "  híbrido   casal ",
      tamanho: ["casal", "inexistente", "queen,king"],
      firmeza: "medio,xyz",
      preco_min: "3000",
      preco_max: "1000",
      ordem: "hack",
      categoria: "../admin",
    });
    expect(q.q).toBe("híbrido casal");
    expect(q.tamanhos).toEqual(["casal", "queen", "king"]);
    expect(q.firmezas).toEqual(["medio"]);
    // min > max: inverte em vez de falhar
    expect(q.precoMin).toBe(1000);
    expect(q.precoMax).toBe(3000);
    expect(q.ordem).toBe("relevancia");
    expect(q.categoria).toBeNull();
  });

  it("limita o tamanho da busca", () => {
    expect(parseCatalogQuery({ q: "a".repeat(500) }).q.length).toBe(100);
  });

  it("ida e volta pela URL preserva a consulta", () => {
    const original = parseCatalogQuery({ q: "nuvem", tamanho: ["queen", "casal"], firmeza: "medio", preco_max: "2000", ordem: "menor-preco" });
    const sp = catalogQueryToSearchParams(original);
    const parsed = parseCatalogQuery(Object.fromEntries([...new Set(sp.keys())].map((k) => [k, sp.getAll(k)])));
    expect(parsed).toEqual(original);
    expect(sp.toString()).toBe("q=nuvem&tamanho=casal&tamanho=queen&firmeza=medio&preco_max=2000&ordem=menor-preco");
  });

  it("detecta filtros ativos", () => {
    expect(hasActiveFilters(EMPTY_QUERY)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_QUERY, ordem: "maior-preco" })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_QUERY, tamanhos: ["casal"] })).toBe(true);
  });
});

describe("applyCatalogQuery", () => {
  it("busca sem acento e exige todos os termos", () => {
    expect(normalizeText("Híbrido")).toBe("hibrido");
    expect(applyCatalogQuery(all, { ...EMPTY_QUERY, q: "hibrido" }).map((p) => p.slug)).toEqual(["sereno"]);
    expect(applyCatalogQuery(all, { ...EMPTY_QUERY, q: "sereno casal" }).map((p) => p.slug)).toEqual(["sereno"]);
    expect(applyCatalogQuery(all, { ...EMPTY_QUERY, q: "sereno king" })).toEqual([]);
  });

  it("nome pesa mais que descrição na relevância", () => {
    const mencionaBrisa = makeProduct({
      name: "Outro Colchão",
      slug: "outro",
      description: "Mais firme que o Brisa.",
      publishedAt: "2026-10-09T00:00:00Z",
    });
    const result = applyCatalogQuery([mencionaBrisa, ...all], { ...EMPTY_QUERY, q: "brisa" });
    expect(result.map((p) => p.slug)).toEqual(["brisa", "outro"]);
  });

  it("filtra por tamanho (qualquer variação) e firmeza", () => {
    expect(applyCatalogQuery(all, { ...EMPTY_QUERY, tamanhos: ["casal"] }).map((p) => p.slug).sort()).toEqual(["nuvem", "sereno"]);
    expect(applyCatalogQuery(all, { ...EMPTY_QUERY, firmezas: ["medio", "medio-firme"] }).map((p) => p.slug).sort()).toEqual(["brisa", "sereno"]);
  });

  it("filtra por faixa de preço considerando qualquer variação", () => {
    expect(applyCatalogQuery(all, { ...EMPTY_QUERY, precoMax: 1000 }).map((p) => p.slug)).toEqual(["nuvem"]);
    expect(applyCatalogQuery(all, { ...EMPTY_QUERY, precoMin: 2500, precoMax: 2900 }).map((p) => p.slug)).toEqual(["brisa"]);
  });

  it("ordena por preço e por novidade", () => {
    expect(applyCatalogQuery(all, { ...EMPTY_QUERY, ordem: "menor-preco" }).map((p) => p.slug)).toEqual(["nuvem", "brisa", "sereno"]);
    expect(applyCatalogQuery(all, { ...EMPTY_QUERY, ordem: "maior-preco" }).map((p) => p.slug)).toEqual(["sereno", "brisa", "nuvem"]);
    expect(applyCatalogQuery(all, { ...EMPTY_QUERY, ordem: "novidades" }).map((p) => p.slug)).toEqual(["brisa", "sereno", "nuvem"]);
  });

  it("produto sem preço vai para o fim na ordenação por preço", () => {
    const semPreco = makeProduct({ slug: "sem-preco", variants: [], priceCents: null });
    expect(applyCatalogQuery([semPreco, ...all], { ...EMPTY_QUERY, ordem: "menor-preco" }).at(-1)!.slug).toBe("sem-preco");
  });
});

describe("catalogFacets", () => {
  it("só oferece filtros que existem nos dados", () => {
    const facets = catalogFacets(all);
    expect(facets.sizes.map((s) => s.key)).toEqual(["solteiro", "casal", "queen", "king"]);
    expect(facets.firmness.map((f) => f.key)).toEqual(["medio-macio", "medio", "medio-firme"]);
    expect(facets.price).toEqual({ minReais: 899, maxReais: 2799 });
    expect(facets.categories).toEqual([{ slug: "colchoes", name: "Colchões", count: 3 }]);
  });

  it("catálogo sem atributos não gera filtros", () => {
    const facets = catalogFacets([makeProduct({ attributes: {}, variants: [], priceCents: null })]);
    expect(facets.sizes).toEqual([]);
    expect(facets.firmness).toEqual([]);
    expect(facets.price).toBeNull();
  });
});

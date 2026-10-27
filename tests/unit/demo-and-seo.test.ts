import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_PRODUCTS } from "@/lib/catalog/demo-data";
import { recommendFirmness, recommendSizes, parseGuideAnswers } from "@/lib/catalog/guide";
import { isUuid } from "@/lib/catalog/slug";
import { productJsonLd } from "@/lib/seo/structured-data";
import { publishIssues } from "@/lib/validation/product";
import { rateLimit } from "@/lib/auth/rate-limit";
import { makeMedia, makeProduct, makeVariant } from "./factories";

describe("dados de demonstração", () => {
  const placeholders = DEMO_PRODUCTS.filter((p) => p.category?.slug === "colchoes");
  const armchair = DEMO_PRODUCTS.find((p) => p.slug === "poltrona-azul")!;

  it("são os três placeholders + a prévia da poltrona, em rascunho e não publicáveis", () => {
    expect(DEMO_PRODUCTS.map((p) => p.name)).toEqual([
      "Nuvem Essencial",
      "Brisa Premium",
      "Sereno Híbrido",
      "Poltrona Azul Estrutura Clara",
    ]);
    for (const p of DEMO_PRODUCTS) {
      expect(p.isDemo).toBe(true);
      expect(p.status).toBe("draft");
      expect(publishIssues(p).some((i) => i.field === "isDemo")).toBe(true);
    }
  });

  it("não inventam especificações (materiais, camadas, garantia, cuidados vazios)", () => {
    for (const p of DEMO_PRODUCTS) {
      expect(p.attributes.materials).toBeUndefined();
      expect(p.attributes.layers).toBeUndefined();
      expect(p.attributes.warranty).toBeUndefined();
      expect(p.attributes.care).toBeUndefined();
      expect(p.description).toMatch(/demonstrativo/i);
    }
  });

  it("poltrona: sem preço nem medidas inventados, só fotos aprovadas e 3D", () => {
    expect(armchair.category?.requires3d).toBe(true);
    expect(armchair.priceCents).toBeNull();
    expect(armchair.variants).toEqual([]);
    expect(armchair.dimensions).toEqual({});
    const images = armchair.media.filter((m) => m.type === "image");
    expect(images).toHaveLength(4);
    for (const m of images) expect(m).toMatchObject({ aiGenerated: true, pendingReview: false });
    expect(armchair.media.filter((m) => m.type === "model_3d")).toHaveLength(1);
  });

  it("todas as mídias têm alt text e arquivo existente; as dos placeholders são ilustrativas", () => {
    for (const p of DEMO_PRODUCTS) {
      for (const m of p.media) {
        if (placeholders.includes(p)) expect(m.isIllustrative).toBe(true);
        expect(m.altText.length).toBeGreaterThan(10);
        expect(existsSync(new URL(`../../public${m.url}`, import.meta.url)), m.url).toBe(true);
      }
    }
  });

  it("todos os ids são UUIDs válidos e únicos", () => {
    const ids = DEMO_PRODUCTS.flatMap((p) => [p.id, ...p.media.map((m) => m.id), ...p.variants.map((v) => v.id)]);
    for (const id of ids) expect(isUuid(id), id).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("dados estruturados (schema.org)", () => {
  const base = "https://loja.example";

  it("nunca para produto de demonstração", () => {
    expect(productJsonLd(DEMO_PRODUCTS[0], base)).toBeNull();
  });

  it("preço igual ao exibido e sem disponibilidade inventada", () => {
    const p = makeProduct({ variants: [makeVariant({ priceCents: 100000 }), makeVariant({ priceCents: 150000 })] });
    const ld = productJsonLd(p, base)!;
    expect(ld.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: "1000.00", highPrice: "1500.00", priceCurrency: "BRL" });
    expect(ld.offers).not.toHaveProperty("availability");
  });

  it("não inclui imagens ilustrativas", () => {
    const p = makeProduct({
      media: [makeMedia({ isIllustrative: true, url: "/demo/a.svg" }), makeMedia({ isPrimary: false, url: "https://cdn/x.jpg" })],
    });
    expect(productJsonLd(p, base)!.image).toEqual(["https://cdn/x.jpg"]);
  });

  it("informa disponibilidade quando o estoque é controlado", () => {
    const p = makeProduct({ variants: [], priceCents: 5000, stockQuantity: 0 });
    expect(productJsonLd(p, base)!.offers).toMatchObject({ "@type": "Offer", price: "50.00", availability: "https://schema.org/OutOfStock" });
  });
});

describe("guia de escolha", () => {
  it("recomenda faixas de firmeza por posição e preferência", () => {
    expect(recommendFirmness("lado", "nao-sei")).toEqual(["macio", "medio-macio", "medio"]);
    expect(recommendFirmness("brucos", "firme")).toEqual(["firme"]);
    expect(recommendFirmness("lado", "macio")).toEqual(["macio", "medio-macio"]);
    expect(recommendFirmness("costas", "equilibrado")).toEqual(["medio", "medio-firme"]);
  });

  it("recomenda tamanhos e respeita a cama informada", () => {
    expect(recommendSizes("dois", null)).toEqual(["casal", "queen", "king"]);
    expect(recommendSizes("um", "queen")).toEqual(["queen"]);
  });

  it("lê respostas da URL com segurança", () => {
    expect(parseGuideAnswers({ posicao: "lado", pessoas: "um" })).toEqual({ posicao: "lado", sensacao: "nao-sei", pessoas: "um", cama: null });
    expect(parseGuideAnswers({ posicao: "voando", pessoas: "um" })).toBeNull();
    expect(parseGuideAnswers({ posicao: "lado", pessoas: "um", cama: "<script>" })?.cama).toBeNull();
  });
});

describe("limite de tentativas", () => {
  it("bloqueia depois do limite e libera após a janela", () => {
    const key = `teste-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, { limit: 3, windowMs: 1000 }, 0).allowed).toBe(true);
    const blocked = rateLimit(key, { limit: 3, windowMs: 1000 }, 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(rateLimit(key, { limit: 3, windowMs: 1000 }, 1001).allowed).toBe(true);
  });
});

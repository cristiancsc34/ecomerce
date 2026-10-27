import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_PRODUCTS } from "@/lib/catalog/demo-data";
import { isUuid } from "@/lib/catalog/slug";
import { productJsonLd } from "@/lib/seo/structured-data";
import { publishIssues } from "@/lib/validation/product";
import { rateLimit } from "@/lib/auth/rate-limit";
import { makeMedia, makeProduct, makeVariant } from "./factories";

describe("dados de demonstração", () => {
  it("são só os dois produtos reais, em rascunho e não publicáveis", () => {
    expect(DEMO_PRODUCTS.map((p) => p.name)).toEqual(["Poltrona Azul Estrutura Clara", "Cadeira Cinza Trama"]);
    for (const p of DEMO_PRODUCTS) {
      expect(p.isDemo).toBe(true);
      expect(p.status).toBe("draft");
      expect(publishIssues(p).some((i) => i.field === "isDemo")).toBe(true);
    }
  });

  it("não inventam preço, medidas nem especificações", () => {
    for (const p of DEMO_PRODUCTS) {
      expect(p.priceCents).toBeNull();
      expect(p.variants).toEqual([]);
      expect(p.dimensions).toEqual({});
      expect(p.attributes).toEqual({});
      expect(p.description).toMatch(/demonstrativo/i);
    }
  });

  it("4 fotos de catálogo aprovadas por produto; 3D só onde já foi gerado", () => {
    for (const p of DEMO_PRODUCTS) {
      const images = p.media.filter((m) => m.type === "image");
      expect(images).toHaveLength(4);
      for (const m of images) expect(m).toMatchObject({ aiGenerated: true, pendingReview: false, isIllustrative: false });
    }
    expect(DEMO_PRODUCTS.map((p) => p.media.some((m) => m.type === "model_3d"))).toEqual([true, false]);
  });

  it("todas as mídias têm alt text e arquivo existente", () => {
    for (const p of DEMO_PRODUCTS) {
      for (const m of p.media) {
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

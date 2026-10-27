import { describe, expect, it } from "vitest";
import { quoteCart } from "@/lib/cart/quote";
import { cartQuoteRequestSchema } from "@/lib/cart/types";
import { availability, fromPriceCents, hasPriceRange, toPriceCents } from "@/lib/catalog/product-helpers";
import { makeProduct, makeVariant } from "./factories";

describe("preço exibido", () => {
  it("usa o menor e o maior preço entre produto e variações", () => {
    const p = makeProduct({ priceCents: null, variants: [makeVariant({ priceCents: 300 }), makeVariant({ priceCents: 100 })] });
    expect(fromPriceCents(p)).toBe(100);
    expect(toPriceCents(p)).toBe(300);
    expect(hasPriceRange(p)).toBe(true);
    expect(fromPriceCents(makeProduct({ priceCents: null, variants: [] }))).toBeNull();
  });

  it("com variações, ignora o preço-base (não anuncia um preço que a sacola não vende)", () => {
    const p = makeProduct({ priceCents: 50, variants: [makeVariant({ priceCents: 300 }), makeVariant({ priceCents: 100 })] });
    expect(fromPriceCents(p)).toBe(100);
    expect(toPriceCents(p)).toBe(300);
    expect(fromPriceCents(makeProduct({ priceCents: 19900, variants: [] }))).toBe(19900);
  });
});

describe("disponibilidade", () => {
  it("não inventa estoque: sem controle, não informa nada", () => {
    expect(availability(makeProduct({ stockQuantity: null, variants: [] }))).toBeNull();
  });

  it("usa o estoque da variação e herda o do produto quando a variação não controla", () => {
    const v = makeVariant({ stockQuantity: 0 });
    expect(availability(makeProduct({ variants: [v] }), v)).toBe("out_of_stock");
    const livre = makeVariant({ stockQuantity: null });
    expect(availability(makeProduct({ stockQuantity: 3, variants: [livre] }), livre)).toBe("in_stock");
    expect(availability(makeProduct({ stockQuantity: null, variants: [livre] }), livre)).toBeNull();
  });

  it("sem variação escolhida, só conclui se todas as variações forem controladas", () => {
    const a = makeVariant({ stockQuantity: 0 });
    const b = makeVariant({ stockQuantity: 2 });
    expect(availability(makeProduct({ variants: [a, b] }))).toBe("in_stock");
    expect(availability(makeProduct({ variants: [a, makeVariant({ stockQuantity: 0 })] }))).toBe("out_of_stock");
    expect(availability(makeProduct({ variants: [a, makeVariant({ stockQuantity: null })] }))).toBeNull();
  });
});

describe("cotação da sacola no servidor", () => {
  const casal = makeVariant({ priceCents: 129900, size: "casal" });
  const queen = makeVariant({ priceCents: 159900, size: "queen", stockQuantity: 2 });
  const produto = makeProduct({ name: "Nuvem", variants: [casal, queen] });
  const avulso = makeProduct({ name: "Travesseiro", variants: [], priceCents: 19900 });

  it("o pedido do navegador não tem campo de preço (é descartado na validação)", () => {
    const parsed = cartQuoteRequestSchema.parse({
      items: [{ productId: produto.id, variantId: casal.id, quantity: 1, priceCents: 1 }],
    });
    expect(parsed.items[0]).not.toHaveProperty("priceCents");
  });

  it("calcula com o preço do catálogo", () => {
    const q = quoteCart(
      [
        { productId: produto.id, variantId: casal.id, quantity: 2 },
        { productId: avulso.id, variantId: null, quantity: 1 },
      ],
      [produto, avulso],
    );
    expect(q.lines.map((l) => l.unitPriceCents)).toEqual([129900, 19900]);
    expect(q.subtotalCents).toBe(129900 * 2 + 19900);
    expect(q.issues).toEqual([]);
  });

  it("remove itens que não existem mais ou sem variação válida", () => {
    const q = quoteCart(
      [
        { productId: "00000000-0000-4000-8000-0000000009aa", variantId: null, quantity: 1 },
        { productId: produto.id, variantId: null, quantity: 1 },
        { productId: produto.id, variantId: "00000000-0000-4000-8000-0000000009bb", quantity: 1 },
      ],
      [produto],
    );
    expect(q.lines).toEqual([]);
    expect(q.normalizedItems).toEqual([]);
    expect(q.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("ajusta a quantidade ao estoque e junta linhas repetidas", () => {
    const q = quoteCart(
      [
        { productId: produto.id, variantId: queen.id, quantity: 2 },
        { productId: produto.id, variantId: queen.id, quantity: 3 },
      ],
      [produto],
    );
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0].quantity).toBe(2);
    expect(q.issues.some((i) => i.includes("estoque"))).toBe(true);
  });

  it("remove item indisponível e sinaliza demonstração", () => {
    const esgotado = makeVariant({ stockQuantity: 0 });
    const demo = makeProduct({ isDemo: true, variants: [esgotado, casal] });
    const q = quoteCart(
      [
        { productId: demo.id, variantId: esgotado.id, quantity: 1 },
        { productId: demo.id, variantId: casal.id, quantity: 1 },
      ],
      [demo],
    );
    expect(q.lines).toHaveLength(1);
    expect(q.hasDemoItems).toBe(true);
  });
});

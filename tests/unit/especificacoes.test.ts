import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SizeTable } from "@/components/product/specs";
import { makeProduct, makeVariant } from "./factories";

// A galeria (3D/câmera) e o painel de compra não fazem parte deste teste: só a ordem dos blocos e o link.
vi.mock("@/components/product/product-media", () => ({ ProductMedia: () => null }));
vi.mock("@/components/product/purchase-panel", () => ({ PurchasePanel: () => null, PurchasePanelWithParams: () => null }));

const { ProductView } = await import("@/components/product/product-view");

const renderTable = (p: ReturnType<typeof makeProduct>) => renderToStaticMarkup(createElement(SizeTable, { product: p }));
const renderView = (p: ReturnType<typeof makeProduct>) =>
  renderToStaticMarkup(createElement(ProductView, { product: p, preview: true }));

describe("medidas por tamanho (celular em cartões, tabela a partir de sm)", () => {
  it("um cartão por tamanho só no celular e a tabela só a partir de sm, sem largura mínima", () => {
    const product = makeProduct({
      dimensions: { heightCm: 25 },
      variants: [makeVariant({ size: "casal", sortOrder: 0 }), makeVariant({ size: "queen", widthCm: 158, lengthCm: 198, sortOrder: 1 })],
    });
    const html = renderTable(product);
    expect(html).toContain('<ul class="space-y-2 sm:hidden"');
    expect(html.match(/<li class="rounded-lg border border-line p-3">/g)).toHaveLength(2);
    expect(html).toContain('<p class="font-semibold text-ink">Casal</p>');
    expect(html).toContain('<p class="text-[0.9375rem]">138 × 188 cm</p>');
    expect(html).toContain('<p class="text-sm text-muted">Altura: 25 cm</p>');
    expect(html).toMatch(/<div class="hidden [^"]*sm:block"><table/);
    expect(html).not.toContain("min-w-[28rem]");
  });

  it("sem altura cadastrada, o cartão não inventa: a linha de altura não aparece", () => {
    const product = makeProduct({ dimensions: {}, variants: [makeVariant({ size: "casal" })] });
    const html = renderTable(product);
    expect(html).not.toContain("Altura:");
  });

  it("sem tamanho cadastrado, nada aparece (como antes)", () => {
    expect(renderTable(makeProduct({ variants: [] }))).toBe("");
  });
});

describe("página de produto: especificações antes da descrição e link “Ver medidas”", () => {
  it("com medidas: link para o bloco e Especificações vem antes da Descrição", () => {
    const html = renderView(makeProduct({ variants: [makeVariant({ size: "casal" })] }));
    expect(html).toContain('href="#especificacoes-titulo"');
    expect(html).toContain(">Ver medidas</a>");
    expect(html).toContain('id="especificacoes-titulo"');
    expect(html.indexOf('id="especificacoes-titulo"')).toBeLessThan(html.indexOf('id="descricao-titulo"'));
  });

  it("sem nenhuma medida ou especificação: nem bloco nem link", () => {
    const html = renderView(makeProduct({ variants: [], dimensions: {}, attributes: {} }));
    expect(html).not.toContain("Ver medidas");
    expect(html).not.toContain('id="especificacoes-titulo"');
    expect(html).toContain('id="descricao-titulo"');
  });
});

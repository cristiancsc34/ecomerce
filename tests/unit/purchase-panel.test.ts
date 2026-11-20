import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it } from "vitest";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { makeProduct, makeVariant } from "./factories";

/**
 * Painel de compra (issue #8). A vitrine de demonstração não tem produto com
 * preço; aqui o produto vem da fábrica de testes (nada disso vai para a loja).
 */
const router = { push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} };

function render(product: ReturnType<typeof makeProduct>, has3d = true) {
  const html = renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router as never },
      createElement(PurchasePanel, { product, has3d }),
    ),
  );
  const bar = html.match(/<div data-barra-fixa[\s\S]*$/)?.[0] ?? null;
  const desktop = html.match(/<div class="hidden lg:grid lg:gap-2">([\s\S]*?)<div id="[^"]*-feedback"/)?.[1] ?? "";
  return { html, bar, desktop };
}

const labels = (html: string) => [...html.matchAll(/<(button|a)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2].replace(/<[^>]+>/g, "").trim());

describe("painel de compra", () => {
  it("celular: barra com o link 3D de sempre e um único 'Comprar agora'", () => {
    const { bar } = render(makeProduct());
    expect(bar).not.toBeNull();
    expect(bar).toContain("lg:hidden");
    expect(labels(bar!)).toEqual(["3D", "Comprar agora"]);
    // Link 3D sem mudança (marcação e classes de antes).
    expect(bar).toContain(
      'class="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-deep-fjord"',
    );
    expect(bar).toContain("h-full flex-1 rounded-none! text-base!");
    expect(bar).not.toContain("Adicionar à sacola");
  });

  it("celular sem 3D: só 'Comprar agora' na barra", () => {
    const { bar } = render(makeProduct(), false);
    expect(labels(bar!)).toEqual(["Comprar agora"]);
  });

  it("falta escolher a variação: o botão único de antes", () => {
    const product = makeProduct({ variants: [makeVariant(), makeVariant({ size: "queen", name: "Queen" })] });
    const { bar } = render(product, false);
    expect(labels(bar!)).toEqual(["Escolha um tamanho"]);
  });

  it("computador: Comprar agora (largura total) > Adicionar à sacola > Ver em 3D, nessa ordem", () => {
    const { desktop } = render(makeProduct());
    expect(labels(desktop)).toEqual(["Comprar agora", "Adicionar à sacola", "Ver em 3D"]);
    expect(desktop).toMatch(/<button[^>]*class="[^"]*w-full min-h-12[^"]*"[^>]*>Comprar agora/);
    expect(desktop).toMatch(/<button[^>]*class="[^"]*bg-white text-deep-fjord border[^"]*w-full[^"]*"[^>]*>.*Adicionar à sacola/);
  });

  it("sem preço: 'Preço em breve' + aviso; sem assistente, nenhum botão de dúvidas nem valor", () => {
    const { html, bar, desktop } = render(makeProduct({ variants: [], priceCents: null }), false);
    expect(html).toContain('<span class="text-xl font-semibold text-ink">Preço em breve</span>');
    expect(html).toContain("Este produto ainda não está à venda pelo site.");
    expect(html).not.toMatch(/R\$/);
    expect(html).not.toContain("Tirar dúvidas");
    expect(html).not.toContain("Comprar agora");
    expect(labels(desktop)).toEqual([]);
    // Sem assistente e sem 3D: nada de barra vazia.
    expect(bar).toBeNull();
  });

  it("sem preço, com 3D e sem assistente: barra como antes (aviso + Girar em 3D)", () => {
    const { bar } = render(makeProduct({ variants: [], priceCents: null }), true);
    expect(labels(bar!)).toEqual(["Girar em 3D"]);
    expect(bar).toContain("Preço em breve");
  });
});

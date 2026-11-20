import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductView } from "@/components/product/product-view";
import { DEMO_PRODUCTS } from "@/lib/catalog/demo-data";
import { makeProduct, makeVariant } from "../../unit/factories";

/**
 * HTML do `ProductView` de um produto das fábricas de teste com medidas por
 * tamanho (os produtos de demonstração não têm medidas, e não inventamos).
 * Carregado pelo Vite (ver especificacoes.spec.ts), não pelo Playwright.
 */
export function produtoComMedidasHtml(): string {
  const product = makeProduct({
    name: "Colchão de Teste",
    // Foto local da demonstração (a da fábrica aponta para um endereço que o next/image recusa).
    media: DEMO_PRODUCTS[0].media.filter((m) => m.type === "image"),
    dimensions: { heightCm: 25 },
    attributes: { firmness: "medio" },
    variants: [
      makeVariant({ size: "solteiro", widthCm: null, lengthCm: null, sortOrder: 0 }),
      makeVariant({ size: "casal", sortOrder: 1 }),
      makeVariant({ size: "queen", widthCm: null, lengthCm: null, sortOrder: 2 }),
      makeVariant({ size: "king", widthCm: null, lengthCm: null, sortOrder: 3 }),
    ],
  });
  return renderToStaticMarkup(createElement(ProductView, { product, preview: true }));
}

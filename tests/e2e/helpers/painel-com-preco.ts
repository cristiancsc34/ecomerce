import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { makeProduct } from "../../unit/factories";

/**
 * Painel de compra de um produto COM preço, vindo da fábrica de testes (a
 * vitrine de demonstração não tem nenhum). Carregado pelo Vite em
 * `pdp-cta.spec.ts`, porque o Playwright transforma o JSX dos componentes no
 * formato próprio dele. Nada disso entra na loja.
 */
const router = { push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} };

export function pricedPanelHtml(): string {
  return renderToStaticMarkup(
    createElement(AppRouterContext.Provider, { value: router as never }, createElement(PurchasePanel, { product: makeProduct(), has3d: true })),
  );
}

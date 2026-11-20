import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { makeProduct } from "../../unit/factories";

/**
 * Painel de compra de um produto COM preço, vindo da fábrica de testes (a
 * vitrine de demonstração não tem nenhum). Carregado pelo Vite em
 * `pdp-cta.spec.ts`, porque o Playwright transforma o JSX dos componentes no
 * formato próprio dele. `next/link` e `next/navigation` entram pelos atalhos de
 * `tests/e2e/apoio/` (sem arquivos internos do Next, que quebravam no CI).
 * Nada disso entra na loja.
 */
export function pricedPanelHtml(): string {
  return renderToStaticMarkup(createElement(PurchasePanel, { product: makeProduct(), has3d: true }));
}

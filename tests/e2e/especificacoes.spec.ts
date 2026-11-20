import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { createServer } from "vite";

/**
 * Especificações na página de produto (issue #11, item 5).
 *
 * Os produtos de demonstração não têm medidas (e não vamos inventar), então o
 * teste usa um produto das fábricas de teste: a página de produto real é aberta
 * (com o CSS e o cabeçalho fixo da loja) e o conteúdo principal é trocado pelo
 * `ProductView` desse produto, renderizado pelo próprio componente.
 *
 * O componente é renderizado pelo Vite (com os atalhos do vitest.config.ts):
 * o Playwright transforma JSX em objetos próprios e não renderiza componentes.
 */
let html = "";
const root = path.resolve(__dirname, "../..");

test.beforeAll(async () => {
  const vite = await createServer({
    configFile: false,
    root,
    resolve: {
      alias: [
        { find: /^@\//, replacement: `${root}/` },
        { find: /^server-only$/, replacement: `${root}/tests/stubs/server-only.ts` },
        { find: /^next\/link$/, replacement: `${root}/tests/e2e/apoio/next-link.ts` },
        { find: /^next\/image$/, replacement: `${root}/tests/e2e/apoio/next-image.ts` },
        { find: /^\.\/purchase-panel$/, replacement: `${root}/tests/e2e/apoio/painel-de-compra-vazio.ts` },
      ],
    },
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });
  try {
    const mod = await vite.ssrLoadModule("/tests/e2e/apoio/produto-com-medidas.ts");
    html = mod.produtoComMedidasHtml();
  } finally {
    await vite.close();
  }
});

async function abrirProdutoComMedidas(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/produtos/poltrona-azul");
  // Espera a página assentar (hidratação e streaming) antes de trocar o conteúdo.
  await page.waitForLoadState("networkidle");
  await page.evaluate((markup) => {
    const main = document.querySelector("main") ?? document.body;
    main.innerHTML = markup;
    window.scrollTo(0, 0);
  }, html);
}

const sobraLateral = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("especificações no celular (390 px)", () => {
  test("cartões por tamanho, sem rolagem lateral, e “Ver medidas” leva ao bloco", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "roda no projeto de celular");
    await abrirProdutoComMedidas(page, 390, 844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

    const bloco = page.locator('section[aria-labelledby="especificacoes-titulo"]');
    const cartoes = bloco.locator("ul.sm\\:hidden > li");
    await expect(cartoes).toHaveCount(4);
    await expect(cartoes.first()).toBeVisible();
    await expect(cartoes.nth(1)).toContainText("Casal");
    await expect(cartoes.nth(1)).toContainText("138 × 188 cm");
    await expect(cartoes.nth(1)).toContainText("Altura: 25 cm");
    await expect(bloco.locator("table")).toBeHidden();

    // Especificações antes da descrição.
    const ordem = await page.evaluate(() => {
      const specs = document.getElementById("especificacoes-titulo")!;
      const desc = document.getElementById("descricao-titulo")!;
      return Boolean(specs.compareDocumentPosition(desc) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(ordem).toBe(true);

    const link = page.getByRole("link", { name: "Ver medidas" });
    await expect(link).toBeVisible();
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // Toque pelo próprio navegador (o click do Playwright espera uma navegação que a âncora não faz).
    await link.evaluate((a: HTMLAnchorElement) => a.click());
    await expect(page).toHaveURL(/#especificacoes-titulo$/);
    await expect(page.locator("#especificacoes-titulo")).toBeInViewport();
  });
});

test.describe("especificações no computador (1440 px)", () => {
  test("tabela completa, antes da descrição, sem os cartões", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "roda no projeto de computador");
    await abrirProdutoComMedidas(page, 1440, 900);
    const bloco = page.locator('section[aria-labelledby="especificacoes-titulo"]');
    const tabela = bloco.locator("table");
    await expect(tabela).toBeVisible();
    await expect(bloco.locator("ul.sm\\:hidden")).toBeHidden();
    await expect(tabela.locator("thead th")).toHaveText(["Tamanho", "Largura × comprimento", "Altura", "Preço"]);
    await expect(tabela.locator("tbody tr")).toHaveCount(4);

    // A tabela cabe inteira na largura do bloco (nada cortado, nada rolando para o lado).
    const cabe = await tabela.evaluate((t) => t.scrollWidth <= (t.parentElement as HTMLElement).clientWidth);
    expect(cabe).toBe(true);
    expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

    const specsTop = (await page.locator("#especificacoes-titulo").boundingBox())!.y;
    const descTop = (await page.locator("#descricao-titulo").boundingBox())!.y;
    expect(specsTop).toBeLessThan(descTop);
  });
});

test.describe("produto sem medidas (demonstração)", () => {
  test("sem dado, nem bloco de especificações nem “Ver medidas”", async ({ page }) => {
    await page.goto("/produtos/poltrona-azul");
    await expect(page.locator("#especificacoes-titulo")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ver medidas" })).toHaveCount(0);
  });
});

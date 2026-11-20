import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Página de produto: barra do celular com uma ação só, hierarquia no computador
 * e saída útil para produto sem preço (issue #8).
 *
 * A vitrine de demonstração não tem produto com preço. Para medir o layout com
 * preço no navegador, o painel é renderizado com a fábrica de testes
 * (`helpers/painel-com-preco.ts`) e colocado na página real da poltrona (mesmo
 * CSS). É só marcação: os cliques não rodam o React. Nada disso entra na loja.
 */
let pricedPanel = "";

test.beforeAll(async () => {
  const root = path.resolve(__dirname, "../..") + "/";
  const { createServer } = await import("vite");
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    resolve: { alias: [{ find: /^@\//, replacement: root }] },
  });
  try {
    const mod = await server.ssrLoadModule("/tests/e2e/helpers/painel-com-preco.ts");
    pricedPanel = mod.pricedPanelHtml();
  } finally {
    await server.close();
  }
});

/** Troca o painel da página pelo painel com preço (renderizado acima). */
async function withPricedPanel(page: Page) {
  await page.goto("/produtos/poltrona-azul");
  // Espera a página assentar (cópia escondida do Next resolvida e assistente montado) antes de trocar.
  await expect(page.getByTestId("preco-atual")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator("html[data-assistente=on]")).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  await page.evaluate((html) => {
    const original = document.querySelector('[data-testid="preco-atual"]')!.closest(".space-y-4")! as HTMLElement;
    const holder = document.createElement("div");
    holder.dataset.teste = "painel-com-preco";
    holder.innerHTML = html;
    original.after(holder);
    // Esconde (sem remover) o painel do React, e a barra dele junto.
    original.hidden = true;
    original.querySelector<HTMLElement>("[data-barra-fixa]")?.removeAttribute("data-barra-fixa");
  }, pricedPanel);
  return page.locator('[data-teste="painel-com-preco"]');
}

test.describe("390×844 (celular)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "medida no celular");
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("com preço: barra de 56 px com o 3D e um único 'Comprar agora', sem quebra, e Ajuda acima", async ({ page }) => {
    const panel = await withPricedPanel(page);
    const bar = panel.locator("[data-barra-fixa]");
    await expect(bar).toBeVisible();
    expect((await bar.boundingBox())!.height).toBe(56);
    await expect(bar.getByRole("button")).toHaveText(["Comprar agora"]);
    await expect(bar.getByRole("link")).toHaveText(["3D"]);
    await expect(bar.getByText("Adicionar à sacola")).toHaveCount(0);
    // Nenhum rótulo quebra linha.
    const wraps = await bar.locator("a, button").evaluateAll((els) => els.map((e) => e.scrollHeight - e.clientHeight));
    expect(wraps).toEqual([0, 0]);
    expect(await bar.locator("button").evaluate((e) => getComputedStyle(e).fontSize)).toBe("16px");
    // O botão Ajuda fica acima da barra.
    const ajuda = await page.getByRole("button", { name: "Ajuda" }).boundingBox();
    const barBox = await bar.boundingBox();
    expect(ajuda!.y + ajuda!.height).toBeLessThanOrEqual(barBox!.y);
    // O bloco do computador não aparece.
    await expect(panel.getByRole("button", { name: "Adicionar à sacola" })).toBeHidden();
  });

  test("sem preço com 3D: barra com 'Tirar dúvidas' e 'Girar em 3D'; o toque abre o assistente com as sugestões do produto", async ({ page }) => {
    await page.goto("/produtos/poltrona-azul");
    await expect(page.getByTestId("preco-atual")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId("preco-atual")).toHaveText("Preço em breve");
    await expect(page.getByText("Este produto ainda não está à venda pelo site.")).toBeVisible();
    const bar = page.locator("[data-barra-fixa]").filter({ visible: true });
    const ask = bar.getByRole("button", { name: "Tirar dúvidas com o assistente" });
    // Rótulo visível curto; o nome acessível completo vem do texto só para leitor de tela.
    await expect(ask.locator(".sr-only")).toHaveText(" com o assistente");
    await expect(bar.getByRole("link", { name: "Girar em 3D" })).toBeVisible();
    expect((await bar.boundingBox())!.height).toBe(56);
    const wraps = await bar.locator("a, button").evaluateAll((els) => els.map((e) => e.scrollHeight - e.clientHeight));
    expect(wraps).toEqual([0, 0]);
    await expect(page.getByText(/R\$/)).toHaveCount(0);
    await ask.tap();
    const chat = page.getByRole("dialog", { name: "Assistente da loja" });
    await expect(chat).toBeVisible();
    await expect(chat.getByRole("button", { name: "Me conta mais sobre este produto" })).toBeVisible();
  });

  test("sem preço e sem 3D: a barra aparece só com 'Tirar dúvidas'", async ({ page }) => {
    await page.goto("/produtos/cadeira-cinza-trama");
    const bar = page.locator("[data-barra-fixa]").filter({ visible: true });
    await expect(bar.getByRole("button")).toHaveText(["Tirar dúvidas com o assistente"]);
    await expect(bar.getByRole("link")).toHaveCount(0);
    await bar.getByRole("button", { name: "Tirar dúvidas com o assistente" }).tap();
    await expect(page.getByRole("dialog", { name: "Assistente da loja" })).toBeVisible();
  });
});

test.describe("1440 (computador)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "medida no computador");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("com preço: barra oculta; Comprar agora (100%) > Adicionar à sacola > Ver em 3D, e a tabulação nessa ordem", async ({ page }) => {
    const panel = await withPricedPanel(page);
    await expect(panel.locator("[data-barra-fixa]")).toBeHidden();
    const buy = panel.getByRole("button", { name: "Comprar agora" }).filter({ visible: true });
    const add = panel.getByRole("button", { name: "Adicionar à sacola" }).filter({ visible: true });
    const view3d = panel.getByRole("link", { name: "Ver em 3D" }).filter({ visible: true });
    const column = await buy.locator("..").boundingBox();
    const buyBox = await buy.boundingBox();
    expect(buyBox!.width).toBe(column!.width);
    expect(buyBox!.y).toBeLessThan((await add.boundingBox())!.y);
    expect((await add.boundingBox())!.y).toBeLessThan((await view3d.boundingBox())!.y);
    await buy.focus();
    await page.keyboard.press("Tab");
    await expect(add).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(view3d).toBeFocused();
  });

  test("sem preço: aviso e 'Tirar dúvidas com o assistente' abaixo do preço abre o painel, sem valor", async ({ page }) => {
    await page.goto("/produtos/poltrona-azul");
    await expect(page.getByTestId("preco-atual")).toHaveCount(1, { timeout: 15_000 });
    const price = page.getByTestId("preco-atual");
    await expect(price).toHaveText("Preço em breve");
    await expect(page.getByText("Este produto ainda não está à venda pelo site.")).toBeVisible();
    await expect(page.locator("[data-barra-fixa]").filter({ visible: true })).toHaveCount(0);
    const ask = page.getByRole("button", { name: "Tirar dúvidas com o assistente" }).filter({ visible: true });
    await expect(ask).toHaveCount(1);
    expect((await ask.boundingBox())!.y).toBeGreaterThan((await price.boundingBox())!.y);
    // "Ver em 3D" continua como antes, logo abaixo.
    await expect(page.getByRole("link", { name: "Ver em 3D" })).toBeVisible();
    await expect(page.getByText(/R\$/)).toHaveCount(0);
    await ask.click();
    const chat = page.getByRole("dialog", { name: "Assistente da loja" });
    await expect(chat).toBeVisible();
    await expect(chat.getByRole("button", { name: "Me conta mais sobre este produto" })).toBeVisible();
  });
});

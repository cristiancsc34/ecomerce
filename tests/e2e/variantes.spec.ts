import { expect, test } from "@playwright/test";

/**
 * Troca de cor com as CORES DE EXEMPLO do ambiente de desenvolvimento
 * (CATALOG_DEV_EXAMPLES=1 no servidor; ver lib/catalog/dev-examples.ts).
 * No CI e no E2E padrão as cores não existem e este arquivo é pulado; para rodar:
 *
 *   CATALOG_DEV_EXAMPLES=1 CATALOG_SOURCE=demo npm run dev
 *   CATALOG_DEV_EXAMPLES=1 npx playwright test tests/e2e/variantes.spec.ts   (com baseURL no servidor acima)
 */
test.skip(process.env.CATALOG_DEV_EXAMPLES !== "1", "só com as cores de exemplo ligadas no servidor");

test.describe("variantes de cor (exemplo de desenvolvimento)", () => {
  test("trocar a cor muda as fotos, o modelo 3D e o link do AR", async ({ page }, testInfo) => {
    await page.goto("/produtos/poltrona-azul");
    // Enquanto a página termina de chegar, o Next pode manter uma cópia escondida: olha só a visível.
    const selector = page.getByTestId("seletor-cor").filter({ visible: true });
    await expect(selector.getByRole("radio")).toHaveCount(5);
    await expect(selector).toContainText("Cor: Azul");
    await expect(selector.getByText("Cores de exemplo, só no ambiente de desenvolvimento")).toBeVisible();

    await selector.getByRole("radio", { name: "Marrom" }).check({ force: true });
    await expect(page).toHaveURL(/\?cor=marrom$/);
    await expect(selector).toContainText("Cor: Marrom");
    const stage = page.getByRole("region", { name: "Fotos e 3D: Poltrona Azul Estrutura Clara" });
    await expect(stage.getByRole("img", { name: /Poltrona marrom, vista frontal/ })).toBeVisible();
    await expect(stage.getByText("Imagem ilustrativa", { exact: true })).toBeVisible();

    // 3D: o mesmo arquivo com as cores (KHR_materials_variants), na cor escolhida.
    await stage.getByRole("button", { name: "Girar em 3D" }).click();
    const viewer = page.locator("model-viewer:not([data-abre-camera])");
    // A biblioteca do 3D pode demorar com vários testes ao mesmo tempo.
    await expect(viewer).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => viewer.evaluate((v) => (v as unknown as { src: string }).src), { timeout: 30_000 }).toBe("/demo/exemplo/poltrona-cores.glb");
    await expect.poll(() => viewer.evaluate((v) => (v as unknown as { variantName: string | null }).variantName), { timeout: 30_000 }).toBe("marrom");
    await selector.getByRole("radio", { name: "Vermelho" }).check({ force: true });
    await expect.poll(() => viewer.evaluate((v) => (v as unknown as { variantName: string | null }).variantName), { timeout: 30_000 }).toBe("vermelho");

    if (testInfo.project.name === "desktop") {
      // O código QR leva a cor junto.
      await stage.getByRole("button", { name: "Ver no seu ambiente" }).click();
      await expect(page.getByTestId("link-ar")).toHaveText(/\/produtos\/poltrona-azul\?ar=1&cor=vermelho$/);
      await expect(page.getByRole("dialog", { name: "Ver no seu ambiente" })).toContainText("a Poltrona Azul Estrutura Clara (vermelho)");
    }
  });

  test("link com ?cor= abre na cor certa; no celular, ?ar=1&cor= já mostra o 3D nessa cor", async ({ page }, testInfo) => {
    await page.goto("/produtos/poltrona-azul?cor=bege");
    // Enquanto a página termina de chegar, o Next pode manter uma cópia escondida: olha só a visível.
    await expect(page.getByTestId("seletor-cor").filter({ visible: true })).toContainText("Cor: Bege");
    await expect(page.getByRole("img", { name: /Poltrona bege, vista frontal/ }).first()).toBeVisible();
    if (testInfo.project.name !== "mobile") return;
    await page.goto("/produtos/poltrona-azul?ar=1&cor=branco");
    const viewer = page.locator("model-viewer:not([data-abre-camera])");
    await expect(viewer).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => viewer.evaluate((v) => (v as unknown as { variantName: string | null }).variantName), { timeout: 30_000 }).toBe("branco");
    await expect(page.getByRole("button", { name: "Abrir no seu ambiente" })).toBeVisible();
  });
});

import { expect, test, type Page } from "@playwright/test";

/**
 * Sacola: "Remover" com "Desfazer" e sacola vazia levando ao catálogo (issue #9, item 8).
 * No modo demonstração nenhum produto tem preço, então a cotação da loja é simulada a partir dos itens enviados.
 * A barra fixa do celular só aparece com a compra pelo site ligada: está em tests/e2e-supabase/sacola-resumo.spec.ts.
 */

const PRODUTOS: Record<string, { slug: string; name: string; unitPriceCents: number }> = {
  "00000000-0000-4000-8000-000000000001": { slug: "poltrona-azul", name: "Poltrona Teste A", unitPriceCents: 12990 },
  "00000000-0000-4000-8000-000000000002": { slug: "cadeira-cinza-trama", name: "Cadeira Teste B", unitPriceCents: 5000 },
};

type Item = { productId: string; variantId: string | null; quantity: number };

async function sacola(page: Page, itens: Item[]) {
  await page.addInitScript((value) => {
    // Só na primeira carga: depois a sacola é a que o teste deixou.
    if (!window.sessionStorage.getItem("sacola-teste")) {
      window.sessionStorage.setItem("sacola-teste", "1");
      window.localStorage.setItem("cuxoes:cart:v1", value);
    }
  }, JSON.stringify(itens));
  await page.route("**/api/cart/quote", async (route) => {
    const { items } = route.request().postDataJSON() as { items: Item[] };
    const lines = items.map((i) => {
      const p = PRODUTOS[i.productId];
      return {
        ...i,
        slug: p.slug,
        name: p.name,
        variantName: null,
        imageUrl: "/demo/poltrona-azul-frente.jpg",
        imageAlt: "Foto do produto",
        imageIsIllustrative: false,
        unitPriceCents: p.unitPriceCents,
        lineTotalCents: p.unitPriceCents * i.quantity,
        isDemo: false,
      };
    });
    await route.fulfill({
      json: {
        lines,
        subtotalCents: lines.reduce((s, l) => s + l.lineTotalCents, 0),
        issues: [],
        hasDemoItems: false,
        normalizedItems: items,
      },
    });
  });
}

const itensSalvos = (page: Page) =>
  page.evaluate(() => JSON.parse(window.localStorage.getItem("cuxoes:cart:v1") ?? "[]") as { productId: string; quantity: number }[]);

for (const width of [390, 1440]) {
  test.describe(`sacola em ${width} px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    });

    test("Remover mostra Desfazer, que devolve o item com a mesma quantidade", async ({ page }) => {
      await sacola(page, [
        { productId: "00000000-0000-4000-8000-000000000001", variantId: null, quantity: 3 },
        { productId: "00000000-0000-4000-8000-000000000002", variantId: null, quantity: 1 },
      ]);
      await page.goto("/carrinho");
      await expect(page.getByRole("link", { name: "Poltrona Teste A" })).toBeVisible();

      await page.getByRole("button", { name: /Remover\s+Poltrona Teste A/ }).click();
      const aviso = page.getByRole("status").filter({ hasText: "Poltrona Teste A foi removido da sacola." });
      await expect(aviso).toBeVisible();
      await expect(page.getByRole("link", { name: "Poltrona Teste A" })).toHaveCount(0);

      const desfazer = aviso.getByRole("button", { name: "Desfazer" });
      const caixa = await desfazer.boundingBox();
      expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);

      await desfazer.click();
      await expect(aviso).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Poltrona Teste A" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Quantidade de Poltrona Teste A" })).toContainText("3");
      expect((await itensSalvos(page)).find((i) => i.productId.endsWith("1"))?.quantity).toBe(3);
    });

    test("ao esvaziar a sacola, o aviso fica acima do estado vazio e Ver produtos abre o catálogo", async ({ page }) => {
      await sacola(page, [{ productId: "00000000-0000-4000-8000-000000000002", variantId: null, quantity: 2 }]);
      await page.goto("/carrinho");
      await page.getByRole("button", { name: /Remover\s+Cadeira Teste B/ }).click();

      const vazia = page.getByRole("heading", { name: "Sua sacola está vazia" });
      const aviso = page.getByRole("status").filter({ hasText: "Cadeira Teste B foi removido da sacola." });
      await expect(vazia).toBeVisible();
      await expect(aviso).toBeVisible();
      expect((await aviso.boundingBox())!.y).toBeLessThan((await vazia.boundingBox())!.y);

      // Desfazer funciona também a partir da sacola vazia.
      await aviso.getByRole("button", { name: "Desfazer" }).click();
      await expect(page.getByRole("group", { name: "Quantidade de Cadeira Teste B" })).toContainText("2");

      await page.getByRole("button", { name: /Remover\s+Cadeira Teste B/ }).click();
      const verProdutos = page.getByRole("link", { name: "Ver produtos" });
      await expect(verProdutos).toHaveAttribute("href", "/produtos");
      await verProdutos.click();
      await expect(page).toHaveURL(/\/produtos$/);
    });

    test("o aviso de Desfazer some sozinho depois de alguns segundos", async ({ page }) => {
      await sacola(page, [
        { productId: "00000000-0000-4000-8000-000000000001", variantId: null, quantity: 1 },
        { productId: "00000000-0000-4000-8000-000000000002", variantId: null, quantity: 1 },
      ]);
      await page.goto("/carrinho");
      await expect(page.getByRole("link", { name: "Cadeira Teste B" })).toBeVisible();
      await page.clock.install();
      await page.getByRole("button", { name: /Remover\s+Cadeira Teste B/ }).click();
      const aviso = page.getByRole("status").filter({ hasText: "Cadeira Teste B foi removido da sacola." });
      await expect(aviso).toBeVisible();
      await page.clock.runFor(8100);
      await expect(aviso).toHaveCount(0);
    });
  });
}

test("1440 px: sem barra fixa nem resumo recolhível; o resumo lateral continua fixo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await sacola(page, [{ productId: "00000000-0000-4000-8000-000000000001", variantId: null, quantity: 1 }]);
  await page.goto("/carrinho");
  await expect(page.getByRole("link", { name: "Poltrona Teste A" })).toBeVisible();
  await expect(page.locator("[data-barra-fixa]")).toBeHidden();
  await expect(page.locator("details")).toHaveCount(0);
  const resumo = page.locator('aside[aria-labelledby="resumo-titulo"]');
  expect(await resumo.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
});

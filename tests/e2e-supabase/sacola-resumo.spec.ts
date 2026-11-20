import { expect, test, type Page } from "@playwright/test";

/**
 * Celular (issue #9, item 7): subtotal e "Finalizar compra" sempre visíveis na sacola, e resumo recolhível no topo da
 * finalização. Precisa da compra pelo site ligada (Supabase), por isso fica aqui e não no E2E de demonstração.
 * A cotação é simulada para não depender de produto com preço no banco de teste; os valores não são da loja.
 */

const ITEM = { productId: "00000000-0000-4000-8000-0000000000a1", variantId: null, quantity: 2 };

async function sacolaComItem(page: Page) {
  await page.addInitScript((value) => window.localStorage.setItem("cuxoes:cart:v1", value), JSON.stringify([ITEM]));
  await page.route("**/api/cart/quote", (route) =>
    route.fulfill({
      json: {
        lines: [
          {
            ...ITEM,
            slug: "produto-teste",
            name: "Produto de teste",
            variantName: null,
            imageUrl: null,
            imageAlt: "",
            imageIsIllustrative: false,
            unitPriceCents: 12990,
            lineTotalCents: 25980,
            isDemo: false,
          },
        ],
        subtotalCents: 25980,
        issues: [],
        hasDemoItems: false,
        normalizedItems: [ITEM],
      },
    }),
  );
}

test.describe("390 px", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await sacolaComItem(page);
  });

  test("sacola: subtotal e Finalizar compra aparecem sem rolar; nada fica atrás da barra", async ({ page }) => {
    await page.goto("/carrinho");
    const barra = page.locator("[data-barra-fixa]");
    await expect(barra).toBeVisible();
    await expect(barra).toContainText("Subtotal");
    await expect(barra).toContainText("R$ 259,80");
    const finalizar = barra.getByRole("link", { name: "Finalizar compra" });
    await expect(finalizar).toBeInViewport();
    await expect(finalizar).toHaveAttribute("href", "/finalizar");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // O "Ajuda" sobe para não ficar em cima da barra.
    const ajuda = page.getByRole("button", { name: /Ajuda/ });
    if (await ajuda.count()) {
      const [b, a] = [await barra.boundingBox(), await ajuda.boundingBox()];
      expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y);
    }

    // Rolando até o fim, o último item e o resumo ficam acima da barra.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const topoBarra = (await barra.boundingBox())!.y;
    const ultimoItem = page.locator("main ul > li").filter({ has: page.getByRole("link", { name: "Produto de teste" }) }).last();
    expect((await ultimoItem.boundingBox())!.y + (await ultimoItem.boundingBox())!.height).toBeLessThanOrEqual(topoBarra);
    const resumo = page.locator('aside[aria-labelledby="resumo-titulo"]');
    const r = (await resumo.boundingBox())!;
    expect(r.y + r.height).toBeLessThanOrEqual(topoBarra);
  });

  test("finalização: o resumo no topo abre e fecha pelo teclado", async ({ page }) => {
    await page.goto("/finalizar");
    const detalhes = page.locator("details").filter({ hasText: "Resumo do pedido" });
    const resumo = detalhes.locator("summary");
    await expect(resumo).toBeVisible();
    await expect(resumo).toContainText("Resumo do pedido · 2 itens");
    await expect(resumo).toContainText("R$ 259,80");
    expect((await resumo.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(detalhes).not.toHaveAttribute("open", "");

    await resumo.focus();
    await page.keyboard.press("Enter");
    await expect(detalhes).toHaveAttribute("open", "");
    await expect(detalhes.getByText("Produto de teste")).toBeVisible();
    await page.keyboard.press("Space");
    await expect(detalhes).not.toHaveAttribute("open", "");
  });
});

test.describe("1440 px", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await sacolaComItem(page);
  });

  test("sem barra fixa nem resumo recolhível; o resumo lateral continua fixo", async ({ page }) => {
    await page.goto("/carrinho");
    await expect(page.getByRole("link", { name: "Finalizar compra" })).toBeVisible();
    await expect(page.locator("[data-barra-fixa]")).toBeHidden();
    expect(await page.locator('aside[aria-labelledby="resumo-titulo"]').evaluate((el) => getComputedStyle(el).position)).toBe("sticky");

    await page.goto("/finalizar");
    await expect(page.getByRole("heading", { name: "Resumo do pedido" })).toBeVisible();
    await expect(page.locator("details").filter({ hasText: "Resumo do pedido" })).toBeHidden();
    expect(await page.locator('aside[aria-labelledby="resumo-titulo"]').evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
  });
});

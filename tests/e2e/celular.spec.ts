import { expect, test, type Page } from "@playwright/test";

/**
 * Experiência no celular: nenhuma página "vai para o lado" (rolagem horizontal),
 * nem com a sacola cheia, e o aviso de "adicionado" aparece onde o dedo está.
 */

const LARGURAS = [360, 390, 768];

const PAGINAS = [
  "/",
  "/produtos",
  "/moveis/cadeiras",
  "/colchoes",
  "/colchoes/casal",
  "/entrega",
  "/entrega/maringa",
  "/entrega/londrina",
  "/produtos/poltrona-azul",
  "/produtos/cadeira-cinza-trama",
  "/busca?q=poltrona",
  "/busca?q=nada-encontrado",
  "/carrinho",
  "/finalizar",
  "/conta",
  "/pedido/PED-1001",
  "/atendimento",
  "/politicas",
  "/politicas/entrega",
  "/politicas/trocas-e-devolucoes",
  "/politicas/privacidade",
  "/politicas/termos-de-uso",
  "/admin/login",
  "/pagina-que-nao-existe",
];

/** Quanto a página passa da largura da tela (0 = nada vai para o lado). */
async function sobraLateral(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Sacola com um item de nome comprido. A cotação é simulada: no modo demonstração nenhum produto tem preço. */
async function sacolaComItem(page: Page) {
  const item = { productId: "00000000-0000-4000-8000-000000000001", variantId: null, quantity: 2 };
  await page.addInitScript((value) => window.localStorage.setItem("cuxoes:cart:v1", value), JSON.stringify([item]));
  await page.route("**/api/cart/quote", (route) =>
    route.fulfill({
      json: {
        lines: [
          {
            ...item,
            slug: "poltrona-azul",
            name: "Produto com um nome bem comprido para conferir a quebra de linha no celular",
            variantName: null,
            imageUrl: "/demo/poltrona-azul-frente.jpg",
            imageAlt: "Foto do produto",
            imageIsIllustrative: false,
            unitPriceCents: 12990,
            quantity: 2,
            lineTotalCents: 25980,
            isDemo: false,
          },
        ],
        subtotalCents: 25980,
        issues: [],
        hasDemoItems: false,
        normalizedItems: [item],
      },
    }),
  );
}

test.describe("celular: nada vai para o lado", () => {
  for (const width of LARGURAS) {
    test(`nenhuma página tem rolagem horizontal em ${width} px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 800 });
      for (const path of PAGINAS) {
        await page.goto(path);
        await page.waitForLoadState("load");
        // Conteúdo que chega depois (sacola, cotação) também precisa caber.
        await page.waitForTimeout(400);
        expect(await sobraLateral(page), `${path} em ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test("sacola e finalização com item de nome comprido cabem na tela", async ({ page }) => {
    await sacolaComItem(page);
    for (const width of LARGURAS) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/carrinho");
      await expect(page.getByRole("link", { name: /Produto com um nome bem comprido/ })).toBeVisible();
      expect(await sobraLateral(page), `/carrinho em ${width}px`).toBeLessThanOrEqual(0);
      // Em demonstração a finalização orienta a falar com o atendimento; a página também precisa caber.
      await page.goto("/finalizar");
      await expect(page.getByRole("heading", { level: 1, name: "Finalizar pedido" })).toBeVisible();
      expect(await sobraLateral(page), `/finalizar em ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test("rodapé e trilha de navegação com alvos de toque de 44 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/politicas/entrega");
    const alvos = page.locator('footer a, nav[aria-label="Trilha de navegação"] a');
    expect(await alvos.count()).toBeGreaterThan(0);
    for (const altura of await alvos.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
      expect(altura).toBeGreaterThanOrEqual(44);
    }
  });
});

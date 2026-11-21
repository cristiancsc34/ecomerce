import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Ajustes do celular (issue #7): botão Ajuda só com ícone, subtítulo do banner,
 * alvos de toque de 44 px, grade da home conforme a quantidade de produtos e
 * cabeçalho baixo. Rodam no projeto "desktop" com a tela trocada para 390×844 e 1440.
 */

test.skip(({ isMobile }) => isMobile, "as larguras são definidas em cada teste");

const CELULAR = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/** Sacola com um item (cotação simulada: no modo demonstração nenhum produto tem preço). */
async function sacolaComItem(page: Page) {
  const item = { productId: "00000000-0000-4000-8000-000000000001", variantId: null, quantity: 1 };
  await page.addInitScript((value) => window.localStorage.setItem("cuxoes:cart:v1", value), JSON.stringify([item]));
  await page.route("**/api/cart/quote", (route) =>
    route.fulfill({
      json: {
        lines: [
          {
            ...item,
            slug: "poltrona-azul",
            name: "Poltrona Azul",
            variantName: null,
            imageUrl: "/demo/poltrona-azul-frente.jpg",
            imageAlt: "Foto do produto",
            imageIsIllustrative: false,
            unitPriceCents: 12990,
            quantity: 1,
            lineTotalCents: 12990,
            isDemo: false,
          },
        ],
        subtotalCents: 12990,
        issues: [],
        hasDemoItems: false,
        normalizedItems: [item],
      },
    }),
  );
}

async function caixa(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "elemento sem caixa (invisível?)").not.toBeNull();
  return box!;
}

function cruzam(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Links e botões visíveis menores que 44×44 que não estão dentro de um clicável
 * de pelo menos 44×44 (ex.: um ícone dentro do card inteiro clicável).
 */
async function alvosPequenos(page: Page) {
  return page.evaluate(() => {
    const MIN = 44 - 0.5; // tolerância de arredondamento de subpixel
    const grande = (r: DOMRect) => r.width >= MIN && r.height >= MIN;
    const problemas: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("a[href], button"))) {
      const r = el.getBoundingClientRect();
      const estilo = getComputedStyle(el);
      // Invisíveis ou só para leitor de tela (ex.: "Pular para o conteúdo" antes do foco).
      if (r.width <= 1 || r.height <= 1 || estilo.visibility === "hidden" || estilo.display === "none") continue;
      if (el.closest("[aria-hidden='true'], [inert]")) continue;
      // Escondido visualmente até receber foco (sr-only), ex.: "Pular para o conteúdo".
      if (estilo.clipPath.startsWith("inset(50%") || estilo.clip === "rect(0px, 0px, 0px, 0px)") continue;
      // Link no meio de uma frase: exceção "inline" da WCAG 2.5.8 (o texto em volta é que manda no tamanho).
      const textoPai = el.parentElement?.textContent?.trim() ?? "";
      if (estilo.display === "inline" && textoPai.length > (el.textContent?.trim().length ?? 0) + 3) continue;
      if (grande(r)) continue;
      // Link "esticado" (::after absoluto cobrindo o card): o alvo é o card inteiro.
      const depois = getComputedStyle(el, "::after");
      if (depois.position === "absolute" && depois.content !== "none" && el.offsetParent) {
        if (grande(el.offsetParent.getBoundingClientRect())) continue;
      }
      let pai = el.parentElement?.closest<HTMLElement>("a[href], button, label, [role='button']");
      let ok = false;
      while (pai) {
        if (grande(pai.getBoundingClientRect())) {
          ok = true;
          break;
        }
        pai = pai.parentElement?.closest<HTMLElement>("a[href], button, label, [role='button']") ?? null;
      }
      if (!ok) {
        const nome = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ");
        problemas.push(`${el.tagName.toLowerCase()} "${nome.slice(0, 40)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return problemas;
  });
}

test.describe("celular 390×844", () => {
  test.use({ viewport: CELULAR });

  test("botão Ajuda: só ícone de 48×48, com nome acessível", async ({ page }) => {
    await page.goto("/");
    const ajuda = page.getByRole("button", { name: "Ajuda" });
    await expect(ajuda).toBeVisible();
    const box = await caixa(ajuda);
    expect(Math.round(box.width)).toBe(48);
    expect(Math.round(box.height)).toBe(48);
    // O texto fica só para leitor de tela.
    await expect(ajuda.locator("span")).toHaveClass(/sr-only/);
  });

  test("botão Ajuda não cobre o botão do banner e tem espaço reservado no fim do conteúdo", async ({ page }) => {
    await page.goto("/");
    const ajuda = await caixa(page.getByRole("button", { name: "Ajuda" }));
    expect(cruzam(ajuda, await caixa(page.getByRole("link", { name: "Ver produtos" })))).toBe(false);
    // 80 px no fim do conteúdo: o último card/botão da página sobe acima do botão fixo.
    await expect(page.locator("main")).toHaveCSS("padding-bottom", "80px");
  });

  test("botão Ajuda não cobre preço nem botões da barra fixa do produto", async ({ page }) => {
    await page.goto("/produtos/poltrona-azul");
    const barra = page.locator("[data-barra-fixa]:visible");
    await expect(barra).toBeVisible();
    const ajuda = await caixa(page.getByRole("button", { name: "Ajuda" }));
    for (const alvo of await barra.locator("a, button, p").all()) {
      if (!(await alvo.isVisible())) continue;
      expect(cruzam(ajuda, await caixa(alvo))).toBe(false);
    }
  });

  test("banner: subtítulo aparece, botão na primeira dobra e nada vai para o lado", async ({ page }) => {
    await page.goto("/");
    const subtitulo = page.getByText("Veja cada peça de todos os ângulos");
    await expect(subtitulo).toBeVisible();
    const cta = await caixa(page.getByRole("link", { name: "Ver produtos" }));
    expect(cta.y + cta.height).toBeLessThanOrEqual(CELULAR.height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0);
  });

  test("contador da sacola usa text-xs (12 px)", async ({ page }) => {
    await page.goto("/");
    const contador = page.locator('header a[href="/carrinho"] span[aria-hidden="true"]');
    await expect(contador).toHaveCSS("font-size", "12px");
  });

  test("cabeçalho com no máximo 112 px", async ({ page }) => {
    await page.goto("/");
    expect((await caixa(page.locator("body > div header").first())).height).toBeLessThanOrEqual(112);
  });

  for (const rota of ["/", "/categorias/cadeiras", "/produtos/poltrona-azul", "/carrinho", "/finalizar", "/entrega-parana", "/pagina-que-nao-existe"]) {
    test(`alvos de toque de 44 px em ${rota}`, async ({ page }) => {
      await sacolaComItem(page);
      await page.goto(rota);
      await page.waitForLoadState("load");
      await page.waitForTimeout(400);
      expect(await alvosPequenos(page)).toEqual([]);
    });
  }
});

test.describe("desktop 1440", () => {
  test.use({ viewport: DESKTOP });

  test("botão Ajuda mostra o texto", async ({ page }) => {
    await page.goto("/");
    const ajuda = page.getByRole("button", { name: "Ajuda" });
    await expect(ajuda).toBeVisible();
    await expect(ajuda.locator("span")).toBeVisible();
    expect((await caixa(ajuda)).width).toBeGreaterThan(48);
  });

  test("grade da home com 2 produtos: duas colunas contidas (max-w-3xl)", async ({ page }) => {
    await page.goto("/");
    const grade = page.locator("#produtos ul").first();
    await expect(grade.locator("> li")).toHaveCount(2);
    await expect(grade).toHaveClass(/grid-cols-2/);
    expect((await caixa(grade)).width).toBeLessThanOrEqual(768);
  });

  test("cabeçalho com no máximo 112 px", async ({ page }) => {
    await page.goto("/");
    expect((await caixa(page.locator("body > div header").first())).height).toBeLessThanOrEqual(112);
  });
});

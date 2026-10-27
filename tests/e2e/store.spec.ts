import { expect, test, type Page } from "@playwright/test";

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

test.describe("vitrine em modo demonstração", () => {
  test("home: slogan, CTAs e aviso de demonstração", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Seu melhor descanso começa aqui.");
    await expect(page.getByText("Ambiente de demonstração.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Encontrar meu colchão" }).first()).toHaveAttribute("href", "/guia");
    await expect(page.getByRole("link", { name: "Conhecer os produtos" }).first()).toHaveAttribute("href", "/produtos");
    await expect(page.getByText("Imagem ilustrativa").first()).toBeVisible();
  });

  test("catálogo: filtro reflete na URL, ordena e mostra estado vazio", async ({ page }) => {
    await page.goto("/produtos");
    await expect(page.getByRole("status").filter({ hasText: "produtos encontrados" })).toHaveText("3 produtos encontrados");

    if (isMobile(page)) await page.getByText("Filtrar e ordenar").click();
    const panel = isMobile(page) ? page.locator("details") : page.getByRole("complementary", { name: "Filtros" });
    // King existe no Brisa e no Sereno (não no Nuvem).
    await panel.getByLabel(/^King/).check();
    await expect(page).toHaveURL(/tamanho=king/);
    await expect(page.getByRole("status").filter({ hasText: "encontrados" })).toHaveText("2 produtos encontrados");

    await page.goto("/produtos?ordem=menor-preco");
    const names = await page.locator("article h3").allTextContents();
    expect(names).toEqual(["Nuvem Essencial", "Brisa Premium", "Sereno Híbrido"]);

    await page.goto("/produtos?tamanho=solteiro&firmeza=firme");
    await expect(page.getByRole("heading", { name: "Nenhum produto com esses filtros" })).toBeVisible();
    await page.getByRole("link", { name: "Limpar filtros" }).click();
    await expect(page).toHaveURL(/\/produtos$/);
  });

  test("busca sem acento e estado vazio", async ({ page }) => {
    await page.goto("/busca?q=hibrido");
    await expect(page.locator("article h3")).toHaveText(["Sereno Híbrido"]);
    await page.goto("/busca?q=inexistente");
    await expect(page.getByRole("heading", { name: "Nenhum produto com esses filtros" })).toBeVisible();
  });

  test("produto: escolher tamanho, preço muda, adicionar à sacola e ver total do servidor", async ({ page }) => {
    await page.goto("/produtos/brisa-premium");
    await expect(page.getByRole("heading", { level: 1, name: "Brisa Premium" })).toBeVisible();
    await expect(page.getByText("Produto de demonstração", { exact: true })).toBeVisible();

    const add = page.getByRole("button", { name: "Escolha um tamanho" });
    await expect(add).toBeDisabled();

    // O rádio é visualmente oculto; o usuário clica no cartão (label).
    await page.locator("label").filter({ has: page.getByRole("radio", { name: /^Queen/ }) }).click();
    await expect(page.getByRole("radio", { name: /^Queen/ })).toBeChecked();
    await expect(page.getByTestId("preco-atual")).toContainText("R$ 2.199,00");
    await page.getByRole("button", { name: "Adicionar à sacola" }).click();
    await expect(page.getByText("Adicionado à sacola.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sacola, 1 item" })).toBeVisible();

    await page.goto("/carrinho");
    await expect(page.getByRole("link", { name: "Brisa Premium" })).toBeVisible();
    const resumo = page.getByRole("complementary", { name: "Resumo" });
    await expect(resumo).toContainText("R$ 2.199,00");
    await expect(page.getByText("Valores ilustrativos")).toBeVisible();
    await expect(page.getByRole("button", { name: "Finalizar compra" })).toBeDisabled();

    await page.getByRole("button", { name: "Aumentar" }).click();
    await expect(resumo).toContainText("R$ 4.398,00");
    await page.getByRole("button", { name: /Remover/ }).click();
    await expect(page.getByRole("heading", { name: "Sua sacola está vazia" })).toBeVisible();
  });

  test("sacola descarta preço adulterado no navegador", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() =>
      localStorage.setItem(
        "cuxoes:cart:v1",
        JSON.stringify([
          { productId: "00000000-0000-4000-8000-000000000101", variantId: "00000000-0000-4000-8000-000000011100", quantity: 1, priceCents: 1 },
          { productId: "00000000-0000-4000-8000-000000000999", variantId: null, quantity: 1 },
        ]),
      ),
    );
    await page.goto("/carrinho");
    await expect(page.getByRole("complementary", { name: "Resumo" })).toContainText("R$ 899,00");
    await expect(page.getByText("Um item não está mais disponível")).toBeVisible();
  });

  test("tamanho pré-selecionado pela URL", async ({ page }) => {
    await page.goto("/produtos/sereno-hibrido?tamanho=queen");
    await expect(page.getByRole("radio", { name: /Queen/ })).toBeChecked();
    await expect(page.getByRole("button", { name: "Adicionar à sacola" })).toBeEnabled();
  });

  test("3D não é baixado até o pedido", async ({ page }) => {
    const heavy: string[] = [];
    page.on("request", (r) => {
      if (/\.glb($|\?)/.test(r.url()) || /model-viewer|three/i.test(r.url())) heavy.push(r.url());
    });
    await page.goto("/produtos/sereno-hibrido");
    await page.getByRole("heading", { name: "Ver em 3D" }).scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    expect(heavy).toEqual([]);

    const glb = page.waitForRequest(/sereno-hibrido\.glb/);
    await page.getByRole("button", { name: "Carregar visualização 3D" }).click();
    await glb;
    await expect(page.locator("model-viewer")).toBeVisible();
  });

  test("galeria: miniaturas e zoom acessível", async ({ page }) => {
    await page.goto("/produtos/nuvem-essencial");
    await page.getByRole("button", { name: "Mostrar mídia 2 de 4" }).click();
    await expect(page.getByRole("button", { name: "Mostrar mídia 2 de 4" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Ampliar" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("guia recomenda e leva ao catálogo filtrado", async ({ page }) => {
    await page.goto("/guia");
    await page.getByRole("radio", { name: "Duas pessoas" }).check();
    await page.getByRole("radio", { name: "De barriga para cima" }).check();
    await page.getByRole("button", { name: "Ver recomendação" }).click();
    await expect(page.getByRole("heading", { name: "Nossa sugestão para você" })).toBeVisible();
    await expect(page.getByText("Médio, Médio-firme")).toBeVisible();
    // As respostas continuam marcadas para ajustar a recomendação.
    await expect(page.getByRole("radio", { name: "Duas pessoas" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "De barriga para cima" })).toBeChecked();
    await page.getByRole("link", { name: /no catálogo/ }).click();
    await expect(page).toHaveURL(/firmeza=medio/);
  });

  test("teclado: link para pular ao conteúdo e foco visível", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
    await expect(skip).toBeFocused();
    const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#conteudo$/);
  });

  test("sem rolagem horizontal a partir de 360 px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of ["/", "/produtos", "/produtos/sereno-hibrido", "/guia", "/comparar", "/carrinho", "/atendimento", "/politicas/privacidade"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("página de produto não salta ao carregar (CLS baixo)", async ({ page }) => {
    await page.goto("/produtos/sereno-hibrido");
    await page.waitForLoadState("networkidle");
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
              if (!e.hadRecentInput) total += e.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => resolve(total), 1500);
        }),
    );
    expect(cls).toBeLessThan(0.1);
  });
});

test.describe("SEO e segurança em modo demonstração", () => {
  test("nada é indexado e não há dados estruturados de produto fictício", async ({ page, request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \//);
    await page.goto("/produtos/sereno-hibrido");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  });

  test("cabeçalhos de segurança", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("API da sacola valida a entrada", async ({ request }) => {
    expect((await request.post("/api/cart/quote", { data: { items: [{ productId: "x", quantity: 999 }] } })).status()).toBe(422);
    expect((await request.post("/api/cart/quote", { data: "nada", headers: { "content-type": "text/plain" } })).status()).toBe(415);
  });

  test("painel sem Supabase não expõe nada e explica a configuração", async ({ page }) => {
    for (const path of ["/admin", "/admin/produtos", "/admin/login"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Painel ainda não conectado" })).toBeVisible();
    }
  });
});

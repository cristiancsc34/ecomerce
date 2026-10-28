import { expect, test, type Page } from "@playwright/test";

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

test.describe("vitrine em modo demonstração", () => {
  test("home: página de venda com banner, vitrine e chamada para o 3D", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Conforto e estilo para a sua casa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Escolha o seu" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gire a Poltrona Azul Estrutura Clara em 3D" })).toBeVisible();
    await expect(page.locator("article h3")).toHaveText(["Poltrona Azul Estrutura Clara", "Cadeira Cinza Trama"]);
    await expect(page.getByRole("status").filter({ hasText: "produtos" })).toHaveText("2 produtos");
    // Só a poltrona já tem 3D.
    await expect(page.locator("article").filter({ hasText: "3D" })).toHaveCount(1);
    // Nada de faixa de demonstração, guia ou comparador.
    await expect(page.getByText("Ambiente de demonstração.")).toHaveCount(0);
    await expect(page.locator('a[href="/guia"], a[href="/comparar"]')).toHaveCount(0);
  });

  test("celular: 2 cards por linha, mesmo tamanho, sem sair da tela", async ({ page }) => {
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      const boxes = await page.locator("article").evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), right: r.right };
        }),
      );
      expect(boxes, `${width}px`).toHaveLength(2);
      expect(boxes[0].top, `${width}px`).toBe(boxes[1].top);
      expect(boxes[0].width, `${width}px`).toBe(boxes[1].width);
      expect(boxes[0].height, `${width}px`).toBe(boxes[1].height);
      expect(boxes[1].right, `${width}px`).toBeLessThanOrEqual(width);
    }
  });

  test("produto sem preço: nada inventado e o destaque vai para o 3D", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Poltrona Azul Estrutura Clara", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Poltrona Azul Estrutura Clara" })).toBeVisible();
    await expect(page.getByTestId("preco-atual")).toHaveText("Preço em breve");
    await expect(page.getByText("Cena recriada a partir das fotos reais").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Comprar agora" })).toHaveCount(0);
    const to3d = isMobile(page) ? page.getByRole("link", { name: "Girar em 3D" }) : page.getByRole("link", { name: "Ver em 3D" });
    await to3d.click();
    await expect(page).toHaveURL(/#visualizador-3d$/);
    await expect(page.getByRole("region", { name: "Ver em 3D" })).toBeInViewport();
  });

  test("produto sem preço e sem 3D não mostra barra de compra vazia", async ({ page }) => {
    await page.goto("/produtos/cadeira-cinza-trama");
    await expect(page.getByRole("heading", { level: 1, name: "Cadeira Cinza Trama" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Ver em 3D" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /3D/ })).toHaveCount(0);
    // Sem "produtos relacionados": poltrona não é cadeira, cada produto é um.
    await expect(page.getByText("Você também pode gostar")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Poltrona Azul Estrutura Clara" })).toHaveCount(0);
  });

  test("busca pelo cabeçalho, sem acento, e estado vazio", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Buscar produtos" }).fill("azul");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(/\/busca\?q=azul/);
    await expect(page.locator("article h3:visible")).toHaveText(["Poltrona Azul Estrutura Clara"]);
    await page.goto("/busca?q=cadeira");
    await expect(page.locator("article h3:visible").first()).toHaveText("Cadeira Cinza Trama");
    await page.goto("/busca?q=inexistente");
    await expect(page.getByText("Nenhum produto encontrado")).toBeVisible();
  });

  test("categoria lista os dois produtos", async ({ page }) => {
    await page.goto("/categorias/cadeiras");
    await expect(page.getByRole("heading", { level: 1, name: "Cadeiras e poltronas" })).toBeVisible();
    await expect(page.locator("article")).toHaveCount(2);
  });

  test("guia e comparador não existem mais", async ({ page }) => {
    for (const path of ["/guia", "/comparar"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
    }
  });

  test("sacola descarta preço adulterado e produto sem preço", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() =>
      localStorage.setItem(
        "cuxoes:cart:v1",
        JSON.stringify([
          { productId: "dcdaee90-64b9-4b91-832b-f5049a237cb9", variantId: null, quantity: 1, priceCents: 1 },
          { productId: "00000000-0000-4000-8000-000000000999", variantId: null, quantity: 1 },
        ]),
      ),
    );
    await page.goto("/carrinho");
    await expect(page.getByText("“Poltrona Azul Estrutura Clara” está sem preço no momento")).toBeVisible();
    await expect(page.getByText("Um item não está mais disponível")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sua sacola está vazia" })).toBeVisible();
  });

  test("3D não é baixado até o pedido", async ({ page }) => {
    const heavy: string[] = [];
    page.on("request", (r) => {
      if (/\.glb($|\?)/.test(r.url()) || /model-viewer|three/i.test(r.url())) heavy.push(r.url());
    });
    await page.goto("/produtos/poltrona-azul");
    await page.getByRole("heading", { name: "Ver em 3D" }).scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    expect(heavy).toEqual([]);

    const glb = page.waitForRequest(/poltrona-azul\.glb/);
    await page.getByRole("region", { name: "Ver em 3D" }).getByRole("button", { name: "Girar em 3D" }).click();
    await glb;
    await expect(page.locator("model-viewer")).toBeVisible();
  });

  test("celular: a barra fixa não esconde o fim da página e a tela usa a área segura do iPhone", async ({ page }) => {
    test.skip(!isMobile(page), "a barra fixa só existe no celular");
    await page.goto("/produtos/poltrona-azul");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bar = await page.locator("[data-barra-fixa]").boundingBox();
    const last = await page.locator("footer").getByText(/© \d{4}/).boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(bar!.y);
  });

  test("realidade aumentada: no celular abre a câmera, no computador orienta a usar o celular", async ({ page }) => {
    await page.goto("/produtos/poltrona-azul");
    const region = page.getByRole("region", { name: "Ver em 3D" });
    const arButton = region.getByRole("button", { name: "Ver no seu ambiente" });

    if (!isMobile(page)) {
      await expect(arButton).toHaveCount(0);
      await region.getByRole("button", { name: "Girar em 3D" }).click();
      await expect(page.locator("model-viewer")).toBeVisible();
      await expect(region.getByText("Para ver no seu ambiente, abra esta página no celular.")).toBeVisible();
      return;
    }

    // Pixel 7 (Android): um toque carrega o modelo e já chama o AR do Android
    // (Scene Viewer). Aqui não há câmera: guardamos o link em vez de abri-lo.
    await page.evaluate(() => {
      const opened: string[] = [];
      Object.assign(window, { arIntents: opened });
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.href.startsWith("intent://")) opened.push(this.href);
        else click.call(this);
      };
    });
    await arButton.click();
    const intents = () => page.evaluate(() => (window as unknown as { arIntents: string[] }).arIntents);
    await expect.poll(intents, { timeout: 15_000 }).toHaveLength(1);
    const [intent] = await intents();
    expect(intent).toMatch(/^intent:\/\/arvr\.google\.com\/scene-viewer\//);
    expect(decodeURIComponent(intent)).toContain("/demo/poltrona-azul.glb");
    expect(intent).toContain("mode=ar_preferred");
    expect(intent).not.toContain("resizable=false"); // tamanho aproximado: a pessoa pode ajustar
    await expect(region.getByText("Na câmera, o tamanho é aproximado", { exact: false })).toBeVisible();
  });

  test("galeria: miniaturas, contador e zoom acessível", async ({ page }) => {
    await page.goto("/produtos/cadeira-cinza-trama");
    await page.getByRole("button", { name: "Mostrar mídia 2 de 4" }).click();
    await expect(page.getByRole("button", { name: "Mostrar mídia 2 de 4" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("2/4")).toBeVisible();
    await page.getByRole("button", { name: "Ampliar" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
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
    for (const path of ["/", "/produtos", "/produtos/poltrona-azul", "/produtos/cadeira-cinza-trama", "/busca?q=poltrona", "/carrinho", "/atendimento", "/politicas/privacidade"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("página de produto não salta ao carregar (CLS baixo)", async ({ page }) => {
    await page.goto("/produtos/poltrona-azul");
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
  test("nada é indexado e não há dados estruturados de produto de demonstração", async ({ page, request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \//);
    await page.goto("/produtos/poltrona-azul");
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

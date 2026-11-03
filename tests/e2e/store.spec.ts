import { devices, expect, test, type Page } from "@playwright/test";

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
    // O link leva ao topo e troca a foto principal pelo 3D.
    await expect(page.getByRole("region", { name: "Fotos e 3D: Poltrona Azul Estrutura Clara" })).toBeInViewport();
    await expect(page.locator("model-viewer")).toBeVisible();
  });

  test("produto sem preço e sem 3D não mostra barra de compra vazia", async ({ page }) => {
    await page.goto("/produtos/cadeira-cinza-trama");
    await expect(page.getByRole("heading", { level: 1, name: "Cadeira Cinza Trama" })).toBeVisible();
    // Sem modelo 3D: nenhum botão de 3D ou de realidade aumentada (nada quebrado).
    await expect(page.getByRole("button", { name: /Ver no seu ambiente|Girar em 3D/ })).toHaveCount(0);
    await expect(page.locator("[data-acoes-3d]")).toHaveCount(0);
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

  test("acompanhar pedido: link no rodapé, consulta por número + celular e link inválido não mostra nada", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: "Acompanhar pedido" }).click();
    await expect(page.getByRole("heading", { name: "Acompanhe seu pedido" })).toBeVisible();
    await page.getByLabel("Número do pedido").fill("PED-1001");
    await page.getByLabel("Celular usado na compra").fill("(11) 98765-4321");
    await page.getByRole("button", { name: "Acompanhar pedido" }).click();
    // O Next tem um anunciador de rota próprio com role="alert": filtra pela mensagem.
    await expect(page.getByRole("alert").filter({ hasText: "Não encontramos um pedido" })).toBeVisible();
    await page.goto("/pedido/PED-1001?t=00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("Não encontramos o pedido por este link")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
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
    await page.waitForLoadState("networkidle");
    expect(heavy).toEqual([]);

    const glb = page.waitForRequest(/poltrona-azul\.glb/);
    await page.getByRole("button", { name: "Girar em 3D" }).click();
    await glb;
    await expect(page.locator("model-viewer")).toBeVisible();
    // "Ver fotos" volta para a foto principal.
    await page.getByRole("button", { name: "Ver fotos" }).click();
    await expect(page.locator("model-viewer")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Girar em 3D" })).toBeVisible();
  });

  test("botões de 3D e AR ficam sobre a foto principal, sem cobrir o preço, com 44 px e nome acessível", async ({ page }) => {
    await page.goto("/produtos/poltrona-azul");
    const stage = page.getByRole("region", { name: "Fotos e 3D: Poltrona Azul Estrutura Clara" });
    const photo = stage.getByRole("img", { name: /vista frontal/ }).first();
    const ar = stage.getByRole("button", { name: "Ver no seu ambiente: Poltrona Azul Estrutura Clara" });
    const turn = stage.getByRole("button", { name: "Girar em 3D: Poltrona Azul Estrutura Clara" });
    await expect(ar).toBeVisible();
    await expect(turn).toBeVisible();
    // Sem rolar: aparecem na primeira tela.
    await expect(ar).toBeInViewport();
    const photoBox = (await photo.boundingBox())!;
    const price = (await page.getByTestId("preco-atual").boundingBox())!;
    for (const button of [ar, turn]) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      // Dentro da foto principal…
      expect(box.y).toBeGreaterThanOrEqual(photoBox.y);
      expect(box.y + box.height).toBeLessThanOrEqual(photoBox.y + photoBox.height + 1);
      expect(box.x + box.width).toBeLessThanOrEqual(photoBox.x + photoBox.width + 1);
      // …e longe do preço.
      const overlaps = !(box.x + box.width <= price.x || price.x + price.width <= box.x || box.y + box.height <= price.y || price.y + price.height <= box.y);
      expect(overlaps).toBe(false);
    }
    // Foco visível pelo teclado.
    await turn.focus();
    const outline = await turn.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
  });

  test("eventos de uso: view3d_click e ar_click com o id do produto", async ({ page }) => {
    await page.goto("/produtos/poltrona-azul");
    await page.evaluate(() => {
      const seen: unknown[] = [];
      Object.assign(window, { seen });
      window.addEventListener("cuxoes:evento", (e) => seen.push((e as CustomEvent).detail));
    });
    await page.getByRole("button", { name: "Girar em 3D" }).click();
    await expect(page.locator("model-viewer")).toBeVisible();
    const seen = () => page.evaluate(() => (window as unknown as { seen: { event: string; produto_id: string }[] }).seen);
    await expect.poll(seen).toContainEqual(
      expect.objectContaining({ event: "view3d_click", produto_id: "dcdaee90-64b9-4b91-832b-f5049a237cb9" }),
    );
  });

  test("celular: a barra fixa não esconde o fim da página e a tela usa a área segura do iPhone", async ({ page }) => {
    test.skip(!isMobile(page), "a barra fixa só existe no celular");
    await page.goto("/produtos/poltrona-azul");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
    // A página ainda pode crescer (imagens, fontes): rola de novo até o fim antes de medir.
    const footerEnd = page.locator("footer").getByText(/© \d{4}/);
    await expect
      .poll(async () => {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        // Enquanto a página termina de chegar, o Next mantém uma cópia escondida da barra: mede só a visível.
        const bar = await page.locator("[data-barra-fixa]").filter({ visible: true }).boundingBox();
        const end = await footerEnd.boundingBox();
        return Boolean(bar && end && end.y + end.height <= bar.y);
      })
      .toBe(true);
  });

  test("realidade aumentada em todo celular: app do Google abre o Safari, Firefox abre o Chrome", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "basta rodar uma vez");
    const iphone = (app: string) =>
      `Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${app} Mobile/15E148 Safari/604.1`;
    const open = async (device: (typeof devices)[string], userAgent: string, path = "/produtos/poltrona-azul") => {
      const context = await browser.newContext({ ...device, userAgent, baseURL: testInfo.project.use.baseURL });
      const page = await context.newPage();
      // Sem Safari/Chrome de verdade aqui: guarda o link de abertura em vez de segui-lo.
      await page.addInitScript(() => {
        const opened: string[] = [];
        Object.assign(window, { appLinks: opened });
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          if (/^(x-safari-|intent:)/.test(this.href)) opened.push(this.href);
          else click.call(this);
        };
      });
      await page.goto(path);
      const links = () => page.evaluate(() => (window as unknown as { appLinks: string[] }).appLinks);
      return { context, page, links, region: page.getByRole("region", { name: "Fotos e 3D: Poltrona Azul Estrutura Clara" }) };
    };

    // App do Google no iPhone: o botão aparece; o toque abre a mesma página no Safari, já no 3D.
    const google = await open(devices["iPhone 13"], iphone("GSA/380.0.785098425"));
    await expect(google.region.getByRole("button", { name: "Copiar link" })).toHaveCount(0);
    await google.region.getByRole("button", { name: "Ver no seu ambiente" }).click();
    await expect.poll(google.links).toEqual([
      expect.stringMatching(/^x-safari-http:\/\/localhost:\d+\/produtos\/poltrona-azul\?ar=1#visualizador-3d$/),
    ]);
    // Se o app não deixar sair, aparece a reserva de copiar o link.
    await expect(google.region.getByRole("button", { name: "Copiar link" })).toBeVisible({ timeout: 5000 });
    await google.context.close();

    // Firefox no Android: abre a página no Chrome.
    const firefox = await open(devices["Pixel 7"], "Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0");
    await firefox.region.getByRole("button", { name: "Ver no seu ambiente" }).click();
    await expect.poll(firefox.links).toEqual([expect.stringContaining("package=com.android.chrome")]);
    expect((await firefox.links())[0]).toContain("/produtos/poltrona-azul?ar=1");
    await firefox.context.close();

    // Chegando no Chrome/Safari do iPhone pelo link: o 3D já carrega e pede um toque para a câmera.
    for (const path of ["/produtos/poltrona-azul?ar=1", "/produtos/poltrona-azul?ver-no-ambiente=1"]) {
      const chrome = await open(devices["iPhone 13"], iphone("CriOS/138.0.7204.156"), path);
      await expect(chrome.page.locator("model-viewer")).toBeVisible();
      await expect(chrome.region.getByText("Pronto para ver no seu ambiente")).toBeVisible();
      await expect(chrome.region.getByRole("button", { name: "Abrir no seu ambiente" })).toBeVisible();
      await expect(chrome.page).toHaveURL(/\/produtos\/poltrona-azul$/);
      await chrome.context.close();
    }
  });

  test("realidade aumentada: no celular abre a câmera, no computador orienta a usar o celular", async ({ page }) => {
    await page.goto("/produtos/poltrona-azul");
    const region = page.getByRole("region", { name: "Fotos e 3D: Poltrona Azul Estrutura Clara" });
    const arButton = region.getByRole("button", { name: "Ver no seu ambiente" });

    if (!isMobile(page)) {
      await arButton.click();
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
    for (const path of ["/", "/produtos", "/produtos/poltrona-azul", "/produtos/cadeira-cinza-trama", "/busca?q=poltrona", "/carrinho", "/finalizar", "/pedido/PED-1001", "/atendimento", "/politicas/privacidade"]) {
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

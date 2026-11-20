import { expect, test } from "@playwright/test";

/**
 * Issue #31 (modo demonstração): rotas atuais mantidas, trilha visível na ficha
 * e na categoria, texto e perguntas da categoria, /entrega-parana com noindex,
 * guias de compra, 404 de verdade e a trava de indexação (#17) no cabeçalho.
 */

test.describe("rotas de categoria e produto", () => {
  test("ficha: trilha visível Início › Categoria › Produto", async ({ page }) => {
    await page.goto("/produtos/poltrona-azul");
    const trilha = page.getByRole("navigation", { name: "Trilha de navegação" });
    await expect(trilha.getByRole("link", { name: "Início" })).toHaveAttribute("href", "/");
    await expect(trilha.getByRole("link", { name: "Cadeiras e poltronas" })).toHaveAttribute("href", "/categorias/cadeiras");
    await expect(trilha.getByText("Poltrona Azul Estrutura Clara")).toHaveAttribute("aria-current", "page");
  });

  test("categoria: trilha, canonical, texto de como escolher e perguntas só como texto", async ({ page }) => {
    await page.goto("/categorias/cadeiras");
    await expect(page.getByRole("heading", { level: 1, name: "Cadeiras e poltronas" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Trilha de navegação" }).getByRole("link", { name: "Início" })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/categorias\/cadeiras$/);
    await expect(page.getByRole("heading", { name: "Dúvidas frequentes" })).toBeVisible();
    await expect(page.getByText("Quantas cadeiras cabem na minha mesa?")).toBeVisible();
    // Sem schema FAQPage (e, no modo demonstração, sem nenhum JSON-LD).
    expect(await page.locator('script[type="application/ld+json"]').count()).toBe(0);
  });

  test("produto, categoria e guia inexistentes respondem 404 de verdade", async ({ request }) => {
    for (const path of ["/produtos/nao-existe-az-seo", "/categorias/nao-existe-az-seo", "/guias/nao-existe-az-seo"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(404);
      expect(await res.text(), path).toContain("Página não encontrada");
    }
    expect((await request.head("/produtos/nao-existe-az-seo")).status()).toBe(404);
    expect((await request.get("/categorias/cadeiras")).status()).toBe(200);
    expect((await request.get("/produtos/poltrona-azul")).status()).toBe(200);
  });
});

test.describe("entrega no Paraná e guias", () => {
  test("/entrega-parana: lista de cidades, noindex e sem frete grátis", async ({ page }) => {
    const res = await page.goto("/entrega-parana");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Entrega no Paraná" })).toBeVisible();
    await expect(page.getByText("Paiçandu", { exact: true })).toBeVisible();
    await expect(page.getByText("Curitiba", { exact: true })).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    await expect(page.locator("main")).not.toContainText(/frete grátis/i);
  });

  test("/guias: lista os guias e cada guia tem trilha, subtítulos e links; noindex com a trava fechada", async ({ page }) => {
    await page.goto("/guias");
    await expect(page.getByRole("heading", { level: 1, name: "Guias de compra" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    await page.getByRole("link", { name: /Como escolher o tamanho do colchão/ }).click();
    await expect(page).toHaveURL(/\/guias\/como-escolher-o-tamanho-do-colchao$/);
    await expect(page.getByRole("heading", { level: 1, name: "Como escolher o tamanho do colchão" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "As medidas-padrão no Brasil" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Trilha de navegação" }).getByRole("link", { name: "Guias de compra" })).toHaveAttribute("href", "/guias");
    await expect(page.getByRole("link", { name: "Ver os produtos desta categoria" })).toHaveAttribute("href", "/categorias/colchoes");
    await expect(page.getByRole("navigation", { name: "Outros guias" }).getByRole("link").first()).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/guias\/como-escolher-o-tamanho-do-colchao$/);
  });

  test("home liga aos guias de compra", async ({ page }) => {
    await page.goto("/");
    const bloco = page.getByRole("region", { name: "Antes de escolher" });
    await expect(bloco.getByRole("link", { name: "Todos os guias" })).toHaveAttribute("href", "/guias");
    await expect(bloco.getByRole("link", { name: /Como escolher o tamanho do colchão/ })).toBeVisible();
  });

  test("rodapé liga categorias, entrega no Paraná, guias e atendimento", async ({ page }) => {
    await page.goto("/atendimento");
    const rodape = page.getByRole("contentinfo");
    await expect(rodape.getByRole("link", { name: "Cadeiras e poltronas" })).toHaveAttribute("href", "/categorias/cadeiras");
    await expect(rodape.getByRole("link", { name: "Entrega no Paraná" })).toHaveAttribute("href", "/entrega-parana");
    await expect(rodape.getByRole("link", { name: "Guias de compra" })).toHaveAttribute("href", "/guias");
    await expect(rodape.getByRole("link", { name: "Atendimento" })).toHaveAttribute("href", "/atendimento");
  });
});

test.describe("trava de indexação (issue #17)", () => {
  test("cabeçalho X-Robots-Tag noindex nas respostas e sitemap sem catálogo", async ({ request }) => {
    for (const path of ["/", "/categorias/cadeiras", "/produtos/poltrona-azul", "/sitemap.xml"]) {
      expect((await request.get(path)).headers()["x-robots-tag"], path).toBe("noindex, nofollow");
    }
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toMatch(/<loc>https?:\/\/[^/]+\/(produtos|categorias|entrega-parana|guias)(\/|<)/);
  });
});

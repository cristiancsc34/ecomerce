import { expect, test } from "@playwright/test";

/**
 * Arquitetura de SEO para o Paraná (modo demonstração): seções e subcategorias,
 * endereços antigos redirecionando, trilha de navegação, páginas de cidade,
 * 404 amigável e a trava de indexação (issue #17) fechada.
 */

test.describe("arquitetura de URLs", () => {
  test("endereços antigos e o atalho /sofas redirecionam com 308", async ({ request }) => {
    for (const [de, para] of [
      ["/categorias/cadeiras", "/moveis/cadeiras"],
      ["/categorias/colchoes", "/colchoes"],
      ["/sofas", "/estofados"],
    ]) {
      const res = await request.get(de, { maxRedirects: 0 });
      expect(res.status(), de).toBe(308);
      expect(new URL(res.headers().location, "http://x").pathname, de).toBe(para);
    }
  });

  test("subcategoria: trilha Início › Móveis, H1, canonical próprio e aviso de entrega", async ({ page }) => {
    await page.goto("/moveis/cadeiras");
    const trilha = page.getByRole("navigation", { name: "Trilha de navegação" });
    await expect(trilha.getByRole("link", { name: "Início" })).toHaveAttribute("href", "/");
    await expect(trilha.getByRole("link", { name: "Móveis" })).toHaveAttribute("href", "/moveis");
    await expect(page.getByRole("heading", { level: 1, name: "Cadeiras e poltronas" })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/moveis\/cadeiras$/);
    await expect(page.getByRole("heading", { name: "Frete grátis para as cidades atendidas no Paraná" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Entrega em Maringá" }).first()).toHaveAttribute("href", "/entrega/maringa");
  });

  test("seção: H1 com foco no Paraná e atalhos para a subcategoria com produto", async ({ page }) => {
    await page.goto("/moveis");
    await expect(page.getByRole("heading", { level: 1, name: "Móveis com entrega no Paraná" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Escolha por tipo" }).getByRole("link", { name: /Cadeiras e poltronas/ })).toHaveAttribute(
      "href",
      "/moveis/cadeiras",
    );
    await expect(page.locator("article")).toHaveCount(2);
  });

  test("seção sem produto mostra estado vazio (e fica fora do Google)", async ({ page }) => {
    await page.goto("/colchoes/casal");
    await expect(page.getByRole("heading", { level: 1, name: "Colchão casal" })).toBeVisible();
    await expect(page.getByText("Nenhum produto nesta categoria por enquanto")).toBeVisible();
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  });

  test("produto: trilha visível até a categoria", async ({ page }) => {
    await page.goto("/produtos/poltrona-azul");
    const trilha = page.getByRole("navigation", { name: "Trilha de navegação" });
    await expect(trilha.getByRole("link", { name: "Cadeiras e poltronas" })).toHaveAttribute("href", "/moveis/cadeiras");
    await expect(trilha.getByText("Poltrona Azul Estrutura Clara")).toHaveAttribute("aria-current", "page");
  });
});

test.describe("páginas de cidade", () => {
  test("Maringá e Londrina com textos próprios, entrega e links para as categorias", async ({ page }) => {
    await page.goto("/entrega/maringa");
    await expect(page.getByRole("heading", { level: 1, name: "Colchões, sofás e móveis com frete grátis em Maringá" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Como funciona a entrega" })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/entrega\/maringa$/);
    const textoMaringa = await page.locator("main header").innerText();

    await page.goto("/entrega/londrina");
    await expect(page.getByRole("heading", { level: 1, name: "Colchões, sofás e móveis com frete grátis em Londrina" })).toBeVisible();
    const textoLondrina = await page.locator("main header").innerText();
    expect(textoLondrina.replaceAll("Londrina", "X")).not.toBe(textoMaringa.replaceAll("Maringá", "X"));
    await expect(page.getByRole("link", { name: "Sofás e estofados" })).toHaveAttribute("href", "/estofados");
    await expect(page.getByRole("link", { name: "Ver todas as cidades atendidas no Paraná" })).toHaveAttribute("href", "/entrega");
  });

  test("lista completa das cidades atendidas, com link para as páginas locais", async ({ page }) => {
    await page.goto("/entrega");
    await expect(page.getByRole("heading", { level: 1, name: "Cidades atendidas no Paraná" })).toBeVisible();
    const lista = page.getByRole("region", { name: /Todas as cidades atendidas \(109\)/ });
    await expect(lista.getByText("Paiçandu", { exact: true })).toBeVisible();
    await expect(lista.getByRole("link", { name: "Maringá" })).toHaveAttribute("href", "/entrega/maringa");
  });

  test("cidade sem página: tela de não encontrada com noindex", async ({ page }) => {
    // Com a pré-renderização parcial do Next, a primeira visita pode sair com status 200 (a casca vai antes);
    // o que garante que o Google não indexe é o noindex que o Next põe na tela de não encontrada.
    await page.goto("/entrega/cascavel");
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
  });
});

test.describe("404 amigável e links do rodapé", () => {
  test("404 com busca e caminhos principais", async ({ page }) => {
    const res = await page.goto("/pagina-que-nao-existe");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("searchbox", { name: "Buscar produtos" })).toBeVisible();
    const caminhos = page.getByRole("navigation", { name: "Ou siga por aqui" });
    await expect(caminhos.getByRole("link", { name: "Colchões" })).toHaveAttribute("href", "/colchoes");
    await expect(caminhos.getByRole("link", { name: "Cidades atendidas" })).toHaveAttribute("href", "/entrega");
  });

  test("rodapé liga todas as páginas às seções e às cidades", async ({ page }) => {
    await page.goto("/atendimento");
    const rodape = page.getByRole("contentinfo");
    for (const [nome, href] of [
      ["Colchões", "/colchoes"],
      ["Estofados", "/estofados"],
      ["Móveis", "/moveis"],
      ["Maringá", "/entrega/maringa"],
      ["Londrina", "/entrega/londrina"],
      ["Cidades atendidas", "/entrega"],
    ]) {
      await expect(rodape.getByRole("link", { name: nome, exact: true })).toHaveAttribute("href", href);
    }
  });
});

test.describe("trava de indexação (issue #17)", () => {
  test("robots.txt fechado, sitemap só com o início e as páginas fixas, noindex nas páginas novas", async ({ page, request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \//);
    expect(robots).not.toMatch(/Sitemap:/);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toMatch(/<loc>https?:\/\/[^/]+\/(produtos|moveis|colchoes|estofados|entrega)(\/|<)/);
    expect(sitemap).toMatch(/<loc>https?:\/\/[^/]+\/politicas\/entrega<\/loc>/);
    for (const path of ["/colchoes", "/entrega", "/entrega/maringa", "/"]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]').first(), path).toHaveAttribute("content", /noindex/);
      await expect(page.locator('link[rel="canonical"]'), path).toHaveCount(1);
    }
  });
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  "/",
  "/produtos",
  "/produtos/poltrona-azul",
  "/produtos/cadeira-cinza-trama",
  "/moveis/cadeiras",
  "/colchoes",
  "/entrega",
  "/entrega/maringa",
  "/busca?q=poltrona",
  "/carrinho",
  "/finalizar",
  "/pedido/PED-1001",
  "/atendimento",
  "/conta",
  "/politicas/privacidade",
  "/pagina-que-nao-existe",
];

for (const path of PAGES) {
  test(`acessibilidade (WCAG 2.2 A/AA): ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      // O logo é o nome da marca: logotipos não têm exigência de contraste (WCAG 1.4.3, exceção "Logotipos").
      // O "Az" coral fica abaixo de 4,5:1 tanto no branco (2,5:1) quanto no azul; as cores são da marca.
      // Só o desenho do logo fica de fora; o resto do cabeçalho continua sendo conferido.
      .exclude("[data-logo]")
      .analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      serious.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`),
    ).toEqual([]);
  });
}

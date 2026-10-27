import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  "/",
  "/produtos",
  "/produtos/poltrona-azul",
  "/produtos/cadeira-cinza-trama",
  "/categorias/cadeiras",
  "/busca?q=poltrona",
  "/carrinho",
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
      .analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      serious.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`),
    ).toEqual([]);
  });
}

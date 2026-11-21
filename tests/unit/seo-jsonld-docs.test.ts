import { describe, expect, it } from "vitest";
import { GUIAS } from "@/content/guias";
import { articleJsonLd, breadcrumbJsonLd, organizationJsonLd, websiteJsonLd } from "@/lib/seo/structured-data";

/**
 * Os exemplos em docs/jsonld/ são o JSON-LD que as páginas emitem em produção,
 * para colar direto no validator.schema.org ou no Rich Results Test. Este
 * teste garante que eles não se afastam do código. Mudou o JSON-LD? Regere com
 * `npx vitest run tests/unit/seo-jsonld-docs.test.ts -u`.
 */
const base = "https://www.azconfort.com.br";
const json = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;

describe("exemplos de JSON-LD em docs/jsonld", () => {
  it("home.json: OnlineStore e WebSite da home", async () => {
    await expect(json([organizationJsonLd(base), websiteJsonLd(base)])).toMatchFileSnapshot("../../docs/jsonld/home.json");
  });

  it("trilha-produto.json: BreadcrumbList da ficha", async () => {
    const trilha = breadcrumbJsonLd(
      [
        { name: "Início", path: "/" },
        { name: "Colchões", path: "/categorias/colchoes" },
        { name: "Colchão Exemplo", path: "/produtos/colchao-exemplo" },
      ],
      base,
    );
    await expect(json(trilha)).toMatchFileSnapshot("../../docs/jsonld/trilha-produto.json");
  });

  it("guia.json: Article e BreadcrumbList do primeiro guia", async () => {
    const g = GUIAS[0];
    const trilha = breadcrumbJsonLd(
      [
        { name: "Início", path: "/" },
        { name: "Guias de compra", path: "/guias" },
        { name: g.title, path: `/guias/${g.slug}` },
      ],
      base,
    );
    await expect(json([articleJsonLd(g, base), trilha])).toMatchFileSnapshot("../../docs/jsonld/guia.json");
  });
});

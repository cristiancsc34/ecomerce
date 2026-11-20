import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";
import { FACET_COPY, SECTION_COPY, type ListingCopy } from "@/content/categorias";
import { CITY_PAGES, DELIVERY_HUB, DELIVERY_STEPS } from "@/content/cidades";
import { categoryPath, SECTIONS, sectionKeyForCategory, sectionRedirects } from "@/lib/catalog/sections";
import {
  FACETS,
  productBreadcrumbs,
  productSeats,
  productSizes,
  productsInSubpage,
  resolveSubpage,
  sizeFromMeasures,
  subpageLinks,
} from "@/lib/catalog/taxonomy";
import type { Category } from "@/lib/catalog/types";
import { sectionView, subpageView } from "@/lib/seo/listing";
import { buildSitemap } from "@/lib/seo/sitemap";
import {
  breadcrumbJsonLd,
  localBusinessJsonLd,
  organizationJsonLd,
  productJsonLd,
  SHIPPING_DETAILS,
  websiteJsonLd,
} from "@/lib/seo/structured-data";
import { findServedCity, isServedCity, normalizeCityName, SERVED_CITIES } from "@/lib/shipping/served-cities";
import { makeProduct, makeVariant } from "./factories";

const base = "https://www.azconfort.com.br";

function category(partial: Partial<Category> = {}): Category {
  return {
    id: "00000000-0000-4000-8000-0000000000c1",
    slug: "colchoes",
    name: "Colchões",
    description: null,
    sortOrder: 0,
    requires3d: false,
    seoTitle: null,
    seoDescription: null,
    content: null,
    ...partial,
  };
}

const CADEIRAS = { id: "c2", slug: "cadeiras", name: "Cadeiras e poltronas", requires3d: true };
const SOFAS = { id: "c3", slug: "sofas", name: "Sofás", requires3d: true };

/** Resolve um caminho pelos redirecionamentos do next.config.ts (primeiro que bater). */
function redirectOf(path: string): string | null {
  for (const r of sectionRedirects()) {
    const pattern = r.source.replace(/:slug\(([^)]+)\)/, "($1)").replace(/:slug/, "([^/]+)");
    const m = path.match(new RegExp(`^${pattern}$`));
    if (m) return r.destination.replace(":slug", m[1] ?? "");
  }
  return null;
}

describe("arquitetura de URLs: seções e categorias do banco", () => {
  it("cada categoria do banco cai numa seção pelo começo do slug; o resto vai para móveis", () => {
    expect(sectionKeyForCategory("colchoes")).toBe("colchoes");
    expect(sectionKeyForCategory("colchoes-infantis")).toBe("colchoes");
    expect(sectionKeyForCategory("sofas")).toBe("estofados");
    expect(sectionKeyForCategory("sofa-cama")).toBe("estofados");
    expect(sectionKeyForCategory("poltronas")).toBe("estofados");
    expect(sectionKeyForCategory("estofados")).toBe("estofados");
    expect(sectionKeyForCategory("cadeiras")).toBe("moveis");
    expect(sectionKeyForCategory("mesas")).toBe("moveis");
  });

  it("endereço da categoria: a que tem o nome da seção é a seção; as outras viram subpágina", () => {
    expect(categoryPath("colchoes")).toBe("/colchoes");
    expect(categoryPath("colchoes-infantis")).toBe("/colchoes/colchoes-infantis");
    expect(categoryPath("sofas")).toBe("/estofados/sofas");
    expect(categoryPath("cadeiras")).toBe("/moveis/cadeiras");
  });

  it("endereços antigos /categorias/* e o atalho /sofas redirecionam (308) para a arquitetura nova", () => {
    expect(sectionRedirects().every((r) => r.permanent)).toBe(true);
    expect(redirectOf("/sofas")).toBe("/estofados");
    expect(redirectOf("/categorias")).toBe("/produtos");
    expect(redirectOf("/categorias/colchoes")).toBe("/colchoes");
    expect(redirectOf("/categorias/colchoes-infantis")).toBe("/colchoes/colchoes-infantis");
    expect(redirectOf("/categorias/sofas")).toBe("/estofados/sofas");
    expect(redirectOf("/categorias/poltronas")).toBe("/estofados/poltronas");
    expect(redirectOf("/categorias/cadeiras")).toBe("/moveis/cadeiras");
    expect(redirectOf("/categorias/moveis")).toBe("/moveis");
    // O redirecionamento leva sempre ao mesmo endereço que a loja usa nos links.
    for (const slug of ["colchoes", "colchoes-infantis", "sofas", "poltronas", "cadeiras", "mesas", "estofados", "moveis"]) {
      expect(redirectOf(`/categorias/${slug}`)).toBe(categoryPath(slug));
    }
    expect(redirectOf("/colchoes")).toBeNull();
  });

  it("subcategorias fixas pedidas: solteiro, casal, queen, king e sofá 2 e 3 lugares", () => {
    const paths = FACETS.map((f) => `/${f.section}/${f.slug}`);
    for (const p of ["/colchoes/solteiro", "/colchoes/casal", "/colchoes/queen", "/colchoes/king", "/estofados/sofa-2-lugares", "/estofados/sofa-3-lugares"]) {
      expect(paths).toContain(p);
    }
  });
});

describe("subcategorias calculadas do cadastro (nada marcado à mão)", () => {
  it("tamanho de colchão: pela variação ou pelas medidas (±2 cm)", () => {
    expect(sizeFromMeasures(138, 188)).toBe("casal");
    expect(sizeFromMeasures(157, 199)).toBe("queen");
    expect(sizeFromMeasures(150, 190)).toBeNull();
    const p = makeProduct({
      variants: [makeVariant({ size: "casal" }), makeVariant({ size: null, widthCm: 193, lengthCm: 203 })],
      dimensions: { widthCm: 88, lengthCm: 188 },
    });
    expect(productSizes(p)).toEqual(["solteiro", "casal", "king"]);
  });

  it("lugares do sofá: especificação 'Lugares' do cadastro, senão o nome do produto", () => {
    expect(productSeats(makeProduct({ name: "Sofá Retrátil 3 Lugares" }))).toBe(3);
    expect(productSeats(makeProduct({ name: "Sofá dois lugares em linho" }))).toBe(2);
    expect(productSeats(makeProduct({ name: "Sofá Milano", attributes: { extraSpecs: [{ label: "Lugares", value: "2" }] } }))).toBe(2);
    expect(productSeats(makeProduct({ name: "Sofá Milano" }))).toBeNull();
  });

  it("subpágina junta só produtos da seção que batem com a regra", () => {
    const cats = [category(), category({ id: "c3", slug: "sofas", name: "Sofás" })];
    const sofa2 = makeProduct({ name: "Sofá 2 lugares", category: SOFAS, variants: [] });
    const sofa3 = makeProduct({ name: "Sofá 3 lugares", category: SOFAS, variants: [] });
    const cadeira2 = makeProduct({ name: "Banco 2 lugares", category: CADEIRAS, variants: [] });
    const sub = resolveSubpage("estofados", "sofa-2-lugares", cats)!;
    expect(sub.path).toBe("/estofados/sofa-2-lugares");
    expect(productsInSubpage([sofa2, sofa3, cadeira2], sub)).toEqual([sofa2]);
    expect(resolveSubpage("estofados", "sofas", cats)?.path).toBe("/estofados/sofas");
    expect(resolveSubpage("estofados", "nao-existe", cats)).toBeNull();
    expect(resolveSubpage("colchoes", "colchoes", cats)).toBeNull();
    expect(subpageLinks("estofados", [sofa2, sofa3], cats).map((l) => [l.path, l.count])).toEqual([
      ["/estofados/sofa-2-lugares", 1],
      ["/estofados/sofa-3-lugares", 1],
      ["/estofados/sofas", 2],
    ]);
  });

  it("trilha do produto: Início › Seção › (categoria subpágina) › Produto", () => {
    expect(productBreadcrumbs(makeProduct({ name: "Colchão X", slug: "colchao-x" }))).toEqual([
      { name: "Início", path: "/" },
      { name: "Colchões", path: "/colchoes" },
      { name: "Colchão X", path: "/produtos/colchao-x" },
    ]);
    expect(productBreadcrumbs(makeProduct({ name: "Cadeira", slug: "cadeira", category: CADEIRAS })).map((c) => c.path)).toEqual([
      "/",
      "/moveis",
      "/moveis/cadeiras",
      "/produtos/cadeira",
    ]);
    expect(productBreadcrumbs(makeProduct({ name: "Peça", slug: "peca", category: null })).map((c) => c.path)).toEqual(["/", "/produtos", "/produtos/peca"]);
  });
});

describe("título, resumo, H1 e introdução de cada categoria", () => {
  const all: [string, ListingCopy][] = [
    ...Object.entries(SECTION_COPY).map(([k, c]) => [`/${k}`, c] as [string, ListingCopy]),
    ...FACETS.map((f) => [`/${f.section}/${f.slug}`, FACET_COPY[f.slug]] as [string, ListingCopy]),
  ];

  it("toda seção e subcategoria fixa tem texto próprio, no tamanho que o Google mostra", () => {
    for (const [path, copy] of all) {
      expect(copy, path).toBeDefined();
      expect(`${copy.title} | ${brand.name}`.length, path).toBeLessThanOrEqual(65);
      expect(copy.description.length, path).toBeGreaterThanOrEqual(80);
      expect(copy.description.length, path).toBeLessThanOrEqual(160);
      expect(copy.intro.length, path).toBeGreaterThan(0);
    }
  });

  it("nada repetido entre páginas (título, resumo, H1 e introdução)", () => {
    for (const field of ["title", "description", "h1"] as const) {
      const values = all.map(([, c]) => c[field]);
      expect(new Set(values).size, field).toBe(values.length);
    }
    const intros = all.map(([, c]) => c.intro.join(" "));
    expect(new Set(intros).size).toBe(intros.length);
  });

  it("foco no Paraná e em Maringá, sem encher de palavra-chave", () => {
    for (const [path, copy] of all) {
      const text = `${copy.title} ${copy.description}`;
      expect(text, path).toMatch(/Paraná/);
      expect(text, path).toMatch(/Maringá/);
      const page = `${copy.title} ${copy.description} ${copy.h1} ${copy.intro.join(" ")}`;
      expect((page.match(/Maringá/g) ?? []).length, path).toBeLessThanOrEqual(3);
      expect((page.match(/Paraná/g) ?? []).length, path).toBeLessThanOrEqual(4);
    }
  });

  it("não inventa prazo, preço, avaliação nem superlativo", () => {
    const text = JSON.stringify([SECTION_COPY, FACET_COPY, CITY_PAGES, DELIVERY_HUB, DELIVERY_STEPS]);
    expect(text).not.toMatch(/R\$|\d+\s*(dias?|horas?)\b|úteis|avalia|estrelas|o melhor|os melhores|mais vendid|garantia de/i);
  });

  it("seção: usa o texto do painel quando existe; sem produto, fica fora do Google", () => {
    const view = sectionView("colchoes", [], [category({ seoTitle: "Colchões em Maringá — AzConfort", content: "Texto do painel" })]);
    expect(view).toMatchObject({
      path: "/colchoes",
      title: "Colchões em Maringá — AzConfort",
      description: SECTION_COPY.colchoes.description,
      h1: "Colchões com entrega no Paraná",
      content: "Texto do painel",
    });
    expect(view.breadcrumbs.map((c) => c.path)).toEqual(["/", "/colchoes"]);
    expect(view.otherSections.map((s) => s.path)).toEqual(["/estofados", "/moveis"]);
  });

  it("categoria do banco como subpágina: nome no H1 e resumo com a entrega no Paraná", () => {
    const cats = [category({ id: "c2", slug: "cadeiras", name: "Cadeiras e poltronas", description: "Cadeiras e poltronas com fotos reais." })];
    const sub = resolveSubpage("moveis", "cadeiras", cats)!;
    const view = subpageView(sub, [makeProduct({ category: CADEIRAS })], cats);
    expect(view).toMatchObject({
      path: "/moveis/cadeiras",
      title: "Cadeiras e poltronas em Maringá e no Paraná",
      description: "Cadeiras e poltronas com fotos reais. Saída de Maringá e frete grátis para as cidades atendidas no Paraná.",
      h1: "Cadeiras e poltronas",
    });
    expect(view.breadcrumbs.map((c) => c.path)).toEqual(["/", "/moveis", "/moveis/cadeiras"]);
    expect(view.products).toHaveLength(1);
  });
});

describe("cidades atendidas (lista da issue #28)", () => {
  // Lista recebida da transportadora, sem acento (20/11/2026). A grafia com acento do arquivo não pode mudar a lista.
  const RECEBIDA =
    "Abatia, Adhemar de Barros, Alto Parana, Amapora, Andira, Aparecida do Ivai, Apucarana, Arapongas, Arapua, Ariranha do Ivai, Astorga, Bandeirantes, Barra do Jacare, Bom Sucesso, Borrazopolis, California, Cambara, Cambe, Cambira, Campo Mourao, Candido de Abreu, Carlopolis, Cianorte, Colorado, Congonhinhas, Conselheiro Mairinck, Cruzmaltina, Curitiba, Curiuva, Diamante do Norte, Engenheiro Beltrao, Faxinal, Figueira, Godoy Moreira, Grandes Rios, Guairaca, Guapirama, Ibaiti, Ibipora, Iguaracu, Itambaraca, Itauna do Sul, Ivaipora, Jaboti, Jacarezinho, Jandaia do Sul, Japira, Jardim Alegre, Jataizinho, Joaquim Tavora, Jundiai do Sul, Kalore, Lidianopolis, Loanda, Londrina, Lunardelli, Mandaguacu, Mandaguari, Manoel Ribas, Marialva, Marilandia do Sul, Marilena, Maringa, Marumbi, Maua da Serra, Nova Esperanca, Nova Fatima, Nova Londrina, Novo Itacolomi, Paicandu, Paranacity, Paranavai, Peabiru, Pinhalao, Pitanga, Planaltina do Parana, Porto Rico, Porto Sao Jose, Quatigua, Querencia do Norte, Ribeirao Claro, Ribeirao do Pinhal, Rio Bom, Rio Branco do Ivai, Rolandia, Rosario do Ivai, Sabaudia, Salto do Itarare, Santa Amelia, Santa Cruz de Monte Castelo, Santa Isabel do Ivai, Santa Monica, Santana do Itarare, Santo Antonio da Platina, Santo Antonio do Paraiso, Sao Joao do Ivai, Sao Jose da Boa Vista, Sao Jose do Ivai, Sao Pedro do Ivai, Sao Pedro do Parana, Sapopema, Sarandi, Siqueira Campos, Tamarana, Tapejara, Terra Rica, Tomazina, Umuarama, Wenceslau Braz".split(", ");

  it("são os 109 nomes recebidos, todos no PR, sem duplicata", () => {
    expect(RECEBIDA).toHaveLength(109);
    expect(SERVED_CITIES.map((c) => normalizeCityName(c.name))).toEqual(RECEBIDA.map(normalizeCityName));
    expect(new Set(SERVED_CITIES.map((c) => normalizeCityName(c.name))).size).toBe(109);
    expect(SERVED_CITIES.every((c) => c.uf === "PR")).toBe(true);
  });

  it("compara sem acento e sem caixa, e exige UF PR", () => {
    for (const nome of ["Maringá", "MARINGA", "maringa", " Maringá "]) expect(isServedCity(nome, "PR")).toBe(true);
    expect(isServedCity("PAIÇANDU", "pr")).toBe(true);
    expect(isServedCity("Paicandu", "PR")).toBe(true);
    expect(isServedCity("Cascavel", "PR")).toBe(false);
    expect(isServedCity("Maringá", "SP")).toBe(false);
    expect(isServedCity("", "PR")).toBe(false);
    expect(findServedCity("ibipora")?.name).toBe("Ibiporã");
  });
});

describe("páginas de cidade: conteúdo único, sem trocar só o nome", () => {
  const withoutName = (text: string, name: string) => text.replaceAll(name, "<cidade>");
  const words = (text: string) => new Set(normalizeCityName(text).split(" ").filter((w) => w.length > 3));
  const similarity = (a: string, b: string) => {
    const A = words(a);
    const B = words(b);
    const shared = [...A].filter((w) => B.has(w)).length;
    return shared / Math.max(1, new Set([...A, ...B]).size);
  };

  it("começa por Maringá e Londrina, ambas da lista atendida, com endereços únicos", () => {
    expect(CITY_PAGES.map((c) => c.slug)).toEqual(["maringa", "londrina"]);
    for (const c of CITY_PAGES) {
      expect(isServedCity(c.name, c.uf), c.name).toBe(true);
      expect(c.slug).toBe(normalizeCityName(c.name).replaceAll(" ", "-"));
      for (const n of c.nearby) expect(isServedCity(n, "PR"), `${c.name} → ${n}`).toBe(true);
      expect(c.nearby).not.toContain(c.name);
      expect(c.description.length).toBeLessThanOrEqual(160);
      expect(`${c.title} | ${brand.name}`.length).toBeLessThanOrEqual(70);
    }
  });

  it("introdução, entrega e vizinhas diferem mesmo tirando o nome da cidade", () => {
    for (let i = 0; i < CITY_PAGES.length; i++) {
      for (let j = i + 1; j < CITY_PAGES.length; j++) {
        const a = CITY_PAGES[i];
        const b = CITY_PAGES[j];
        const textA = withoutName([...a.intro, a.delivery].join(" "), a.name);
        const textB = withoutName([...b.intro, b.delivery].join(" "), b.name);
        expect(textA).not.toBe(textB);
        expect(similarity(textA, textB), `${a.name} × ${b.name}`).toBeLessThan(0.35);
        expect(withoutName(a.description, a.name)).not.toBe(withoutName(b.description, b.name));
        expect(a.nearby.filter((n) => b.nearby.includes(n)).length).toBeLessThan(Math.min(a.nearby.length, b.nearby.length) / 2);
      }
    }
  });

  it("o passo a passo comum não cita cidade nem inventa prazo", () => {
    for (const step of DELIVERY_STEPS) {
      for (const c of CITY_PAGES) expect(step).not.toContain(c.name === "Maringá" ? "em Maringá" : c.name);
    }
  });
});

describe("dados estruturados da loja (schema.org)", () => {
  it("Organization (OnlineStore) com área atendida no Paraná e sem dado vazio", () => {
    const ld = organizationJsonLd(base);
    expect(ld).toMatchObject({
      "@type": "OnlineStore",
      "@id": `${base}/#loja`,
      name: "AzConfort",
      url: `${base}/`,
      areaServed: { "@type": "State", name: "Paraná" },
    });
    for (const k of ["taxID", "address", "telephone", "email", "legalName"]) expect(ld).not.toHaveProperty(k);
  });

  it("WebSite com a busca da loja (SearchAction)", () => {
    expect(websiteJsonLd(base)).toMatchObject({
      "@type": "WebSite",
      inLanguage: "pt-BR",
      publisher: { "@id": `${base}/#loja` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${base}/busca?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    });
  });

  it("LocalBusiness só com endereço real completo (hoje: nada publicado)", () => {
    expect(localBusinessJsonLd(base)).toBeNull();
    const original = { ...brand.location };
    try {
      Object.assign(brand.location, { streetAddress: "Rua Exemplo, 100", addressLocality: "Maringá", postalCode: "87000-000", addressRegion: "PR" });
      expect(localBusinessJsonLd(base)).toMatchObject({
        "@type": "FurnitureStore",
        address: { "@type": "PostalAddress", streetAddress: "Rua Exemplo, 100", addressLocality: "Maringá", addressRegion: "PR", addressCountry: "BR" },
        areaServed: { name: "Paraná" },
      });
      Object.assign(brand.location, { postalCode: "" });
      expect(localBusinessJsonLd(base)).toBeNull();
    } finally {
      Object.assign(brand.location, original);
    }
  });

  it("Offer com frete grátis (R$ 0) para BR-PR em todas as formas de oferta, sem prazo", () => {
    expect(SHIPPING_DETAILS).toEqual({
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "BRL" },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "BR", addressRegion: "PR" },
    });
    const simples = productJsonLd(makeProduct({ priceCents: 99900, variants: [] }), base)!;
    expect((simples.offers as Record<string, unknown>).shippingDetails).toEqual(SHIPPING_DETAILS);
    const grupo = productJsonLd(makeProduct({ variants: [makeVariant({ size: "casal" }), makeVariant({ size: "queen" })] }), base)!;
    for (const v of grupo.hasVariant as { offers: Record<string, unknown> }[]) expect(v.offers.shippingDetails).toEqual(SHIPPING_DETAILS);
    const faixa = productJsonLd(
      makeProduct({ variants: [makeVariant({ size: null, colorHex: null, priceCents: 1000 }), makeVariant({ size: null, colorHex: null, priceCents: 2000 })] }),
      base,
    )!;
    expect((faixa.offers as Record<string, unknown>)["@type"]).toBe("AggregateOffer");
    expect((faixa.offers as Record<string, unknown>).shippingDetails).toEqual(SHIPPING_DETAILS);
    expect(JSON.stringify([simples, grupo, faixa])).not.toContain("deliveryTime");
  });

  it("sem preço real ou produto de demonstração: nenhum Product/Offer", () => {
    expect(productJsonLd(makeProduct({ priceCents: null, variants: [] }), base)).toBeNull();
    expect(productJsonLd(makeProduct({ priceCents: 1000, variants: [], isDemo: true }), base)).toBeNull();
  });

  it("BreadcrumbList segue a trilha visível do produto", () => {
    const ld = breadcrumbJsonLd(productBreadcrumbs(makeProduct({ name: "Cadeira", slug: "cadeira", category: CADEIRAS })), base);
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Início", item: `${base}/` },
      { "@type": "ListItem", position: 2, name: "Móveis", item: `${base}/moveis` },
      { "@type": "ListItem", position: 3, name: "Cadeiras e poltronas", item: `${base}/moveis/cadeiras` },
      { "@type": "ListItem", position: 4, name: "Cadeira", item: `${base}/produtos/cadeira` },
    ]);
  });
});

describe("sitemap com a arquitetura nova (lib/seo/sitemap.ts)", () => {
  const cats = [category(), category({ id: "c3", slug: "sofas", name: "Sofás" })];
  const sofa = makeProduct({ slug: "sofa-3", name: "Sofá 3 lugares", category: SOFAS, variants: [], updatedAt: "2026-11-03T00:00:00.000Z" });
  const demo = makeProduct({ slug: "sofa-demo", name: "Sofá 2 lugares", category: SOFAS, variants: [], isDemo: true });

  it("trava aberta: seção, subcategorias com produto real, entrega e cidades; demonstração fora", () => {
    const urls = buildSitemap({ base, products: [sofa, demo], categories: cats, indexing: true }).map((e) => e.url.replace(base, ""));
    expect(urls).toEqual([
      "/",
      "/produtos",
      "/estofados",
      "/estofados/sofa-3-lugares",
      "/estofados/sofas",
      "/entrega",
      "/entrega/maringa",
      "/entrega/londrina",
      "/produtos/sofa-3",
      "/atendimento",
      "/politicas/privacidade",
      "/politicas/trocas-e-devolucoes",
      "/politicas/entrega",
      "/politicas/termos-de-uso",
    ]);
  });

  it("trava fechada: só o início e as páginas fixas", () => {
    const urls = buildSitemap({ base, products: [sofa], categories: cats, indexing: false }).map((e) => e.url.replace(base, ""));
    expect(urls).toEqual(["/", "/atendimento", "/politicas/privacidade", "/politicas/trocas-e-devolucoes", "/politicas/entrega", "/politicas/termos-de-uso"]);
  });

  it("toda seção do menu existe como rota", () => {
    for (const s of SECTIONS) expect(statSync(join(process.cwd(), "app/(store)", s.key, "page.tsx")).isFile()).toBe(true);
  });
});

describe("performance: imagens e 3D", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = join(dir, d.name);
      if (d.isDirectory()) return walk(p);
      return /\.(tsx?|mts)$/.test(d.name) ? [p] : [];
    });
  const files = ["app", "components", "lib"].flatMap((dir) => walk(dir));

  it("o visualizador 3D (model-viewer/three.js) nunca entra no carregamento inicial: só import() sob demanda", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const staticImport = /^\s*import\s+(?!type\b)[^;]*from\s+["']@google\/model-viewer["']/m.test(src) || /^\s*import\s+["']@google\/model-viewer["']/m.test(src);
      expect(staticImport, f).toBe(false);
    }
    const media = readFileSync("components/product/product-media.tsx", "utf8");
    expect(media).toMatch(/import\("@google\/model-viewer"\)/);
  });

  it("next/image: sem `priority` (obsoleto no Next 16) e com `sizes` sempre que usa `fill`", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (!/from "next\/image"/.test(src)) continue;
      for (const tag of src.match(/<Image\b[\s\S]*?\/>/g) ?? []) {
        expect(tag, f).not.toMatch(/\spriority[\s={]/);
        if (/\sfill\b/.test(tag)) expect(tag, f).toMatch(/\ssizes=/);
      }
    }
  });
});

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getRewrittenUrl, isRewrite } from "next/experimental/testing/server";
import type { Category } from "@/lib/catalog/types";
import { makeProduct } from "./factories";

/**
 * Issue #31 (SEO Paraná): home, textos das categorias por slug, /entrega-parana,
 * guias, trava de indexação na versão corrigida (#17) e 404 de verdade para
 * produto, categoria e guia inexistentes.
 */

const catalog = vi.hoisted(() => ({
  getVisibleProducts: vi.fn(),
  getCategories: vi.fn(),
  getCategoriesWithProducts: vi.fn(),
  getVisibleProductBySlug: vi.fn(),
  getCategoryBySlug: vi.fn(),
}));
const gate = vi.hoisted(() => ({ open: false }));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/catalog/queries", () => ({ CATALOG_TAG: "catalog", ...catalog }));
vi.mock("@/config/site", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/site")>();
  return { ...actual, indexingAllowed: () => gate.open && !actual.isDemoMode() };
});

const realSite = await vi.importActual<typeof import("@/config/site")>("@/config/site");
const { brand } = await import("@/config/brand");
const { HOME_DESCRIPTION, HOME_H1, HOME_TITLE } = await import("@/lib/seo/home");
const { CATEGORY_SEO } = await import("@/content/categorias-seo");
const { DELIVERY_CITIES, normalizeCityName } = await import("@/content/cidades-atendidas");
const { GUIAS, guiasDaCategoria } = await import("@/content/guias");
const { articleJsonLd } = await import("@/lib/seo/structured-data");
const { default: robots } = await import("@/app/robots");
const { pageRobots, siteRobots } = await import("@/lib/seo/robots");
const { buildSitemap } = await import("@/lib/seo/sitemap");
const { catalogSlugExists } = await import("@/lib/catalog/slug-exists");
const { proxy } = await import("@/proxy");
const productPage = await import("@/app/(store)/produtos/[slug]/page");
const categoryPage = await import("@/app/(store)/categorias/[slug]/page");
const entregaPage = await import("@/app/(store)/entrega-parana/page");
const guidesPage = await import("@/app/(store)/guias/page");
const guidePage = await import("@/app/(store)/guias/[slug]/page");

const BASE = "https://loja.exemplo";
const ENV = { ...process.env };
const TRAVESSAO = /[—–]/;
const PROIBIDO = /frete\s+gr[aá]tis|R\$|\d+\s*(dias?|horas?)\b|úteis|avalia|estrelas|garantia de|mais vendid|o melhor|os melhores/i;
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

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

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = BASE;
  process.env.CATALOG_SOURCE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave-publica-de-teste";
  gate.open = false;
  for (const fn of Object.values(catalog)) fn.mockReset();
});

afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

describe("home e marca", () => {
  it("título sem travessão, até ~60 caracteres, com colchões, sofás e poltronas", () => {
    expect(HOME_TITLE).toBe("Colchões, Sofás e Poltronas no Paraná | AzConfort");
    expect(HOME_TITLE.length).toBeLessThanOrEqual(60);
    expect(HOME_TITLE).not.toMatch(TRAVESSAO);
    expect(HOME_TITLE).not.toMatch(/móveis/i);
  });

  it("resumo até 155 caracteres, com colchões, sofás, poltronas e a região, sem promessa", () => {
    expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(155);
    expect(HOME_DESCRIPTION).toMatch(/colchões/i);
    expect(HOME_DESCRIPTION).toMatch(/sofás/i);
    expect(HOME_DESCRIPTION).toMatch(/poltronas/i);
    expect(HOME_DESCRIPTION).toMatch(/Paraná/);
    expect(HOME_DESCRIPTION).not.toMatch(PROIBIDO);
    expect(HOME_DESCRIPTION).not.toMatch(TRAVESSAO);
    expect(HOME_H1).not.toMatch(/entrega|maringá|frete/i);
  });

  it("marca com colchão no subtítulo e na descrição, sem frete nem dado inventado", () => {
    expect(brand.tagline).toMatch(/colchões/i);
    expect(brand.description).toMatch(/colchões/i);
    expect(`${brand.tagline} ${brand.description}`).not.toMatch(PROIBIDO);
    expect(`${brand.tagline} ${brand.description}`).not.toMatch(TRAVESSAO);
    expect(brand.legal.cnpj).toBe("");
    expect(brand.location.streetAddress).toBe("");
  });

  it("a página inicial usa o título, o resumo e o H1 de lib/seo/home.ts (um H1 só)", () => {
    const src = readFileSync("app/(store)/page.tsx", "utf8");
    expect(src).toMatch(/title: \{ absolute: HOME_TITLE \}/);
    expect(src).toMatch(/description: HOME_DESCRIPTION/);
    expect(src).toMatch(/\{HOME_H1\}/);
    expect(src.match(/<h1\b/g)).toHaveLength(1);
    expect(src).toMatch(/alt=\{image\.altText\}/);
  });
});

describe("textos das categorias por slug (sem a migração)", () => {
  const slugs = ["colchoes", "sofas", "poltronas", "mesas", "cadeiras"];

  it("cobre colchões, sofás, poltronas, mesas e cadeiras, sem categoria 'estofados'", () => {
    expect(Object.keys(CATEGORY_SEO).sort()).toEqual([...slugs].sort());
    expect(CATEGORY_SEO).not.toHaveProperty("estofados");
  });

  it("títulos variados no formato {Categoria}: {atributos}, sem o gabarito 'em Maringá e no Paraná'", () => {
    const titles = slugs.map((s) => CATEGORY_SEO[s].title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const t of titles) {
      expect(t).toMatch(/^[A-ZÀ-Ú][^:]+: /);
      expect(t).not.toMatch(/Maringá|Paraná/);
      expect(`${t} | AzConfort`.length).toBeLessThanOrEqual(60);
    }
  });

  it("resumo até 155 caracteres, com a região uma vez só; no máximo 2 menções à região na página", () => {
    for (const s of slugs) {
      const c = CATEGORY_SEO[s];
      expect(c.description.length, s).toBeLessThanOrEqual(155);
      expect(c.description.match(/Paraná/g), s).toHaveLength(1);
      const page = [c.description, ...c.content, ...c.faq.flatMap((f) => [f.question, f.answer])].join(" ");
      expect((page.match(/Paraná|Maringá/g) ?? []).length, s).toBeLessThanOrEqual(2);
    }
  });

  it("3 a 5 parágrafos e 3 perguntas, sem frete, prazo, preço, avaliação nem travessão", () => {
    for (const s of slugs) {
      const c = CATEGORY_SEO[s];
      expect(c.content.length, s).toBeGreaterThanOrEqual(3);
      expect(c.content.length, s).toBeLessThanOrEqual(5);
      expect(c.faq, s).toHaveLength(3);
      const text = JSON.stringify(c);
      expect(text, s).not.toMatch(PROIBIDO);
      expect(text, s).not.toMatch(TRAVESSAO);
      expect(text, s).not.toMatch(/entrega a partir|sa[ií]da de Maring/i);
    }
  });

  it("nada repetido entre categorias (resumo, parágrafos e respostas)", () => {
    const all = slugs.flatMap((s) => [CATEGORY_SEO[s].description, ...CATEGORY_SEO[s].content, ...CATEGORY_SEO[s].faq.map((f) => f.answer)]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("/entrega-parana", () => {
  const RECEBIDA =
    "Abatia, Adhemar de Barros, Alto Parana, Amapora, Andira, Aparecida do Ivai, Apucarana, Arapongas, Arapua, Ariranha do Ivai, Astorga, Bandeirantes, Barra do Jacare, Bom Sucesso, Borrazopolis, California, Cambara, Cambe, Cambira, Campo Mourao, Candido de Abreu, Carlopolis, Cianorte, Colorado, Congonhinhas, Conselheiro Mairinck, Cruzmaltina, Curitiba, Curiuva, Diamante do Norte, Engenheiro Beltrao, Faxinal, Figueira, Godoy Moreira, Grandes Rios, Guairaca, Guapirama, Ibaiti, Ibipora, Iguaracu, Itambaraca, Itauna do Sul, Ivaipora, Jaboti, Jacarezinho, Jandaia do Sul, Japira, Jardim Alegre, Jataizinho, Joaquim Tavora, Jundiai do Sul, Kalore, Lidianopolis, Loanda, Londrina, Lunardelli, Mandaguacu, Mandaguari, Manoel Ribas, Marialva, Marilandia do Sul, Marilena, Maringa, Marumbi, Maua da Serra, Nova Esperanca, Nova Fatima, Nova Londrina, Novo Itacolomi, Paicandu, Paranacity, Paranavai, Peabiru, Pinhalao, Pitanga, Planaltina do Parana, Porto Rico, Porto Sao Jose, Quatigua, Querencia do Norte, Ribeirao Claro, Ribeirao do Pinhal, Rio Bom, Rio Branco do Ivai, Rolandia, Rosario do Ivai, Sabaudia, Salto do Itarare, Santa Amelia, Santa Cruz de Monte Castelo, Santa Isabel do Ivai, Santa Monica, Santana do Itarare, Santo Antonio da Platina, Santo Antonio do Paraiso, Sao Joao do Ivai, Sao Jose da Boa Vista, Sao Jose do Ivai, Sao Pedro do Ivai, Sao Pedro do Parana, Sapopema, Sarandi, Siqueira Campos, Tamarana, Tapejara, Terra Rica, Tomazina, Umuarama, Wenceslau Braz".split(", ");

  it("a lista é a mesma da issue #28 (109 nomes, a grafia com acento não muda a lista)", () => {
    expect(RECEBIDA).toHaveLength(109);
    expect(DELIVERY_CITIES.map((c) => normalizeCityName(c.name))).toEqual(RECEBIDA.map(normalizeCityName));
    expect(DELIVERY_CITIES.every((c) => c.uf === "PR")).toBe(true);
  });

  it("Curitiba fica como não confirmada (ponto em aberto da #28)", () => {
    expect(DELIVERY_CITIES.filter((c) => !c.confirmed).map((c) => c.name)).toEqual(["Curitiba"]);
  });

  it("noindex sempre (mesmo com a trava aberta), canonical próprio e sem frete grátis no texto", () => {
    gate.open = true;
    expect(entregaPage.metadata).toMatchObject({ robots: { index: false, follow: true }, alternates: { canonical: "/entrega-parana" } });
    const src = readFileSync("app/(store)/entrega-parana/page.tsx", "utf8");
    const visible = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*\*[\s\S]*?\*\//g, "");
    expect(visible).not.toMatch(PROIBIDO);
    expect(visible).not.toMatch(TRAVESSAO);
    expect(src).toMatch(/TODO\(Cristian, issues #28 e #31\): texto de frete/);
  });

  it("fica fora do sitemap mesmo com a trava aberta", () => {
    const urls = buildSitemap({ base: BASE, products: [makeProduct()], categories: [category()], guides: [], indexing: true }).map((e) => e.url);
    expect(urls.some((u) => u.includes("/entrega-parana"))).toBe(false);
  });
});

describe("guias de compra", () => {
  const texto = (g: (typeof GUIAS)[number]) => [g.title, g.description, ...g.intro, ...g.sections.flatMap((x) => [x.heading, ...x.paragraphs])].join(" ");

  it("cobrem colchão, sofá, estofado, poltrona e mesa, cada um com título, resumo e slug próprios", () => {
    expect(GUIAS.length).toBeGreaterThanOrEqual(6);
    for (const field of ["slug", "title", "description"] as const) {
      expect(new Set(GUIAS.map((g) => g[field])).size, field).toBe(GUIAS.length);
    }
    const all = GUIAS.map(texto).join(" ").toLowerCase();
    for (const tema of ["colchão", "sofá", "estofado", "poltrona", "mesa"]) expect(all).toContain(tema);
  });

  it("no formato que o Google mostra: título até ~60 com a marca, resumo até 155, slug limpo", () => {
    for (const g of GUIAS) {
      expect(`${g.title} | AzConfort`.length, g.slug).toBeLessThanOrEqual(62);
      expect(g.description.length, g.slug).toBeLessThanOrEqual(155);
      expect(g.description.length, g.slug).toBeGreaterThanOrEqual(80);
      expect(g.slug, g.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(g.sections.length, g.slug).toBeGreaterThanOrEqual(3);
      for (const sec of g.sections) expect(sec.paragraphs.length, `${g.slug}: ${sec.heading}`).toBeGreaterThan(0);
    }
  });

  it("sem frete, prazo, preço, avaliação, garantia, superlativo nem travessão; região sem exagero", () => {
    for (const g of GUIAS) {
      const t = texto(g);
      expect(t, g.slug).not.toMatch(PROIBIDO);
      expect(t, g.slug).not.toMatch(TRAVESSAO);
      expect(t, g.slug).not.toMatch(/sa[ií]da de Maring|entrega a partir/i);
      expect((t.match(/Paraná|Maringá/g) ?? []).length, g.slug).toBeLessThanOrEqual(4);
    }
  });

  it("autor, datas e categoria reais: Article sai para todos; categoria só entre as cobertas", () => {
    for (const g of GUIAS) {
      expect(g.author.trim(), g.slug).not.toBe("");
      expect(g.datePublished, g.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(g.dateModified >= g.datePublished, g.slug).toBe(true);
      if (g.categorySlug) expect(Object.keys(CATEGORY_SEO), g.slug).toContain(g.categorySlug);
      expect(articleJsonLd(g, BASE), g.slug).toMatchObject({ "@type": "Article", headline: g.title, url: `${BASE}/guias/${g.slug}` });
    }
  });

  it("índice: canonical, noindex com a trava fechada e indexável com ela aberta", () => {
    expect(guidesPage.generateMetadata()).toMatchObject({ robots: { index: false, follow: false }, alternates: { canonical: "/guias" } });
    gate.open = true;
    expect(guidesPage.generateMetadata()).not.toHaveProperty("robots");
  });

  it("guia: canonical e Open Graph de artigo; slug inexistente responde 404", async () => {
    gate.open = true;
    const g = GUIAS[0];
    const meta = await guidePage.generateMetadata({ params: Promise.resolve({ slug: g.slug }) } as never);
    expect(meta).toMatchObject({ title: g.title, description: g.description, alternates: { canonical: `/guias/${g.slug}` }, openGraph: { type: "article" } });
    expect(meta).not.toHaveProperty("robots");
    await expect(guidePage.generateMetadata({ params: Promise.resolve({ slug: "nao-existe" }) } as never)).rejects.toMatchObject(NOT_FOUND);
    expect(guidePage.generateStaticParams()).toEqual(GUIAS.map((x) => ({ slug: x.slug })));
  });

  it("sitemap: guias entram com a trava aberta, nunca com ela fechada", () => {
    const aberta = buildSitemap({ base: BASE, products: [], categories: [], guides: GUIAS, indexing: true }).map((e) => e.url);
    expect(aberta).toEqual(expect.arrayContaining([`${BASE}/guias`, ...GUIAS.map((g) => `${BASE}/guias/${g.slug}`)]));
    const fechada = buildSitemap({ base: BASE, products: [], categories: [], guides: GUIAS, indexing: false }).map((e) => e.url);
    expect(fechada.some((u) => u.includes("/guias"))).toBe(false);
  });

  it("categorias ligam aos seus guias (até 3)", () => {
    expect(guiasDaCategoria("colchoes").map((g) => g.slug)).toEqual(["como-escolher-o-tamanho-do-colchao", "comprar-colchao-online-no-parana"]);
    expect(guiasDaCategoria("sofas").length).toBeLessThanOrEqual(3);
  });
});

describe("trava de indexação (issue #17, versão corrigida)", () => {
  it("vem fechada no código, sem variável de ambiente nova", () => {
    expect(realSite.INDEXING_ALLOWED).toBe(false);
    expect(realSite.indexingAllowed()).toBe(false);
  });

  it("fechada: robots sem 'Disallow: /' (o Google lê o noindex), sem sitemap; noindex, nofollow nas páginas", () => {
    const r = robots();
    expect(r).toEqual({ rules: [expect.objectContaining({ userAgent: "*", allow: "/" })] });
    expect((r.rules as { disallow: string[] }[])[0].disallow).toEqual(["/admin", "/api", "/carrinho", "/finalizar", "/pedido", "/conta", "/busca"]);
    expect(r).not.toHaveProperty("sitemap");
    expect(siteRobots()).toEqual({ index: false, follow: false });
    expect(pageRobots(true)).toEqual({ index: false, follow: false });
  });

  it("fechada: cabeçalho X-Robots-Tag noindex em todas as respostas", async () => {
    const { default: config } = await import("@/next.config");
    const rules = await config.headers!();
    const robotsHeader = rules.find((r) => r.headers.some((h) => h.key === "X-Robots-Tag"));
    expect(robotsHeader).toMatchObject({ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] });
  });

  it("aberta: robots anuncia o sitemap e as páginas seguem o index do layout", () => {
    gate.open = true;
    expect(robots().sitemap).toBe(`${BASE}/sitemap.xml`);
    expect(siteRobots()).toEqual({ index: true, follow: true });
    expect(pageRobots(true)).toBeUndefined();
    expect(pageRobots(false)).toEqual({ index: false, follow: true });
  });
});

describe("404 de verdade (produto, categoria e guia inexistentes)", () => {
  it("o proxy reescreve endereço inexistente para a página de não encontrada (status 404)", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    for (const path of ["/produtos/nao-existe", "/categorias/nao-existe", "/guias/nao-existe", "/produtos/__vazio__"]) {
      const res = await proxy(new NextRequest(`${BASE}${path}`));
      expect(isRewrite(res), path).toBe(true);
      expect(new URL(getRewrittenUrl(res)!).pathname, path).toBe("/404-nao-encontrado");
    }
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/rest/v1/products?");
    expect(url).toContain("slug=eq.nao-existe");
    expect(url).toContain("status=eq.published");
    expect(url).toContain("is_demo=eq.false");
    expect((init.headers as Record<string, string>).apikey).toBe("chave-publica-de-teste");
  });

  it("endereço que existe segue normal (e fica lembrado); navegação interna e banco fora do ar não viram 404", async () => {
    const fetchMock = vi.fn(async () => new Response('[{"slug":"colchao-real"}]', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const ok = await proxy(new NextRequest(`${BASE}/produtos/colchao-real`));
    expect(isRewrite(ok)).toBe(false);
    await proxy(new NextRequest(`${BASE}/produtos/colchao-real`));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const rsc = await proxy(new NextRequest(`${BASE}/produtos/nao-existe-2`, { headers: { rsc: "1" } }));
    expect(isRewrite(rsc)).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    expect(await catalogSlugExists("categorias", "cadeiras")).toBeNull();
    const fora = await proxy(new NextRequest(`${BASE}/categorias/cadeiras`));
    expect(isRewrite(fora)).toBe(false);
  });

  it("modo demonstração confere nos dados de demonstração, sem banco", async () => {
    process.env.CATALOG_SOURCE = "demo";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await catalogSlugExists("produtos", "poltrona-azul")).toBe(true);
    expect(await catalogSlugExists("categorias", "cadeiras")).toBe(true);
    expect(await catalogSlugExists("produtos", "nao-existe")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no metadata, categoria e produto inexistentes também chamam notFound()", async () => {
    catalog.getCategoryBySlug.mockResolvedValue(null);
    catalog.getVisibleProducts.mockResolvedValue([]);
    catalog.getVisibleProductBySlug.mockResolvedValue(null);
    await expect(categoryPage.generateMetadata({ params: Promise.resolve({ slug: "nao-existe" }) } as never)).rejects.toMatchObject(NOT_FOUND);
    await expect(productPage.generateMetadata({ params: Promise.resolve({ slug: "nao-existe" }) } as never)).rejects.toMatchObject(NOT_FOUND);
  });
});

describe("metadata de categoria e produto nas rotas atuais", () => {
  it("categoria com produto: título e resumo do texto padrão, canonical /categorias/{slug}", async () => {
    gate.open = true;
    catalog.getCategoryBySlug.mockResolvedValue(category({ slug: "sofas", name: "Sofás" }));
    catalog.getVisibleProducts.mockResolvedValue([makeProduct({ category: { id: "s", slug: "sofas", name: "Sofás", requires3d: true } })]);
    const meta = await categoryPage.generateMetadata({ params: Promise.resolve({ slug: "sofas" }) } as never);
    expect(meta).toMatchObject({ title: CATEGORY_SEO.sofas.title, description: CATEGORY_SEO.sofas.description, alternates: { canonical: "/categorias/sofas" } });
    expect(meta).not.toHaveProperty("robots");
  });

  it("categoria vazia existe (200) mas fica com noindex", async () => {
    gate.open = true;
    catalog.getCategoryBySlug.mockResolvedValue(category({ slug: "mesas", name: "Mesas" }));
    catalog.getVisibleProducts.mockResolvedValue([]);
    const meta = await categoryPage.generateMetadata({ params: Promise.resolve({ slug: "mesas" }) } as never);
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("produto de demonstração: noindex mesmo com a trava aberta (issue #29)", async () => {
    gate.open = true;
    catalog.getVisibleProductBySlug.mockResolvedValue(makeProduct({ slug: "poltrona-demo", isDemo: true }));
    const meta = await productPage.generateMetadata({ params: Promise.resolve({ slug: "poltrona-demo" }) } as never);
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates).toEqual({ canonical: "/produtos/poltrona-demo" });
  });

  it("trava fechada: categoria e produto reais com noindex, nofollow", async () => {
    catalog.getCategoryBySlug.mockResolvedValue(category());
    catalog.getVisibleProducts.mockResolvedValue([makeProduct()]);
    catalog.getVisibleProductBySlug.mockResolvedValue(makeProduct({ slug: "colchao" }));
    expect((await categoryPage.generateMetadata({ params: Promise.resolve({ slug: "colchoes" }) } as never)).robots).toEqual({ index: false, follow: false });
    expect((await productPage.generateMetadata({ params: Promise.resolve({ slug: "colchao" }) } as never)).robots).toEqual({ index: false, follow: false });
  });
});

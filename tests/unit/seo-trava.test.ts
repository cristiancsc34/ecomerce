import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "@/lib/catalog/types";
import { makeProduct, makeVariant } from "./factories";

/**
 * Trava de indexação (issue #17) e metadata das páginas novas. A trava real é
 * uma constante fechada até o lançamento; aqui ela é aberta/fechada de mentira
 * para conferir os dois estados.
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
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/catalog/queries", () => ({ CATALOG_TAG: "catalog", ...catalog }));
vi.mock("@/config/site", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/site")>();
  return { ...actual, indexingAllowed: () => gate.open && !actual.isDemoMode() };
});

const realSite = await vi.importActual<typeof import("@/config/site")>("@/config/site");
const { default: robots } = await import("@/app/robots");
const { pageRobots, siteRobots, productStructuredDataAllowed } = await import("@/lib/seo/robots");
const routes = await import("@/components/catalog/section-routes");
const productPage = await import("@/app/(store)/produtos/[slug]/page");
const cityPage = await import("@/app/(store)/entrega/[cidade]/page");
const hubPage = await import("@/app/(store)/entrega/page");

const BASE = "https://loja.exemplo";
const ENV = { ...process.env };

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
});

describe("trava de indexação (issue #17)", () => {
  it("vem fechada no código, sem variável de ambiente", () => {
    expect(realSite.INDEXING_ALLOWED).toBe(false);
    expect(realSite.indexingAllowed()).toBe(false);
  });

  it("fechada: robots.txt com Disallow / e sem sitemap; noindex, nofollow em tudo; sem JSON-LD de produto", () => {
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
    expect(siteRobots()).toEqual({ index: false, follow: false });
    expect(pageRobots(true)).toEqual({ index: false, follow: false });
    expect(pageRobots(false)).toEqual({ index: false, follow: false });
    expect(productStructuredDataAllowed()).toBe(false);
  });

  it("aberta: robots.txt libera a loja e anuncia o sitemap; noindex só onde a página não tem o que mostrar", () => {
    gate.open = true;
    const r = robots();
    expect(r.sitemap).toBe(`${BASE}/sitemap.xml`);
    expect(r.rules).toEqual([expect.objectContaining({ userAgent: "*", allow: "/" })]);
    expect(siteRobots()).toEqual({ index: true, follow: true });
    expect(pageRobots(true)).toBeUndefined();
    expect(pageRobots(false)).toEqual({ index: false, follow: true });
    expect(productStructuredDataAllowed()).toBe(true);
  });

  it("modo demonstração nunca indexa, mesmo com a trava aberta", () => {
    gate.open = true;
    process.env.CATALOG_SOURCE = "demo";
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
    expect(pageRobots(true)).toEqual({ index: false, follow: false });
  });
});

describe("metadata das seções e subcategorias", () => {
  const colchao = makeProduct({ slug: "colchao", variants: [makeVariant({ size: "casal" })] });

  it("seção com produto: título, resumo, canonical e Open Graph próprios", async () => {
    gate.open = true;
    catalog.getVisibleProducts.mockResolvedValue([colchao]);
    catalog.getCategories.mockResolvedValue([category()]);
    const meta = await routes.sectionMetadata("colchoes");
    expect(meta).toMatchObject({
      title: "Colchões em Maringá e no Paraná",
      alternates: { canonical: "/colchoes" },
      openGraph: { url: "/colchoes", locale: "pt_BR", siteName: "AzConfort" },
    });
    expect(meta.description).toMatch(/Maringá.*Paraná/);
    expect(meta).not.toHaveProperty("robots");
  });

  it("seção sem produto: noindex (com a trava aberta) e canonical mesmo assim", async () => {
    gate.open = true;
    catalog.getVisibleProducts.mockResolvedValue([colchao]);
    catalog.getCategories.mockResolvedValue([category()]);
    const meta = await routes.sectionMetadata("estofados");
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates).toEqual({ canonical: "/estofados" });
  });

  it("com a trava fechada, toda listagem sai com noindex, nofollow", async () => {
    catalog.getVisibleProducts.mockResolvedValue([colchao]);
    catalog.getCategories.mockResolvedValue([category()]);
    expect((await routes.sectionMetadata("colchoes")).robots).toEqual({ index: false, follow: false });
    expect((await routes.subpageMetadata("colchoes", "casal")).robots).toEqual({ index: false, follow: false });
  });

  it("subcategoria fixa e categoria do banco têm canonical próprio; slug desconhecido responde 404", async () => {
    gate.open = true;
    const cadeira = makeProduct({ slug: "cadeira", category: { id: "c2", slug: "cadeiras", name: "Cadeiras e poltronas", requires3d: true } });
    catalog.getVisibleProducts.mockResolvedValue([colchao, cadeira]);
    catalog.getCategories.mockResolvedValue([category(), category({ id: "c2", slug: "cadeiras", name: "Cadeiras e poltronas" })]);
    expect(await routes.subpageMetadata("colchoes", "casal")).toMatchObject({
      title: "Colchão casal em Maringá e no Paraná",
      alternates: { canonical: "/colchoes/casal" },
    });
    expect(await routes.subpageMetadata("moveis", "cadeiras")).toMatchObject({
      title: "Cadeiras e poltronas em Maringá e no Paraná",
      alternates: { canonical: "/moveis/cadeiras" },
    });
    expect((await routes.subpageMetadata("colchoes", "casal")).robots).toBeUndefined();
    expect((await routes.subpageMetadata("colchoes", "king")).robots).toEqual({ index: false, follow: true });
    await expect(routes.subpageMetadata("moveis", "nao-existe")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});

describe("metadata do produto e das páginas de entrega", () => {
  it("produto real: canonical sem parâmetros; produto de demonstração: noindex mesmo com a trava aberta", async () => {
    gate.open = true;
    const real = makeProduct({ slug: "colchao-real" });
    const demo = makeProduct({ slug: "poltrona-demo", isDemo: true });
    catalog.getVisibleProductBySlug.mockImplementation(async (slug: string) => [real, demo].find((p) => p.slug === slug) ?? null);
    const metaReal = await productPage.generateMetadata({ params: Promise.resolve({ slug: "colchao-real" }) } as never);
    expect(metaReal.alternates).toEqual({ canonical: "/produtos/colchao-real" });
    expect(metaReal).not.toHaveProperty("robots");
    const metaDemo = await productPage.generateMetadata({ params: Promise.resolve({ slug: "poltrona-demo" }) } as never);
    expect(metaDemo.robots).toEqual({ index: false, follow: true });
  });

  it("cidade: título, resumo e canonical próprios; cidade sem página responde 404", async () => {
    gate.open = true;
    const maringa = await cityPage.generateMetadata({ params: Promise.resolve({ cidade: "maringa" }) } as never);
    expect(maringa).toMatchObject({
      title: "Colchões, sofás e móveis em Maringá com frete grátis",
      alternates: { canonical: "/entrega/maringa" },
    });
    expect(maringa).not.toHaveProperty("robots");
    const londrina = await cityPage.generateMetadata({ params: Promise.resolve({ cidade: "londrina" }) } as never);
    expect(londrina.alternates).toEqual({ canonical: "/entrega/londrina" });
    expect(londrina.description).not.toBe(maringa.description);
    await expect(cityPage.generateMetadata({ params: Promise.resolve({ cidade: "cascavel" }) } as never)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(cityPage.generateStaticParams()).toEqual([{ cidade: "maringa" }, { cidade: "londrina" }]);
  });

  it("entrega no Paraná: canonical e noindex com a trava fechada", () => {
    expect(hubPage.generateMetadata()).toMatchObject({
      alternates: { canonical: "/entrega" },
      robots: { index: false, follow: false },
    });
  });
});

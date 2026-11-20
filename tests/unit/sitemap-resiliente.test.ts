import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "@/lib/catalog/types";
import { makeMedia, makeProduct, makeVariant } from "./factories";

/**
 * Sitemap e generateStaticParams resilientes (issue #4) e trava de indexação (issue #17). Com a trava fechada
 * (padrão até o lançamento), o sitemap só tem o início e as páginas fixas e nem lê o catálogo. Aberta, entram as
 * seções, subcategorias com produto, páginas de entrega e produtos reais com fotos. Com a leitura do catálogo
 * falhando, o /sitemap.xml cai para o sitemap sem catálogo e as rotas dinâmicas para o placeholder, sem derrubar o
 * build e sem inventar produto. A falha fica registrada com console.error.
 */

const catalog = vi.hoisted(() => ({
  getVisibleProducts: vi.fn(),
  getCategories: vi.fn(),
  getCategoriesWithProducts: vi.fn(),
  getVisibleProductBySlug: vi.fn(),
  getCategoryBySlug: vi.fn(),
}));
const gate = vi.hoisted(() => ({ indexingAllowed: vi.fn(() => false) }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/catalog/queries", () => ({ CATALOG_TAG: "catalog", ...catalog }));
vi.mock("@/config/site", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/config/site")>()), ...gate }));

const { default: sitemap } = await import("@/app/sitemap");
const productPage = await import("@/app/(store)/produtos/[slug]/page");
const sectionRoutes = await import("@/components/catalog/section-routes");

const BASE = "https://loja.exemplo";
const STATIC_PAGES = [
  `${BASE}/atendimento`,
  `${BASE}/politicas/privacidade`,
  `${BASE}/politicas/trocas-e-devolucoes`,
  `${BASE}/politicas/entrega`,
  `${BASE}/politicas/termos-de-uso`,
];
const LOCAL_PAGES = [
  { url: `${BASE}/entrega`, lastModified: "2026-11-20" },
  { url: `${BASE}/entrega/maringa`, lastModified: "2026-11-20" },
  { url: `${BASE}/entrega/londrina`, lastModified: "2026-11-20" },
];

function makeCategory(partial: Partial<Category> = {}): Category {
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

const falha = () => Promise.reject(new Error("Falha ao carregar o catálogo: conexão recusada"));

let consoleError: ReturnType<typeof vi.spyOn>;
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = BASE;
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  for (const fn of Object.values(catalog)) fn.mockReset();
  gate.indexingAllowed.mockReturnValue(false);
});

afterEach(() => {
  consoleError.mockRestore();
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe("sitemap (app/sitemap.ts)", () => {
  it("trava fechada (padrão até o lançamento): só início e páginas fixas, sem ler o catálogo", async () => {
    catalog.getVisibleProducts.mockResolvedValue([makeProduct({ slug: "colchao-real" })]);
    catalog.getCategories.mockResolvedValue([makeCategory()]);

    const entries = await sitemap();

    expect(entries).toEqual([{ url: `${BASE}/` }, ...STATIC_PAGES.map((url) => ({ url }))]);
    const catalogo = new RegExp(`^${BASE}/(produtos|colchoes|estofados|moveis|categorias|entrega)(/|$)`);
    expect(entries.some((e) => catalogo.test(e.url))).toBe(false);
    expect(catalog.getVisibleProducts).not.toHaveBeenCalled();
  });

  it("trava aberta: início, listagem, seções e subcategorias com produto, entrega, produtos reais com fotos e páginas fixas", async () => {
    gate.indexingAllowed.mockReturnValue(true);
    const colchao = makeProduct({
      slug: "colchao-real",
      updatedAt: "2026-11-02T00:00:00.000Z",
      media: [makeMedia({ url: "https://cdn.exemplo/foto.jpg" })],
      variants: [makeVariant({ size: "casal" }), makeVariant({ size: "queen", widthCm: 158, lengthCm: 198 })],
    });
    const cadeira = makeProduct({
      slug: "cadeira-real",
      updatedAt: "2026-11-05T00:00:00.000Z",
      category: { id: "c2", slug: "cadeiras", name: "Cadeiras e poltronas", requires3d: true },
      variants: [],
      media: [],
    });
    const demo = makeProduct({ slug: "colchao-demo", isDemo: true, updatedAt: "2026-11-10T00:00:00.000Z" });
    catalog.getVisibleProducts.mockResolvedValue([colchao, cadeira, demo]);
    catalog.getCategories.mockResolvedValue([
      makeCategory(),
      makeCategory({ id: "c2", slug: "cadeiras", name: "Cadeiras e poltronas" }),
      makeCategory({ id: "c3", slug: "sofas", name: "Sofás" }),
    ]);

    const entries = await sitemap();

    expect(entries).toEqual([
      { url: `${BASE}/`, lastModified: "2026-11-05T00:00:00.000Z" },
      { url: `${BASE}/produtos`, lastModified: "2026-11-05T00:00:00.000Z" },
      { url: `${BASE}/colchoes`, lastModified: "2026-11-02T00:00:00.000Z" },
      { url: `${BASE}/colchoes/casal`, lastModified: "2026-11-02T00:00:00.000Z" },
      { url: `${BASE}/colchoes/queen`, lastModified: "2026-11-02T00:00:00.000Z" },
      { url: `${BASE}/moveis`, lastModified: "2026-11-05T00:00:00.000Z" },
      { url: `${BASE}/moveis/cadeiras`, lastModified: "2026-11-05T00:00:00.000Z" },
      ...LOCAL_PAGES,
      { url: `${BASE}/produtos/colchao-real`, lastModified: "2026-11-02T00:00:00.000Z", images: ["https://cdn.exemplo/foto.jpg"] },
      { url: `${BASE}/produtos/cadeira-real`, lastModified: "2026-11-05T00:00:00.000Z" },
      ...STATIC_PAGES.map((url) => ({ url })),
    ]);
    // Produto de demonstração e seção/subcategoria sem produto real ficam de fora.
    expect(entries.some((e) => e.url.includes("colchao-demo") || e.url.includes("/estofados") || e.url.includes("/categorias/"))).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("trava aberta e falha na leitura dos produtos: não lança e publica sem catálogo", async () => {
    gate.indexingAllowed.mockReturnValue(true);
    catalog.getVisibleProducts.mockImplementation(falha);
    catalog.getCategories.mockResolvedValue([makeCategory()]);

    const entries = await sitemap();

    expect(entries).toEqual([{ url: `${BASE}/` }, ...LOCAL_PAGES, ...STATIC_PAGES.map((url) => ({ url }))]);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0]?.[0])).toMatch(/sitemap/i);
  });

  it("trava aberta e falha na leitura das categorias: também publica sem catálogo", async () => {
    gate.indexingAllowed.mockReturnValue(true);
    catalog.getVisibleProducts.mockResolvedValue([makeProduct({ slug: "colchao-real" })]);
    catalog.getCategories.mockImplementation(falha);

    const entries = await sitemap();

    expect(entries).toEqual([{ url: `${BASE}/` }, ...LOCAL_PAGES, ...STATIC_PAGES.map((url) => ({ url }))]);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

describe("generateStaticParams de /produtos/[slug]", () => {
  it("com catálogo ok: um parâmetro por produto visível", async () => {
    catalog.getVisibleProducts.mockResolvedValue([makeProduct({ slug: "a" }), makeProduct({ slug: "b" })]);
    await expect(productPage.generateStaticParams()).resolves.toEqual([{ slug: "a" }, { slug: "b" }]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("com catálogo vazio: placeholder (como hoje)", async () => {
    catalog.getVisibleProducts.mockResolvedValue([]);
    await expect(productPage.generateStaticParams()).resolves.toEqual([{ slug: "__vazio__" }]);
  });

  it("com falha na leitura do catálogo: não quebra o build e devolve só o placeholder", async () => {
    catalog.getVisibleProducts.mockImplementation(falha);
    await expect(productPage.generateStaticParams()).resolves.toEqual([{ slug: "__vazio__" }]);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

describe("generateStaticParams das subpáginas de seção", () => {
  it("subcategorias fixas sempre, mais as categorias do banco da seção", async () => {
    catalog.getCategories.mockResolvedValue([
      makeCategory(),
      makeCategory({ id: "c2", slug: "colchoes-infantis", name: "Colchões infantis" }),
      makeCategory({ id: "c3", slug: "cadeiras", name: "Cadeiras" }),
    ]);
    await expect(sectionRoutes.subpageStaticParams("colchoes")).resolves.toEqual([
      { sub: "solteiro" },
      { sub: "solteiro-king" },
      { sub: "casal" },
      { sub: "queen" },
      { sub: "king" },
      { sub: "colchoes-infantis" },
    ]);
    await expect(sectionRoutes.subpageStaticParams("moveis")).resolves.toEqual([{ sub: "cadeiras" }]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("com falha na leitura das categorias: não quebra o build e segue com as subcategorias fixas", async () => {
    catalog.getCategories.mockImplementation(falha);
    await expect(sectionRoutes.subpageStaticParams("estofados")).resolves.toEqual([{ sub: "sofa-2-lugares" }, { sub: "sofa-3-lugares" }]);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

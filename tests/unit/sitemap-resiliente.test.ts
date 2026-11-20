import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "@/lib/catalog/types";
import { makeMedia, makeProduct } from "./factories";

/**
 * Sitemap e generateStaticParams resilientes (issue #4). Com o catálogo respondendo, tudo sai como antes; com a
 * leitura do catálogo falhando (Supabase fora do ar no build ou numa visita), o /sitemap.xml cai para o sitemap
 * mínimo (início e páginas fixas) e as rotas dinâmicas para o placeholder `__vazio__`, sem derrubar o build e sem
 * inventar produto. A falha fica registrada com console.error.
 */

const catalog = vi.hoisted(() => ({
  getVisibleProducts: vi.fn(),
  getCategories: vi.fn(),
  getCategoriesWithProducts: vi.fn(),
  getVisibleProductBySlug: vi.fn(),
  getCategoryBySlug: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/catalog/queries", () => ({ CATALOG_TAG: "catalog", ...catalog }));

const { default: sitemap } = await import("@/app/sitemap");
const productPage = await import("@/app/(store)/produtos/[slug]/page");
const categoryPage = await import("@/app/(store)/categorias/[slug]/page");

const BASE = "https://loja.exemplo";
const STATIC_PAGES = [
  `${BASE}/atendimento`,
  `${BASE}/politicas/privacidade`,
  `${BASE}/politicas/trocas-e-devolucoes`,
  `${BASE}/politicas/entrega`,
  `${BASE}/politicas/termos-de-uso`,
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
});

afterEach(() => {
  consoleError.mockRestore();
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe("sitemap (app/sitemap.ts)", () => {
  it("com catálogo ok: início, listagem, categorias com produto, produtos reais com fotos e páginas fixas", async () => {
    const real = makeProduct({
      slug: "colchao-real",
      updatedAt: "2026-11-02T00:00:00.000Z",
      media: [makeMedia({ url: "https://cdn.exemplo/foto.jpg" })],
    });
    const demo = makeProduct({ slug: "colchao-demo", isDemo: true, updatedAt: "2026-11-10T00:00:00.000Z" });
    catalog.getVisibleProducts.mockResolvedValue([real, demo]);
    catalog.getCategoriesWithProducts.mockResolvedValue([
      { ...makeCategory(), productCount: 2 },
      { ...makeCategory({ id: "00000000-0000-4000-8000-0000000000c2", slug: "sofas", name: "Sofás" }), productCount: 1 },
    ]);

    const entries = await sitemap();

    expect(entries).toEqual([
      { url: `${BASE}/`, lastModified: "2026-11-02T00:00:00.000Z" },
      { url: `${BASE}/produtos`, lastModified: "2026-11-02T00:00:00.000Z" },
      { url: `${BASE}/categorias/colchoes`, lastModified: "2026-11-02T00:00:00.000Z" },
      { url: `${BASE}/produtos/colchao-real`, lastModified: "2026-11-02T00:00:00.000Z", images: ["https://cdn.exemplo/foto.jpg"] },
      ...STATIC_PAGES.map((url) => ({ url })),
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("com falha na leitura dos produtos: não lança e devolve o sitemap mínimo, sem produto nem categoria", async () => {
    catalog.getVisibleProducts.mockImplementation(falha);
    catalog.getCategoriesWithProducts.mockResolvedValue([{ ...makeCategory(), productCount: 1 }]);

    const entries = await sitemap();

    expect(entries).toEqual([{ url: `${BASE}/` }, ...STATIC_PAGES.map((url) => ({ url }))]);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0]?.[0])).toMatch(/sitemap/i);
  });

  it("com falha na leitura das categorias: também cai para o sitemap mínimo", async () => {
    catalog.getVisibleProducts.mockResolvedValue([makeProduct({ slug: "colchao-real" })]);
    catalog.getCategoriesWithProducts.mockImplementation(falha);

    const entries = await sitemap();

    expect(entries).toEqual([{ url: `${BASE}/` }, ...STATIC_PAGES.map((url) => ({ url }))]);
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

describe("generateStaticParams de /categorias/[slug]", () => {
  it("com catálogo ok: um parâmetro por categoria", async () => {
    catalog.getCategories.mockResolvedValue([
      makeCategory(),
      makeCategory({ id: "00000000-0000-4000-8000-0000000000c2", slug: "sofas", name: "Sofás" }),
    ]);
    await expect(categoryPage.generateStaticParams()).resolves.toEqual([{ slug: "colchoes" }, { slug: "sofas" }]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("sem categorias: placeholder (como hoje)", async () => {
    catalog.getCategories.mockResolvedValue([]);
    await expect(categoryPage.generateStaticParams()).resolves.toEqual([{ slug: "__vazio__" }]);
  });

  it("com falha na leitura das categorias: não quebra o build e devolve só o placeholder", async () => {
    catalog.getCategories.mockImplementation(falha);
    await expect(categoryPage.generateStaticParams()).resolves.toEqual([{ slug: "__vazio__" }]);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

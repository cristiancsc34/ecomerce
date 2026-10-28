import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As Server Actions são endpoints públicos (qualquer um pode chamá-las com o
 * id da ação). Aqui garantimos que elas recusam quem não é da equipe, e que
 * editores não fazem ações de administrador — antes de tocar no banco.
 */

type Role = "admin" | "editor" | null;
const state: { user: { id: string; email: string } | null; role: Role } = { user: null, role: null };
const calls: string[] = [];

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = (name: string) => () => {
    calls.push(`${table}.${name}`);
    return b;
  };
  for (const m of ["select", "eq", "in", "order", "limit", "update", "insert", "delete", "upsert"]) b[m] = chain(m);
  b.maybeSingle = async () => {
    if (table === "admin_users") return { data: state.role ? { role: state.role } : null, error: null };
    return { data: null, error: null };
  };
  b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return b;
}

const fakeClient = {
  auth: {
    getUser: async () => ({ data: { user: state.user } }),
  },
  from: (table: string) => builder(table),
  rpc: async (fn: string) => {
    calls.push(`rpc.${fn}`);
    return { data: "00000000-0000-4000-8000-000000000999", error: null };
  },
  storage: {
    from: () => ({
      upload: async () => {
        calls.push("storage.upload");
        return { error: null };
      },
      remove: async () => {
        calls.push("storage.remove");
        return { error: null };
      },
    }),
  },
};

vi.mock("@/lib/supabase/server", () => ({ createSessionClient: async () => fakeClient }));
vi.mock("next/cache", () => ({ updateTag: vi.fn(), cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave-publica-de-teste";

const PRODUCT = "00000000-0000-4000-8000-000000000101";
const MEDIA = "00000000-0000-4000-8000-000000000201";

const products = await import("@/lib/admin/actions/products");
const media = await import("@/lib/admin/actions/media");
const categories = await import("@/lib/admin/actions/categories");

function as(role: Role, logged = true) {
  state.user = logged ? { id: "00000000-0000-4000-8000-0000000000aa", email: "x@y.z" } : null;
  state.role = role;
}

function writes() {
  return calls.filter((c) => /\.(update|insert|delete|upsert)$|^rpc\.|^storage\./.test(c));
}

beforeEach(() => {
  calls.length = 0;
});

describe("sem sessão ou fora da equipe", () => {
  it.each([
    ["visitante sem login", null, false],
    ["usuário logado que não é da equipe", null, true],
  ] as const)("%s não consegue nada", async (_label, role, logged) => {
    as(role, logged);
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array([1, 2, 3])], "a.png"));
    fd.set("altText", "texto alternativo");

    const results = [
      await products.saveProductAction(null, {}),
      await products.createProductDraftAction({ name: "Produto novo", categoryId: "" }),
      await products.changeStatusAction(PRODUCT, "published"),
      await products.duplicateProductAction(PRODUCT),
      await products.deleteProductAction(PRODUCT),
      await products.markAsRealProductAction(PRODUCT),
      await media.uploadMediaAction(PRODUCT, fd),
      await media.updateMediaAction(MEDIA, { altText: "texto alternativo", isIllustrative: false }),
      await media.setPrimaryMediaAction(MEDIA),
      await media.moveMediaAction(PRODUCT, MEDIA, "up"),
      await media.deleteMediaAction(MEDIA),
      await categories.deleteCategoryAction(PRODUCT),
    ];
    for (const r of results) expect(r.ok).toBe(false);
    expect(writes()).toEqual([]);
  });
});

describe("editor", () => {
  beforeEach(() => as("editor"));

  it("não publica, não arquiva, não exclui, não converte demonstração", async () => {
    expect((await products.changeStatusAction(PRODUCT, "published")).ok).toBe(false);
    expect((await products.changeStatusAction(PRODUCT, "archived")).ok).toBe(false);
    expect((await products.deleteProductAction(PRODUCT)).ok).toBe(false);
    expect((await products.markAsRealProductAction(PRODUCT)).ok).toBe(false);
    expect((await categories.deleteCategoryAction(PRODUCT)).ok).toBe(false);
    expect(writes()).toEqual([]);
  });

  it("pode salvar rascunho válido (via RPC com RLS)", async () => {
    const r = await products.saveProductAction(null, {
      name: "Novo",
      slug: "novo",
      shortDescription: null,
      description: null,
      categoryId: null,
      priceCents: 1000,
      compareAtPriceCents: null,
      sku: null,
      stockQuantity: null,
      dimensions: {},
      attributes: {},
      faq: [],
      seoTitle: null,
      seoDescription: null,
      variants: [],
    });
    expect(r.ok).toBe(true);
    expect(calls).toContain("rpc.save_product");
  });
});

describe("cadastro em um passo", () => {
  beforeEach(() => as("editor"));

  it("cria o rascunho só com nome (o endereço sai do nome)", async () => {
    const r = await products.createProductDraftAction({ name: "Poltrona Azul", categoryId: "" });
    expect(r.ok).toBe(true);
    expect(calls).toContain("rpc.save_product");
  });

  it("nome vazio ou categoria inválida não chegam ao banco", async () => {
    const empty = await products.createProductDraftAction({ name: " ", categoryId: "" });
    expect(empty.ok ? {} : empty.fieldErrors).toHaveProperty("name");
    const badCategory = await products.createProductDraftAction({ name: "Poltrona", categoryId: "x' or 1=1" });
    expect(badCategory.ok).toBe(false);
    expect(writes()).toEqual([]);
  });
});

describe("validação no servidor (mesmo para administradores)", () => {
  beforeEach(() => as("admin"));

  it("dados inválidos não chegam ao banco", async () => {
    const r = await products.saveProductAction(null, { name: "", slug: "Slug Ruim", priceCents: -5 });
    expect(r.ok).toBe(false);
    expect(r.ok ? {} : r.fieldErrors).toHaveProperty("slug");
    expect(writes()).toEqual([]);
  });

  it("ids inválidos são recusados", async () => {
    expect((await products.saveProductAction("../../etc", {})).ok).toBe(false);
    expect((await products.changeStatusAction("1 or 1=1", "published")).ok).toBe(false);
    expect((await products.changeStatusAction(PRODUCT, "deleted")).ok).toBe(false);
    expect(writes()).toEqual([]);
  });

  it("upload com conteúdo não permitido não chega ao Storage", async () => {
    const fd = new FormData();
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    fd.set("file", new File([svg], "foto.png", { type: "image/png" }));
    fd.set("altText", "texto alternativo");
    const r = await media.uploadMediaAction(PRODUCT, fd);
    expect(r.ok).toBe(false);
    expect(calls).not.toContain("storage.upload");
  });

  it("upload exige texto alternativo", async () => {
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array(10)], "a.png"));
    fd.set("altText", "");
    const r = await media.uploadMediaAction(PRODUCT, fd);
    expect(r.ok).toBe(false);
    expect(calls).not.toContain("storage.upload");
  });
});

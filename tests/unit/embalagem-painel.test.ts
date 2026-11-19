import { beforeEach, describe, expect, it, vi } from "vitest";

/** Painel → produto → "Embalagem para o frete" (lib/admin/actions/packaging.ts). */

const state = {
  updates: [] as { table: string; values: Record<string, unknown>; filters: [string, unknown][] }[],
  result: { data: [{ id: "x" }], error: null } as { data: unknown[] | null; error: { code?: string; message?: string } | null },
};

vi.mock("@/lib/auth/staff", () => ({
  AuthorizationError: class extends Error {},
  requireStaffAction: vi.fn(async () => ({ role: "editor", areas: [] })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    from: (table: string) => {
      const entry = { table, values: {} as Record<string, unknown>, filters: [] as [string, unknown][] };
      const b = {
        update(values: Record<string, unknown>) {
          entry.values = values;
          state.updates.push(entry);
          return b;
        },
        eq(col: string, v: unknown) {
          entry.filters.push([col, v]);
          return b;
        },
        select: async () => state.result,
      };
      return b;
    },
  }),
}));

const { saveProductPackagingAction } = await import("@/lib/admin/actions/packaging");

const PRODUCT = "11111111-1111-4111-8111-111111111111";
const VARIANT = "33333333-3333-4333-8333-333333333333";
const box = { weightKg: 32.5, lengthCm: 200, widthCm: 40, heightCm: 30 };

beforeEach(() => {
  state.updates = [];
  state.result = { data: [{ id: "x" }], error: null };
});

describe("salvar as caixas da embalagem", () => {
  it("grava as caixas do produto e as da variação (vazio = usa as do produto)", async () => {
    const r = await saveProductPackagingAction(PRODUCT, {
      product: [box, box],
      variants: [
        { id: VARIANT, boxes: [{ ...box, lengthCm: 158 }] },
        { id: "44444444-4444-4444-8444-444444444444", boxes: [] },
      ],
    });
    expect(r).toEqual({ ok: true });
    expect(state.updates[0]).toEqual({ table: "products", values: { shipping_packages: [box, box] }, filters: [["id", PRODUCT]] });
    expect(state.updates[1].values).toEqual({ shipping_packages: [{ ...box, lengthCm: 158 }] });
    expect(state.updates[1].filters).toEqual([["id", VARIANT], ["product_id", PRODUCT]]);
    expect(state.updates[2].values).toEqual({ shipping_packages: null });
  });

  it("medida vazia, zero ou acima do limite volta no campo certo e não grava", async () => {
    const r = await saveProductPackagingAction(PRODUCT, { product: [{ ...box, heightCm: Number.NaN }, { ...box, weightKg: 0 }], variants: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors ?? {})).toEqual(["product.0.heightCm", "product.1.weightKg"]);
    expect(state.updates).toHaveLength(0);
  });

  it("sem a migração aplicada, explica o que falta em vez de mostrar erro técnico", async () => {
    state.result = { data: null, error: { code: "PGRST204", message: "Could not find the 'shipping_packages' column of 'products'" } };
    const r = await saveProductPackagingAction(PRODUCT, { product: [box], variants: [] });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/migração 20261119000300/) });
  });

  it("produto publicado editado por editor (o RLS não devolve linha): recusa", async () => {
    state.result = { data: [], error: null };
    const r = await saveProductPackagingAction(PRODUCT, { product: [box], variants: [] });
    expect(r.ok).toBe(false);
  });

  it("id inválido nem chega ao banco", async () => {
    expect((await saveProductPackagingAction("x", { product: [], variants: [] })).ok).toBe(false);
    expect(state.updates).toHaveLength(0);
  });
});

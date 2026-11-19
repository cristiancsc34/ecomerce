import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutInput } from "@/lib/validation/checkout";

/**
 * Checkout do site (lib/orders/checkout-actions.ts). As Server Actions são endpoints públicos: aqui conferimos
 * a validação (fieldErrors com as chaves do contrato), o limite por IP, que só ids e quantidades vão para o banco
 * e que erros do banco viram mensagens claras, sem detalhes internos.
 */

const state = {
  ip: "203.0.113.1",
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  rpcResult: { data: { code: "PED-1001", token: "8f0e2b5c-1d3a-4c5e-9f7a-0b1c2d3e4f5a" }, error: null } as {
    data: unknown;
    error: { code?: string; message?: string } | null;
  },
};

vi.mock("server-only", () => ({}));
// Avisos automáticos rodam em segundo plano (after); aqui só não podem atrapalhar o pedido.
vi.mock("@/lib/notifications/order-dispatch", () => ({ kickOrderNotifications: vi.fn() }));
// Transportadora: a confirmação no servidor é testada em tests/unit/frete-transportadoras.test.ts; aqui, só o uso.
const carrierState = {
  calls: [] as unknown[],
  result: { ok: true, quoteId: "44444444-4444-4444-8444-444444444444", priceCents: 19990 } as
    | { ok: true; quoteId: string; priceCents: number }
    | { ok: false; error: string },
};
vi.mock("@/lib/shipping/carrier", () => ({
  carrierOptionsFor: vi.fn(async () => []),
  confirmCarrierQuote: vi.fn(async (input: unknown) => {
    carrierState.calls.push(input);
    return carrierState.result;
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `${state.ip}, 10.0.0.1` }),
}));
vi.mock("@/lib/supabase/public", () => ({
  createPublicSupabaseClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return state.rpcResult;
    },
  }),
}));

const { placeOrderAction, lookupCepPublicAction } = await import("@/lib/orders/checkout-actions");

const PRODUCT = "11111111-1111-4111-8111-111111111111";

const input = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
  customerName: "Maria da Silva",
  customerPhone: "(11) 98765-4321",
  customerEmail: "",
  whatsappOptIn: true,
  deliveryMethod: "entrega_propria",
  address: {
    cep: "01310-100",
    rua: "Avenida Paulista",
    numero: "1000",
    complemento: "",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "sp",
    referencia: "",
  },
  shippingOptionId: null,
  paymentMethod: "pix",
  deliveryNotes: "",
  acceptTerms: true,
  items: [{ productId: PRODUCT, variantId: null, quantity: 1 }],
  ...over,
});

let ipSeq = 0;
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemplo.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "chave-publica");
  vi.stubEnv("CATALOG_SOURCE", "");
  state.ip = `203.0.113.${++ipSeq}`;
  state.rpcCalls = [];
  state.rpcResult = { data: { code: "PED-1001", token: "8f0e2b5c-1d3a-4c5e-9f7a-0b1c2d3e4f5a" }, error: null };
  carrierState.calls = [];
  carrierState.result = { ok: true, quoteId: "44444444-4444-4444-8444-444444444444", priceCents: 19990 };
});

describe("placeOrderAction", () => {
  it("devolve código e link secreto; para o banco vão só ids e quantidades", async () => {
    const tampered = input({
      items: [{ productId: PRODUCT, variantId: null, quantity: 2, unitPriceCents: 1, totalCents: 1 } as never],
    });
    const r = await placeOrderAction({ ...tampered, totalCents: 1, status: "pago" } as never);
    expect(r).toEqual({ ok: true, data: { code: "PED-1001", token: "8f0e2b5c-1d3a-4c5e-9f7a-0b1c2d3e4f5a" } });
    expect(state.rpcCalls).toHaveLength(1);
    const payload = state.rpcCalls[0].args.p_data as Record<string, unknown>;
    expect(state.rpcCalls[0].fn).toBe("place_site_order");
    expect(payload.items).toEqual([{ productId: PRODUCT, variantId: null, quantity: 2 }]);
    expect(payload).not.toHaveProperty("totalCents");
    expect(payload).not.toHaveProperty("status");
    expect(payload.customerPhone).toBe("5511987654321");
    expect(payload.paymentMethod).toBe("pix");
    expect(payload.shippingOptionId).toBeNull();
  });

  it("manda a forma de entrega escolhida (nunca o valor) e a tira na retirada", async () => {
    const option = "22222222-2222-4222-8222-222222222222";
    await placeOrderAction({ ...input({ shippingOptionId: option, paymentMethod: "boleto" }), shippingCents: 1 } as never);
    const payload = state.rpcCalls[0].args.p_data as Record<string, unknown>;
    expect(payload.shippingOptionId).toBe(option);
    expect(payload.paymentMethod).toBe("boleto");
    expect(payload).not.toHaveProperty("shippingCents");

    state.rpcCalls = [];
    await placeOrderAction(input({ deliveryMethod: "retirada", shippingOptionId: option }));
    expect((state.rpcCalls[0].args.p_data as Record<string, unknown>).shippingOptionId).toBeNull();
  });

  it("transportadora: o servidor confirma a cotação e manda só o id dela ao banco (nunca o valor)", async () => {
    await placeOrderAction({ ...input({ carrierServiceId: 3, carrierExpectedCents: 19990 }), shippingCents: 1 } as never);
    expect(carrierState.calls).toEqual([
      { cep: "01310100", lines: [{ productId: PRODUCT, variantId: null, quantity: 1 }], serviceId: 3, expectedCents: 19990 },
    ]);
    const payload = state.rpcCalls[0].args.p_data as Record<string, unknown>;
    expect(payload.carrierQuoteId).toBe("44444444-4444-4444-8444-444444444444");
    expect(payload).not.toHaveProperty("carrierExpectedCents");
    expect(payload).not.toHaveProperty("shippingCents");
  });

  it("transportadora com valor mudado ou indisponível: não chega ao banco", async () => {
    carrierState.result = { ok: false, error: "O frete da Jadlog mudou para R$ 210,00. Confira e envie o pedido de novo." };
    const r = await placeOrderAction(input({ carrierServiceId: 3, carrierExpectedCents: 19990 }));
    expect(r).toMatchObject({ ok: false, fieldErrors: { shippingOptionId: expect.stringMatching(/mudou/) } });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("transportadora na retirada é ignorada; forma da loja e transportadora juntas são recusadas", async () => {
    await placeOrderAction(input({ deliveryMethod: "retirada", carrierServiceId: 3 }));
    expect(carrierState.calls).toHaveLength(0);
    expect((state.rpcCalls[0].args.p_data as Record<string, unknown>).carrierQuoteId).toBeUndefined();
    const r = await placeOrderAction(input({ shippingOptionId: "22222222-2222-4222-8222-222222222222", carrierServiceId: 3 }));
    expect(r.ok).toBe(false);
  });

  it("exige a forma de pagamento", async () => {
    const r = await placeOrderAction(input({ paymentMethod: "dinheiro" as never }));
    expect(r.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("erros de validação voltam por campo, com as chaves do contrato", async () => {
    const r = await placeOrderAction(
      input({ customerPhone: "123", address: { ...input().address, cep: "0131" }, items: [] }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toMatchObject({
      customerPhone: expect.any(String),
      "address.cep": expect.any(String),
      items: expect.any(String),
    });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("quantidade fora de 1 a 10 ou soma acima de 10 é recusada antes do banco", async () => {
    for (const quantity of [0, -1, 11, 1.5]) {
      const r = await placeOrderAction(input({ items: [{ productId: PRODUCT, variantId: null, quantity }] }));
      expect(r.ok).toBe(false);
    }
    const r = await placeOrderAction(
      input({
        items: [
          { productId: PRODUCT, variantId: null, quantity: 6 },
          { productId: PRODUCT, variantId: null, quantity: 5 },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("sem Supabase ou com o catálogo de demonstração, a compra pelo site fica desligada", async () => {
    vi.stubEnv("CATALOG_SOURCE", "demo");
    expect(await placeOrderAction(input())).toEqual({
      ok: false,
      error: "A compra pelo site ainda não está ativa. Fale com o atendimento.",
    });
    vi.stubEnv("CATALOG_SOURCE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect((await placeOrderAction(input())).ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("até 5 pedidos a cada 10 minutos por IP", async () => {
    for (let i = 0; i < 5; i++) expect((await placeOrderAction(input())).ok).toBe(true);
    const r = await placeOrderAction(input());
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Muitos pedidos seguidos/) });
    expect(state.rpcCalls).toHaveLength(5);
  });

  it("mensagem do banco em português passa; erro interno não vaza", async () => {
    state.rpcResult = { data: null, error: { code: "22023", message: "Produto esgotado: “Poltrona”. Remova da sacola para continuar." } };
    expect(await placeOrderAction(input())).toEqual({
      ok: false,
      error: "Produto esgotado: “Poltrona”. Remova da sacola para continuar.",
    });
    state.rpcResult = { data: null, error: { code: "42P01", message: 'relation "public.orders" does not exist' } };
    const r = await placeOrderAction(input());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toMatch(/relation|public\./);
  });

  it("resposta estranha do banco não vira link", async () => {
    state.rpcResult = { data: { code: "<script>", token: "x" }, error: null };
    expect((await placeOrderAction(input())).ok).toBe(false);
  });
});

describe("lookupCepPublicAction", () => {
  it("CEP inválido nem consulta", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await lookupCepPublicAction("123")).toEqual({ ok: false, error: "CEP com 8 números." });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("consulta só com os números do CEP", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ logradouro: "Praça da Sé", bairro: "Sé", localidade: "São Paulo", uf: "SP" })),
    );
    const r = await lookupCepPublicAction("01001-000/../x");
    expect(fetchSpy.mock.calls[0][0]).toBe("https://viacep.com.br/ws/01001000/json/");
    expect(r).toEqual({ ok: true, data: { rua: "Praça da Sé", bairro: "Sé", cidade: "São Paulo", uf: "SP" } });
    fetchSpy.mockRestore();
  });
});

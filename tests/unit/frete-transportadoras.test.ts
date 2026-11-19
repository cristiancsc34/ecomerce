import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Frete por transportadora (Melhor Envio): lib/shipping/melhor-envio.ts, lib/shipping/carrier.ts e lib/shipping/packages.ts.
 * Nenhuma chamada real: as respostas da API são simuladas no formato da documentação oficial
 * (https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos).
 */

const PRODUCT = "11111111-1111-4111-8111-111111111111";
const PRODUCT_2 = "22222222-2222-4222-8222-222222222222";
const VARIANT = "33333333-3333-4333-8333-333333333333";
const box = { weightKg: 32.5, lengthCm: 200.4, widthCm: 40, heightCm: 30 };

const db = {
  products: [] as Record<string, unknown>[],
  variants: [] as Record<string, unknown>[],
  productsError: null as { message: string } | null,
  quotesTableError: null as { message: string } | null,
  inserted: [] as Record<string, unknown>[],
  insertError: null as { message: string } | null,
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/public", () => ({
  createPublicSupabaseClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => {
          if (table === "products") return { data: db.productsError ? null : db.products.filter((p) => ids.includes(String(p.id))), error: db.productsError };
          return { data: db.variants.filter((v) => ids.includes(String(v.id))), error: null };
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () =>
    process.env.SUPABASE_SERVICE_ROLE_KEY
      ? {
          from: () => ({
            select: () => ({ limit: async () => ({ data: null, error: db.quotesTableError }) }),
            insert: (row: Record<string, unknown>) => ({
              select: () => ({
                single: async () => {
                  if (db.insertError) return { data: null, error: db.insertError };
                  db.inserted.push(row);
                  return { data: { id: "44444444-4444-4444-8444-444444444444" }, error: null };
                },
              }),
            }),
          }),
        }
      : null,
}));

const me = await import("@/lib/shipping/melhor-envio");
const carrier = await import("@/lib/shipping/carrier");
const packages = await import("@/lib/shipping/packages");

const ENV = {
  MELHOR_ENVIO_TOKEN: "token-de-teste",
  MELHOR_ENVIO_CONTATO: "tecnico@exemplo.com.br",
  FRETE_CEP_ORIGEM: "88010-000",
  SUPABASE_SERVICE_ROLE_KEY: "chave-de-servico",
};

/** Resposta no formato documentado: um serviço com custom_price, um com erro e um sem preço. */
const API_RESPONSE = [
  {
    id: 3,
    name: ".Package",
    price: "210.50",
    custom_price: "199.90",
    discount: "10.60",
    currency: "R$",
    delivery_time: 7,
    delivery_range: { min: 5, max: 7 },
    custom_delivery_time: 8,
    custom_delivery_range: { min: 6, max: 8 },
    company: { id: 2, name: "Jadlog", picture: "" },
  },
  { id: 1, name: "PAC", error: "Dimensões do objeto ultrapassam o limite da transportadora.", company: { id: 1, name: "Correios" } },
  { id: 17, name: "Expresso", company: { id: 9, name: "Outra" } },
  { id: 31, name: "Rodoviário", price: "150.00", delivery_time: 10, company: { id: 12, name: "Transportadora X" } },
];

function fakeFetch(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemplo.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "chave-publica");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-de-servico");
  db.products = [{ id: PRODUCT, price_cents: 199990, shipping_packages: [box, box] }];
  db.variants = [];
  db.productsError = null;
  db.quotesTableError = null;
  db.inserted = [];
  db.insertError = null;
  carrier.resetCarrierCapabilityCache();
});

describe("configuração (desligada até o dono configurar)", () => {
  it("sem nada configurado, fica desligada e diz o que falta", () => {
    const s = me.melhorEnvioStatus({});
    expect(s.enabled).toBe(false);
    if (!s.enabled) {
      expect(s.missing.join(" ")).toMatch(/MELHOR_ENVIO_TOKEN/);
      expect(s.missing.join(" ")).toMatch(/FRETE_CEP_ORIGEM/);
      expect(s.missing.join(" ")).toMatch(/MELHOR_ENVIO_CONTATO/);
    }
  });

  it("com tudo, liga em produção por padrão; sandbox só quando pedido", () => {
    const s = me.melhorEnvioStatus(ENV);
    expect(s.enabled && s.config.baseUrl).toBe("https://melhorenvio.com.br");
    expect(s.enabled && s.config.cepOrigem).toBe("88010000");
    const sb = me.melhorEnvioStatus({ ...ENV, MELHOR_ENVIO_AMBIENTE: "sandbox", MELHOR_ENVIO_SERVICOS: "3, 31, x" });
    expect(sb.enabled && sb.config.baseUrl).toBe("https://sandbox.melhorenvio.com.br");
    expect(sb.enabled && sb.config.servicos).toEqual([3, 31]);
    expect(me.melhorEnvioStatus({ ...ENV, MELHOR_ENVIO_AMBIENTE: "teste" }).enabled).toBe(false);
  });

  it("lê a validade do token (campo exp) sem quebrar com token qualquer", () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1_800_000_000 })).toString("base64url");
    expect(me.tokenExpiresAt(`h.${payload}.s`)?.toISOString()).toBe(new Date(1_800_000_000_000).toISOString());
    expect(me.tokenExpiresAt("token-de-teste")).toBeNull();
    expect(me.tokenExpiresAt("a.@@@.b")).toBeNull();
  });

  it("nenhuma variável do frete é pública (NEXT_PUBLIC_)", () => {
    const s = me.melhorEnvioStatus({ ...ENV, MELHOR_ENVIO_TOKEN: undefined, NEXT_PUBLIC_MELHOR_ENVIO_TOKEN: "x" });
    expect(s.enabled).toBe(false);
  });
});

describe("caixas da embalagem", () => {
  it("aceita só caixas completas e positivas", () => {
    expect(packages.parseBoxes([box])).toEqual([box]);
    expect(packages.parseBoxes([{ ...box, heightCm: 0 }])).toEqual([]);
    expect(packages.parseBoxes([{ weightKg: 1 }])).toEqual([]);
    expect(packages.parseBoxes("x")).toEqual([]);
  });

  it("a variação com caixas próprias vale no lugar das do produto", () => {
    const own = { ...box, lengthCm: 158 };
    expect(packages.boxesFor([box], [own])).toEqual([own]);
    expect(packages.boxesFor([box], null)).toEqual([box]);
    expect(packages.boxesFor([box], [])).toEqual([box]);
  });

  it("divide o seguro entre as caixas sem perder centavos", () => {
    expect(packages.splitCents(100001, 3)).toEqual([33333, 33333, 33335]);
    expect(packages.splitCents(500, 1)).toEqual([500]);
  });
});

describe("pedido de cotação para a API", () => {
  it("cada caixa vira um produto, com cm inteiros (para cima), kg e seguro pelo preço do catálogo", () => {
    const body = me.buildMelhorEnvioRequest("88010000", "01310100", [
      { key: "p1", quantity: 2, unitPriceCents: 199990, boxes: [box, { ...box, weightKg: 10 }] },
    ]);
    expect(body.from).toEqual({ postal_code: "88010000" });
    expect(body.to).toEqual({ postal_code: "01310100" });
    expect(body.products).toEqual([
      { id: "p1#1", width: 40, height: 30, length: 201, weight: 32.5, insurance_value: 999.95, quantity: 2 },
      { id: "p1#2", width: 40, height: 30, length: 201, weight: 10, insurance_value: 999.95, quantity: 2 },
    ]);
  });

  it("chama o endpoint documentado com os cabeçalhos exigidos", async () => {
    const s = me.melhorEnvioStatus(ENV);
    if (!s.enabled) throw new Error("config");
    const f = fakeFetch(API_RESPONSE);
    await me.quoteMelhorEnvio(s.config, "01310100", [{ key: "p1", quantity: 1, unitPriceCents: 1000, boxes: [box] }], f);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://melhorenvio.com.br/api/v2/me/shipment/calculate");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-de-teste");
    expect(headers.Accept).toBe("application/json");
    expect(headers["User-Agent"]).toContain("tecnico@exemplo.com.br");
  });
});

describe("leitura da resposta", () => {
  it("usa custom_price e custom_delivery_range; descarta serviço com erro ou sem preço; ordena pelo valor", () => {
    expect(me.parseMelhorEnvioResponse(API_RESPONSE)).toEqual([
      { serviceId: 31, service: "Rodoviário", company: "Transportadora X", priceCents: 15000, daysMin: null, daysMax: 10 },
      { serviceId: 3, service: ".Package", company: "Jadlog", priceCents: 19990, daysMin: 6, daysMax: 8 },
    ]);
  });

  it("filtra pelos serviços escolhidos pelo dono", () => {
    expect(me.parseMelhorEnvioResponse(API_RESPONSE, [3]).map((q) => q.serviceId)).toEqual([3]);
  });

  it("resposta estranha não vira valor inventado", () => {
    expect(me.parseMelhorEnvioResponse({ message: "Unauthenticated." })).toEqual([]);
    expect(me.parseMelhorEnvioResponse([{ id: 5, name: "X", price: "-1", company: { name: "Y" } }])).toEqual([]);
    expect(me.parseMelhorEnvioResponse([{ id: 5, name: "X", price: "abc", company: { name: "Y" } }])).toEqual([]);
  });

  it("token inválido, erro da API ou rede fora = sem cotação", async () => {
    const s = me.melhorEnvioStatus(ENV);
    if (!s.enabled) throw new Error("config");
    const items = [{ key: "p1", quantity: 1, unitPriceCents: 1000, boxes: [box] }];
    expect(await me.quoteMelhorEnvio(s.config, "01310100", items, fakeFetch({ message: "Unauthenticated." }, 401))).toEqual({ ok: false, reason: "http-401" });
    const broken = vi.fn(async () => {
      throw new Error("rede");
    });
    expect(await me.quoteMelhorEnvio(s.config, "01310100", items, broken)).toEqual({ ok: false, reason: "rede" });
    expect(await me.quoteMelhorEnvio(s.config, "01310100", [{ ...items[0], boxes: [] }], fakeFetch(API_RESPONSE))).toEqual({ ok: false, reason: "sem-embalagem" });
  });
});

describe("cotação na sacola e no checkout", () => {
  const lines = [{ productId: PRODUCT, variantId: null, quantity: 1 }];

  it("desligada (sem token): nenhuma chamada e nenhuma opção", async () => {
    const f = fakeFetch(API_RESPONSE);
    expect(await carrier.carrierOptionsFor("01310-100", lines, { env: {}, fetchImpl: f })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("ligada: as transportadoras viram formas de entrega do tipo transportadora", async () => {
    const options = await carrier.carrierOptionsFor("01310-100", lines, { env: ENV, fetchImpl: fakeFetch(API_RESPONSE) });
    expect(options.map((o) => [o.id, o.name, o.method, o.priceCents])).toEqual([
      ["melhor_envio:31", "Transportadora X Rodoviário", "transportadora", 15000],
      ["melhor_envio:3", "Jadlog .Package", "transportadora", 19990],
    ]);
    expect(options[1].carrier).toEqual({ provider: "melhor_envio", serviceId: 3, company: "Jadlog", service: ".Package" });
  });

  it("produto sem caixas cadastradas: não cota (a combinar)", async () => {
    db.products.push({ id: PRODUCT_2, price_cents: 50000, shipping_packages: [] });
    const f = fakeFetch(API_RESPONSE);
    const r = await carrier.carrierOptionsFor("01310100", [...lines, { productId: PRODUCT_2, variantId: null, quantity: 1 }], { env: ENV, fetchImpl: f });
    expect(r).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("produto fora da venda (o RLS não devolve) ou sem preço: não cota", async () => {
    const f = fakeFetch(API_RESPONSE);
    expect(await carrier.carrierOptionsFor("01310100", [{ productId: PRODUCT_2, variantId: null, quantity: 1 }], { env: ENV, fetchImpl: f })).toEqual([]);
    db.products = [{ id: PRODUCT, price_cents: null, shipping_packages: [box] }];
    expect(await carrier.carrierOptionsFor("01310100", lines, { env: ENV, fetchImpl: f })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("variação: usa o preço e as caixas dela", async () => {
    db.variants = [{ id: VARIANT, product_id: PRODUCT, price_cents: 300000, shipping_packages: [{ ...box, lengthCm: 158 }] }];
    const f = fakeFetch(API_RESPONSE);
    await carrier.carrierOptionsFor("01310100", [{ productId: PRODUCT, variantId: VARIANT, quantity: 1 }], { env: ENV, fetchImpl: f });
    const sent = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(sent.products).toEqual([{ id: `${PRODUCT}:${VARIANT}`, width: 40, height: 30, length: 158, weight: 32.5, insurance_value: 3000, quantity: 1 }]);
  });

  it("sem a migração aplicada (coluna ou tabela não existe): não cota e não quebra", async () => {
    db.quotesTableError = { message: 'relation "shipping_carrier_quotes" does not exist' };
    const f = fakeFetch(API_RESPONSE);
    expect(await carrier.carrierOptionsFor("01310100", lines, { env: ENV, fetchImpl: f })).toEqual([]);
    carrier.resetCarrierCapabilityCache();
    db.quotesTableError = null;
    db.productsError = { message: "column products.shipping_packages does not exist" };
    expect(await carrier.carrierOptionsFor("01310100", lines, { env: ENV, fetchImpl: f })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("confirmação no servidor ao fechar o pedido", () => {
  const lines = [{ productId: PRODUCT, variantId: null, quantity: 1 }];

  it("cota de novo e grava a cotação com o valor da API (não o do navegador)", async () => {
    const r = await carrier.confirmCarrierQuote({ cep: "01310-100", lines, serviceId: 3, expectedCents: 19990 }, { env: ENV, fetchImpl: fakeFetch(API_RESPONSE) });
    expect(r).toEqual({ ok: true, quoteId: "44444444-4444-4444-8444-444444444444", priceCents: 19990 });
    expect(db.inserted[0]).toMatchObject({ provider: "melhor_envio", service_id: 3, company_name: "Jadlog", cep: "01310100", price_cents: 19990, days_min: 6, days_max: 8 });
  });

  it("valor mudou: avisa o cliente com o valor novo e não grava", async () => {
    const r = await carrier.confirmCarrierQuote({ cep: "01310100", lines, serviceId: 3, expectedCents: 100 }, { env: ENV, fetchImpl: fakeFetch(API_RESPONSE) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mudou para R\$\s?199,90/);
    expect(db.inserted).toHaveLength(0);
  });

  it("serviço não atende mais, integração desligada ou falha ao gravar: recusa com mensagem clara", async () => {
    const gone = await carrier.confirmCarrierQuote({ cep: "01310100", lines, serviceId: 1, expectedCents: null }, { env: ENV, fetchImpl: fakeFetch(API_RESPONSE) });
    expect(!gone.ok && gone.error).toMatch(/não atende mais/);
    const off = await carrier.confirmCarrierQuote({ cep: "01310100", lines, serviceId: 3, expectedCents: null }, { env: {}, fetchImpl: fakeFetch(API_RESPONSE) });
    expect(!off.ok && off.error).toMatch(/não está disponível/);
    db.insertError = { message: "falhou" };
    const fail = await carrier.confirmCarrierQuote({ cep: "01310100", lines, serviceId: 3, expectedCents: null }, { env: ENV, fetchImpl: fakeFetch(API_RESPONSE) });
    expect(!fail.ok && fail.error).toMatch(/não está disponível/);
  });
});

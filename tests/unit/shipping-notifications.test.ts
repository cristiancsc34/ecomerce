import { describe, expect, it, vi } from "vitest";
import { formatCepRanges, parseCepRanges } from "@/lib/shipping/ranges";
import { shippingEta, shippingPriceLabel } from "@/lib/shipping/types";
import { renderStatusNotification, type OrderForMessage } from "@/lib/notifications/order-dispatch";
import { configuredProviders, providerStatus, resendProvider, whatsappCloudProvider } from "@/lib/notifications/providers";
import { shippingOptionSchema } from "@/lib/validation/shipping";

vi.mock("next/server", () => ({ after: vi.fn() }));

describe("faixas de CEP", () => {
  it("entende faixa, CEP único e começo do CEP; avisa linha inválida", () => {
    const { ranges, errors } = parseCepRanges("88000-000 a 88139-999\n88015200\n88\n\nabc\n88200-000 a 88100-000");
    expect(ranges).toEqual([
      { from: "88000000", to: "88139999" },
      { from: "88015200", to: "88015200" },
      { from: "88000000", to: "88999999" },
    ]);
    expect(errors).toEqual([
      expect.stringMatching(/^Linha 5:/),
      expect.stringMatching(/^Linha 6: o primeiro CEP precisa ser menor/),
    ]);
  });

  it("volta ao texto do formulário", () => {
    expect(formatCepRanges(parseCepRanges("88000-000 a 88139-999\n88015-200\n880").ranges)).toBe("88000-000 a 88139-999\n88015-200\n880");
  });
});

describe("prazo de entrega", () => {
  it("só promete o que o dono informou", () => {
    expect(shippingEta({ daysMin: null, daysMax: null })).toBeNull();
    expect(shippingEta({ daysMin: 2, daysMax: 5 })).toBe("de 2 a 5 dias úteis");
    expect(shippingEta({ daysMin: null, daysMax: 1 })).toBe("em até 1 dia útil");
    expect(shippingEta({ daysMin: 3, daysMax: 3 })).toBe("em até 3 dias úteis");
    expect(shippingEta({ daysMin: 0, daysMax: 0 })).toBe("no mesmo dia útil");
  });

  it("valor: a combinar, grátis, retirada sem custo", () => {
    const fmt = (c: number) => `R$ ${c / 100}`;
    expect(shippingPriceLabel({ method: "entrega_propria", priceCents: null }, fmt)).toBe("A combinar");
    expect(shippingPriceLabel({ method: "entrega_propria", priceCents: 0 }, fmt)).toBe("Grátis");
    expect(shippingPriceLabel({ method: "retirada", priceCents: null }, fmt)).toBe("Sem custo");
    expect(shippingPriceLabel({ method: "transportadora", priceCents: 9900 }, fmt)).toBe("R$ 99");
  });
});

describe("forma de entrega (painel)", () => {
  const input = { name: "Entrega em Floripa", method: "entrega_propria", cepRanges: "88000-000 a 88139-999", price: "99,90", daysMin: "2", daysMax: "5", details: "", active: true } as const;

  it("valor vazio = a combinar; prazo opcional; retirada sem CEP e sem custo", () => {
    expect(shippingOptionSchema.parse(input)).toMatchObject({ price_cents: 9990, days_min: 2, days_max: 5, cep_ranges: [{ from: "88000000", to: "88139999" }] });
    expect(shippingOptionSchema.parse({ ...input, price: "", daysMin: "", daysMax: "" })).toMatchObject({ price_cents: null, days_min: null, days_max: null });
    expect(shippingOptionSchema.parse({ ...input, method: "retirada", cepRanges: "" })).toMatchObject({ price_cents: 0, cep_ranges: [] });
  });

  it("recusa entrega sem CEP, prazo invertido e valor inválido", () => {
    const r = shippingOptionSchema.safeParse({ ...input, cepRanges: "", daysMin: "5", daysMax: "2", price: "abc" });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["cepRanges", "daysMax", "price"]));
  });
});

const order: OrderForMessage = {
  id: "6f1c2d3e-0000-4000-8000-000000000010",
  code: "PED-1042",
  public_token: "11111111-2222-4333-8444-555555555555",
  source: "site",
  customer_name: "Maria da Silva",
  delivery_method: "entrega_propria",
  total_cents: 139890,
  carrier: null,
  tracking_code: null,
  tracking_url: null,
  scheduled_date: null,
  scheduled_window: null,
  items: [{ name: "Poltrona Azul", variant_name: null, quantity: 1, sort_order: 0 }],
};
const opts = { site: "https://loja.exemplo", brandName: "Cuxões", dedupeKey: "etapa:1:email", publicNote: "Vamos confirmar o pagamento pelo WhatsApp." };

describe("avisos automáticos: mensagens", () => {
  it("e-mail da etapa: assunto, texto do pedido, recado da etapa e link de acompanhamento", () => {
    const m = renderStatusNotification("email", "maria@exemplo.com", "recebido", order, opts);
    expect(m.email?.subject).toBe("Pedido PED-1042: Pedido recebido — Cuxões");
    expect(m.text).toContain("Olá, Maria!");
    expect(m.text).toContain("Vamos confirmar o pagamento pelo WhatsApp.");
    expect(m.text).toContain("https://loja.exemplo/pedido/PED-1042?t=11111111-2222-4333-8444-555555555555");
    expect(m.email?.html).toContain('<a href="https://loja.exemplo/pedido/PED-1042?t=11111111-2222-4333-8444-555555555555"');
    expect(m.idempotencyKey).toBe("etapa:1:email");
  });

  it("WhatsApp usa o modelo da etapa com nome, pedido e link", () => {
    const m = renderStatusNotification("whatsapp", "5548999990000", "enviado", order, opts);
    expect(m.template).toEqual({
      name: "pedido_enviado",
      language: "pt_BR",
      params: ["Maria", "PED-1042", "https://loja.exemplo/pedido/PED-1042?t=11111111-2222-4333-8444-555555555555"],
    });
  });

  it("escapa HTML vindo do pedido", () => {
    const m = renderStatusNotification("email", "x@y.z", "pago", { ...order, customer_name: "<img src=x onerror=alert(1)>" }, opts);
    expect(m.email?.html).not.toContain("<img");
  });
});

describe("avisos automáticos: provedores", () => {
  it("sem chaves, nenhum provedor (o painel não deixa ligar)", () => {
    expect(providerStatus({})).toEqual({ email: false, whatsapp: false });
    expect(configuredProviders({})).toEqual([]);
    expect(providerStatus({ RESEND_API_KEY: "re_x", EMAIL_FROM: "Loja <a@b.c>", WHATSAPP_TOKEN: "t" })).toEqual({ email: true, whatsapp: false });
  });

  it("Resend: chamada com chave no cabeçalho e chave de idempotência", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "em_123" }), { status: 200 }));
    const provider = resendProvider("re_teste", "Cuxões <pedidos@loja.exemplo>", fetchMock as unknown as typeof fetch);
    const message = renderStatusNotification("email", "maria@exemplo.com", "pago", order, opts);
    await expect(provider.send(message)).resolves.toEqual({ providerMessageId: "em_123" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_teste", "Idempotency-Key": "etapa:1:email" });
    expect(JSON.parse(String(init.body))).toMatchObject({ from: "Cuxões <pedidos@loja.exemplo>", to: ["maria@exemplo.com"], subject: message.email?.subject });
  });

  it("WhatsApp: modelo aprovado com os 3 campos; erro do provedor vira nova tentativa (lança)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }));
    const provider = whatsappCloudProvider("token", "123456", "v23.0", fetchMock as unknown as typeof fetch);
    await expect(provider.send(renderStatusNotification("whatsapp", "5548999990000", "pago", order, opts))).resolves.toEqual({
      providerMessageId: "wamid.1",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/123456/messages");
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: "whatsapp",
      to: "5548999990000",
      type: "template",
      template: {
        name: "pedido_pago",
        language: { code: "pt_BR" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Maria" }, { type: "text", text: "PED-1042" }, { type: "text", text: expect.stringContaining("/pedido/PED-1042?t=") }] }],
      },
    });
    const failing = whatsappCloudProvider("token", "123456", "v23.0", (async () => new Response("template not approved", { status: 400 })) as unknown as typeof fetch);
    await expect(failing.send(renderStatusNotification("whatsapp", "5548999990000", "pago", order, opts))).rejects.toThrow(/WhatsApp respondeu 400/);
  });
});

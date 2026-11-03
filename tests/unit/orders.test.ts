import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { orderMessage, trackingLink, whatsappMessageLink, type OrderMessageInput } from "@/lib/orders/messages";
import { formatAddress, formatPhone, NEXT_STATUSES, normalizePhone, ORDER_STATUSES, staffActions } from "@/lib/orders/status";
import { orderInputSchema, orderStatusInputSchema, orderToRpc } from "@/lib/validation/order";

const base: OrderMessageInput = {
  brandName: "Loja",
  code: "PED-1001",
  customerName: "Maria da Silva",
  status: "recebido",
  deliveryMethod: "entrega_propria",
  trackingLink: "https://loja.com/pedido/PED-1001?t=abc",
  items: [{ name: "Poltrona Azul", variantName: null, quantity: 1 }],
  totalCents: 129990,
  carrier: null,
  trackingCode: null,
  trackingUrl: null,
  scheduledDate: null,
  scheduledWindow: null,
};

describe("etapas do pedido", () => {
  it("a ordem das etapas no painel é a mesma do banco", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20261103000100_orders.sql", import.meta.url), "utf8");
    const block = sql.slice(sql.indexOf("private.order_transition_allowed"), sql.indexOf("$$;", sql.indexOf("private.order_transition_allowed")));
    for (const from of ORDER_STATUSES) {
      const match = block.match(new RegExp(`when '${from}' then p_to in \\(([^)]*)\\)`));
      const allowed = match ? [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort() : [];
      expect(allowed, from).toEqual([...NEXT_STATUSES[from]].sort());
    }
  });

  it("cada botão de próximo passo é uma mudança permitida", () => {
    for (const status of ORDER_STATUSES) {
      for (const method of ["entrega_propria", "transportadora", "retirada"] as const) {
        for (const action of staffActions(status, method)) expect(NEXT_STATUSES[status]).toContain(action.to);
      }
    }
  });

  it("retirada na loja vai de “em preparação” direto para “cliente retirou”", () => {
    expect(staffActions("em_preparacao", "retirada")[0]).toMatchObject({ to: "entregue", label: "Cliente retirou" });
    expect(staffActions("em_preparacao", "transportadora")[0]).toMatchObject({ to: "enviado" });
  });
});

describe("mensagens de WhatsApp", () => {
  it("pedido recebido: itens, total e link de acompanhamento", () => {
    const text = orderMessage(base);
    expect(text).toContain("Olá, Maria!");
    expect(text).toContain("1× Poltrona Azul");
    expect(text).toMatch(/Total: R\$\s1\.299,90/);
    expect(text).toContain("Acompanhe o pedido: https://loja.com/pedido/PED-1001?t=abc");
  });

  it("entrega própria: só cita a data que a equipe agendou; sem data, não promete prazo", () => {
    const agendada = orderMessage({ ...base, status: "enviado", scheduledDate: "2026-11-10", scheduledWindow: "Manhã (8h às 12h)" });
    expect(agendada).toContain("agendada para terça-feira, 10/11, Manhã (8h às 12h)");
    const semData = orderMessage({ ...base, status: "enviado" });
    expect(semData).toContain("está a caminho");
    expect(semData).not.toMatch(/dias? úte|prazo/i);
  });

  it("transportadora: rastreio só com link https", () => {
    const ok = orderMessage({ ...base, status: "enviado", deliveryMethod: "transportadora", carrier: "Braspress", trackingCode: "X1", trackingUrl: "https://rastreio/1" });
    expect(ok).toContain("pela Braspress");
    expect(ok).toContain("Código de rastreio: X1");
    expect(ok).toContain("Rastreio: https://rastreio/1");
    const inseguro = orderMessage({ ...base, status: "enviado", deliveryMethod: "transportadora", trackingUrl: "http://rastreio/1" });
    expect(inseguro).not.toContain("http://rastreio/1");
  });

  it("recado da equipe entra na mensagem", () => {
    expect(orderMessage({ ...base, status: "pago", publicNote: "Obrigado pela compra!" })).toContain("Obrigado pela compra!");
  });

  it("links do WhatsApp e de acompanhamento", () => {
    expect(whatsappMessageLink("5511987654321", "Olá & tudo")).toBe("https://wa.me/5511987654321?text=Ol%C3%A1%20%26%20tudo");
    expect(trackingLink("https://loja.com", "PED-1001", "tok")).toBe("https://loja.com/pedido/PED-1001?t=tok");
  });
});

describe("dados do cliente", () => {
  it("celular do Brasil ganha o 55; formata para leitura", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("5511987654321");
    expect(normalizePhone("+55 11 98765-4321")).toBe("5511987654321");
    expect(normalizePhone("")).toBeNull();
    expect(formatPhone("5511987654321")).toBe("(11) 98765-4321");
    expect(formatPhone("551133334444")).toBe("(11) 3333-4444");
  });

  it("endereço em linhas, sem campos vazios", () => {
    expect(formatAddress({ rua: "Rua A", numero: "10", bairro: "Centro", cidade: "Santos", uf: "SP", cep: "11010000" })).toBe(
      "Rua A, 10\nCentro\nSantos/SP · CEP 11010-000",
    );
  });
});

describe("validação do pedido", () => {
  const valid = {
    customerName: "Maria",
    customerPhone: "(11) 98765-4321",
    customerEmail: "",
    whatsappOptIn: true,
    address: { cep: "01310-100", rua: "Av. Paulista", numero: "1000", complemento: "", bairro: "Bela Vista", cidade: "São Paulo", uf: "sp", referencia: "" },
    deliveryMethod: "entrega_propria" as const,
    deliveryNotes: "",
    assembly: false,
    shippingCents: null,
    discountCents: 0,
    paymentMethod: null,
    internalNotes: "",
    items: [{ productId: null, variantId: null, name: "Poltrona", variantName: null, unitPriceCents: 1000, quantity: 1 }],
  };

  it("aceita um pedido completo e normaliza celular, CEP e UF", () => {
    const parsed = orderInputSchema.parse(valid);
    expect(parsed.customerPhone).toBe("5511987654321");
    expect(parsed.address).toMatchObject({ cep: "01310100", uf: "SP" });
    expect(orderToRpc(parsed).address).not.toHaveProperty("complemento");
  });

  it("entrega exige endereço; retirada não, e o frete vira zero", () => {
    const semEndereco = orderInputSchema.safeParse({ ...valid, address: { ...valid.address, numero: "", cep: "" } });
    expect(semEndereco.success).toBe(false);
    const paths = semEndereco.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["address.cep", "address.numero"]));
    const retirada = orderInputSchema.parse({ ...valid, deliveryMethod: "retirada", address: { ...valid.address, cep: "", rua: "" } });
    expect(orderToRpc(retirada)).toMatchObject({ address: {}, shippingCents: 0 });
  });

  it("pedido sem itens e celular sem DDD são recusados", () => {
    expect(orderInputSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...valid, customerPhone: "98765-4321" }).success).toBe(false);
  });

  it("aviso pelo WhatsApp só vale com celular", () => {
    expect(orderToRpc(orderInputSchema.parse({ ...valid, customerPhone: "" })).whatsappOptIn).toBe(false);
  });

  it("link de rastreio só https", () => {
    expect(orderStatusInputSchema.safeParse({ status: "enviado", publicNote: "", internalNote: "", delivery: { trackingUrl: "http://x" } }).success).toBe(false);
    expect(orderStatusInputSchema.safeParse({ status: "enviado", publicNote: "", internalNote: "", delivery: { trackingUrl: "https://x.com/1" } }).success).toBe(true);
  });
});

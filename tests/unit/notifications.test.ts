import { describe, expect, it } from "vitest";
import { dispatchClaimed, MAX_ATTEMPTS, planOrderNotifications } from "@/lib/notifications/outbox";
import { configuredProviders, testProvider } from "@/lib/notifications/providers";
import { renderOrderMessages } from "@/lib/notifications/templates";
import type { NotificationProvider, OrderForNotification } from "@/lib/notifications/types";

const order = (patch: Partial<OrderForNotification> = {}, customer: Partial<OrderForNotification["customer"]> = {}): OrderForNotification => ({
  id: "6f1c2d3e-0000-4000-8000-000000000001",
  code: "CX-1042",
  customer: { name: "Maria Souza", email: "maria@exemplo.com", whatsapp: "+55 (48) 99999-0000", whatsappOptIn: true, ...customer },
  items: [{ name: "Poltrona Azul Estrutura Clara", quantity: 1, unitPriceCents: 129990 }],
  totalCents: 129990,
  shippingCents: null,
  trackingUrl: null,
  ...patch,
});

describe("avisos de pedido: mensagens", () => {
  it("pedido confirmado: e-mail e WhatsApp (com consentimento), em português, só com dados do pedido", () => {
    const [email, whatsapp] = renderOrderMessages("pedido_confirmado", order());
    expect(email.channel).toBe("email");
    expect(email.to).toBe("maria@exemplo.com");
    expect(email.email?.subject).toBe("Pedido CX-1042 confirmado — Cuxões");
    expect(email.text).toContain("Olá, Maria!");
    expect(email.text).toContain("Pagamento confirmado! Recebemos o seu pedido CX-1042.");
    expect(email.text).toMatch(/1× Poltrona Azul Estrutura Clara — R\$\s1\.299,90/);
    expect(email.text).not.toMatch(/frete|prazo|entrega em/i);
    expect(whatsapp.channel).toBe("whatsapp");
    expect(whatsapp.to).toBe("5548999990000");
    expect(whatsapp.template).toEqual({ name: "pedido_confirmado", language: "pt_BR", params: ["Maria", "CX-1042", "R$ 1.299,90"] });
  });

  it("sem consentimento ou sem número válido, não manda WhatsApp; sem e-mail válido, não manda e-mail", () => {
    expect(renderOrderMessages("pedido_confirmado", order({}, { whatsappOptIn: false })).map((m) => m.channel)).toEqual(["email"]);
    expect(renderOrderMessages("pedido_confirmado", order({}, { whatsapp: "123" })).map((m) => m.channel)).toEqual(["email"]);
    expect(renderOrderMessages("pedido_confirmado", order({}, { email: "sem-arroba" })).map((m) => m.channel)).toEqual(["whatsapp"]);
  });

  it("frete só aparece quando informado; rastreio só no envio e só com https", () => {
    expect(renderOrderMessages("pedido_confirmado", order({ shippingCents: 4990 }))[0].text).toMatch(/Frete: R\$\s49,90/);
    const sent = renderOrderMessages("pedido_enviado", order({ trackingUrl: "https://rastreio.exemplo/CX-1042" }))[0];
    expect(sent.text).toContain("Acompanhe a entrega: https://rastreio.exemplo/CX-1042");
    expect(sent.email?.html).toContain('href="https://rastreio.exemplo/CX-1042"');
    const unsafe = renderOrderMessages("pedido_enviado", order({ trackingUrl: "javascript:alert(1)" }))[0];
    expect(unsafe.email?.html).not.toContain("javascript:");
  });

  it("escapa HTML vindo do pedido", () => {
    const html = renderOrderMessages("pedido_confirmado", order({}, { name: "<script>x</script>" }))[0].email!.html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });
});

describe("avisos de pedido: fila e envio", () => {
  it("chave de idempotência por evento, pedido e canal (webhook repetido não duplica)", () => {
    const rows = planOrderNotifications("pedido_confirmado", order());
    expect(rows.map((r) => r.dedupe_key)).toEqual([
      "pedido_confirmado:6f1c2d3e-0000-4000-8000-000000000001:email",
      "pedido_confirmado:6f1c2d3e-0000-4000-8000-000000000001:whatsapp",
    ]);
    expect(planOrderNotifications("pedido_confirmado", order())).toEqual(rows);
  });

  const now = new Date("2026-10-29T12:00:00.000Z");
  const rowsFor = (attempts: number) =>
    planOrderNotifications("pedido_confirmado", order()).map((r, i) => ({ id: `id-${i}`, channel: r.channel, attempts, payload: r.payload }));

  it("envia pelos provedores e marca como enviado", async () => {
    const email = testProvider("email");
    const whatsapp = testProvider("whatsapp");
    const updates = await dispatchClaimed(rowsFor(1), [email, whatsapp], now);
    expect(updates.map((u) => u.status)).toEqual(["sent", "sent"]);
    expect(email.sent).toHaveLength(1);
    expect(whatsapp.sent[0].template?.name).toBe("pedido_confirmado");
  });

  it("erro do provedor: nova tentativa com espera crescente; depois do limite, falha", async () => {
    const failing: NotificationProvider = { channel: "email", name: "quebrado", send: async () => Promise.reject(new Error("timeout")) };
    const first = await dispatchClaimed(rowsFor(1).slice(0, 1), [failing], now);
    expect(first[0]).toEqual({ id: "id-0", status: "pending", next_attempt_at: "2026-10-29T12:01:00.000Z", last_error: "timeout" });
    const third = await dispatchClaimed(rowsFor(3).slice(0, 1), [failing], now);
    expect(third[0]).toMatchObject({ status: "pending", next_attempt_at: "2026-10-29T12:30:00.000Z" });
    const last = await dispatchClaimed(rowsFor(MAX_ATTEMPTS).slice(0, 1), [failing], now);
    expect(last[0]).toEqual({ id: "id-0", status: "failed", last_error: "timeout" });
  });

  it("sem provedor configurado para o canal, não finge que enviou", async () => {
    expect(configuredProviders()).toEqual([]);
    const updates = await dispatchClaimed(rowsFor(1), [testProvider("email")], now);
    expect(updates[1]).toEqual({ id: "id-1", status: "failed", last_error: "sem provedor configurado para whatsapp" });
  });
});

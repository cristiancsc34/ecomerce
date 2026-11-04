import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase } from "./helpers";

/** Integração com o Trama (supabase/migrations/20261104000100_integracao_trama.sql). */

let db: PGlite;

const order = (over: Record<string, unknown> = {}) => ({
  customerName: "Helena Dias",
  customerPhone: "5548999990000",
  whatsappOptIn: true,
  address: { cep: "88058000", rua: "Rua das Gaivotas", numero: "300", bairro: "Ingleses", cidade: "Florianópolis", uf: "SC" },
  deliveryMethod: "entrega_propria",
  shippingCents: 0,
  items: [{ name: "Poltrona Azul", unitPriceCents: 129990, quantity: 1 }],
  ...over,
});

async function createOrder(data: Record<string, unknown> = order()) {
  return as(db, "editor", async (tx) => (await tx.query<{ id: string }>("select public.create_order($1) as id", [JSON.stringify(data)])).rows[0].id);
}

const setStatus = (id: string, status: string, delivery: Record<string, unknown> = {}) =>
  as(db, "editor", (tx) => tx.query("select public.set_order_status($1, $2, null, null, $3)", [id, status, JSON.stringify(delivery)]));

/** O servidor (chave de serviço). */
async function asService<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return fn(tx);
  });
}

const integration = async (id: string) =>
  (await db.query<Record<string, unknown>>("select * from public.order_integration where order_id = $1", [id])).rows[0];

const orderRow = async (id: string) =>
  (await db.query<{ status: string; paid_at: string | null; scheduled_date: string | null; scheduled_window: string | null }>(
    "select status, paid_at, scheduled_date::text, scheduled_window from public.orders where id = $1",
    [id],
  )).rows[0];

const events = async (id: string) =>
  (await db.query<{ status: string; public_note: string | null; internal_note: string | null }>(
    "select status, public_note, internal_note from public.order_events where order_id = $1 order by created_at, id",
    [id],
  )).rows;

const apply = (id: string, steps: unknown[], erp: Record<string, unknown> = {}) =>
  asService(async (tx) =>
    (await tx.query<{ s: string }>("select public.trama_apply($1, $2, $3) as s", [id, JSON.stringify(steps), JSON.stringify(erp)])).rows[0].s,
  );

beforeAll(async () => {
  db = await createDatabase({ seed: false });
});

describe("fila do Trama", () => {
  it("pedido só recebido não vai para a fábrica; confirmado (pago ou preparar) entra uma vez", async () => {
    const a = await createOrder();
    expect(await integration(a)).toBeUndefined();
    await setStatus(a, "pago");
    expect(await integration(a)).toMatchObject({ status: "pendente", attempts: 0 });
    await setStatus(a, "em_preparacao");
    expect((await db.query("select 1 from public.order_integration where order_id = $1", [a])).rows).toHaveLength(1);

    const b = await createOrder();
    await setStatus(b, "em_preparacao");
    expect(await integration(b)).toMatchObject({ status: "pendente" });

    const c = await createOrder(order({ status: "pago" }));
    expect(await integration(c)).toMatchObject({ status: "pendente" });
  });

  it("cancelado antes de ir: não envia mais; depois de ir: pede o cancelamento no Trama", async () => {
    const a = await createOrder();
    await setStatus(a, "pago");
    await setStatus(a, "cancelado");
    expect(await integration(a)).toMatchObject({ status: "ignorado", cancel_status: null });

    const b = await createOrder();
    await setStatus(b, "pago");
    await db.query("update public.order_integration set status = 'enviado', attempts = 3 where order_id = $1", [b]);
    await setStatus(b, "cancelado");
    expect(await integration(b)).toMatchObject({ status: "enviado", cancel_status: "pendente", attempts: 0 });
  });

  it("claim pega envios e cancelamentos vencidos, um de cada vez, e só para o servidor", async () => {
    await db.query("update public.order_integration set next_attempt_at = now() + interval '1 hour'");
    const a = await createOrder();
    await setStatus(a, "pago");
    const claimed = await asService(async (tx) => (await tx.query<{ order_id: string; status: string; attempts: number }>("select * from public.claim_order_integrations(10)")).rows);
    expect(claimed).toEqual([expect.objectContaining({ order_id: a, status: "enviando", attempts: 1 })]);
    const again = await asService(async (tx) => (await tx.query("select * from public.claim_order_integrations(10)")).rows);
    expect(again).toEqual([]);
    await expect(as(db, "editor", (tx) => tx.query("select * from public.claim_order_integrations(10)"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", (tx) => tx.query("select * from public.order_integration"))).rejects.toThrow(/permission denied/);
  });

  it("a equipe lê a situação e pede reenvio; pedido só recebido não pode ir", async () => {
    const a = await createOrder();
    await setStatus(a, "pago");
    await db.query("update public.order_integration set status = 'erro', attempts = 6, last_error = 'SKU inexistente' where order_id = $1", [a]);
    const seen = await as(db, "editor", (tx) => tx.query("select status, last_error from public.order_integration where order_id = $1", [a]));
    expect(seen.rows).toEqual([{ status: "erro", last_error: "SKU inexistente" }]);
    await as(db, "editor", (tx) => tx.query("select public.requeue_order_integration($1)", [a]));
    expect(await integration(a)).toMatchObject({ status: "pendente", attempts: 0, last_error: null });

    const b = await createOrder();
    await expect(as(db, "editor", (tx) => tx.query("select public.requeue_order_integration($1)", [b]))).rejects.toThrow(/pagamento confirmado/);
    await expect(as(db, "outsider", (tx) => tx.query("select public.requeue_order_integration($1)", [a]))).rejects.toThrow(/Sem permissão/);
    await expect(as(db, "editor", (tx) => tx.query("update public.order_integration set status = 'enviado'"))).rejects.toThrow(/permission denied/);
  });
});

describe("etapas que voltam do Trama", () => {
  it("produção → pronto → agendado → saiu → entregue, com recados e a data combinada", async () => {
    const a = await createOrder();
    await setStatus(a, "pago");
    await apply(a, [{ status: "em_preparacao", note: "Seu pedido entrou em produção na fábrica." }], { number: 2088, status: "em_producao" });
    expect((await orderRow(a)).status).toBe("em_preparacao");
    expect(await integration(a)).toMatchObject({ erp_number: 2088, erp_status: "em_producao" });

    // Mesma etapa na loja: só o recado novo entra na linha do tempo (e não repete).
    await apply(a, [{ status: "em_preparacao", note: "Seu pedido está pronto. Vamos combinar a data da entrega com você." }], { status: "pronto_para_envio" });
    await apply(a, [{ status: "em_preparacao", note: "Seu pedido está pronto. Vamos combinar a data da entrega com você." }], { status: "pronto_para_envio" });

    await apply(a, [{ status: "enviado", note: "Entrega agendada.", delivery: { scheduledDate: "2026-11-12", scheduledWindow: "tarde" } }], { status: "agendado" });
    expect(await orderRow(a)).toMatchObject({ status: "enviado", scheduled_date: "2026-11-12", scheduled_window: "tarde" });
    // Remarcação: mesma etapa, data nova.
    await apply(a, [{ status: "enviado", note: "Entrega agendada.", delivery: { scheduledDate: "2026-11-14", scheduledWindow: "manhã" } }], { status: "agendado" });
    expect(await orderRow(a)).toMatchObject({ status: "enviado", scheduled_date: "2026-11-14", scheduled_window: "manhã" });

    await apply(a, [{ status: "saiu_para_entrega" }], { status: "em_rota" });
    const final = await apply(a, [{ status: "entregue", note: "Pedido entregue." }], { status: "entregue", financialStatus: "pago" });
    expect(final).toBe("entregue");
    const row = await orderRow(a);
    expect(row.status).toBe("entregue");
    expect(row.paid_at).not.toBeNull();
    expect((await events(a)).map((e) => [e.status, e.public_note])).toEqual([
      ["recebido", null],
      ["pago", null],
      ["em_preparacao", "Seu pedido entrou em produção na fábrica."],
      ["em_preparacao", "Seu pedido está pronto. Vamos combinar a data da entrega com você."],
      ["enviado", "Entrega agendada."],
      ["enviado", "Entrega agendada."],
      ["saiu_para_entrega", null],
      ["entregue", "Pedido entregue."],
    ]);
    expect((await events(a)).slice(2).every((e) => e.internal_note?.includes("Trama"))).toBe(true);
  });

  it("etapa fora da ordem da loja é pulada; cancelado pelo Trama não pede cancelamento de volta", async () => {
    const a = await createOrder();
    await setStatus(a, "pago");
    await db.query("update public.order_integration set status = 'enviado' where order_id = $1", [a]);
    expect(await apply(a, [{ status: "devolvido" }], { status: "devolvido" })).toBe("pago");
    expect(await apply(a, [{ status: "cancelado", note: "Pedido cancelado." }], { status: "cancelado" })).toBe("cancelado");
    expect(await integration(a)).toMatchObject({ status: "enviado", cancel_status: "feito", erp_status: "cancelado" });
  });

  it("só o servidor aplica etapas", async () => {
    const a = await createOrder();
    await expect(as(db, "editor", (tx) => tx.query("select public.trama_apply($1, '[]'::jsonb, '{}'::jsonb)", [a]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", (tx) => tx.query("select public.trama_apply($1, '[]'::jsonb, '{}'::jsonb)", [a]))).rejects.toThrow(/permission denied/);
  });

  it("recibos de webhook: a mesma entrega não entra duas vezes", async () => {
    await asService((tx) => tx.query("insert into public.trama_webhook_receipts (delivery_id, event, order_code) values ('n1', 'pedido.status_alterado', 'PED-1')"));
    await expect(
      asService((tx) => tx.query("insert into public.trama_webhook_receipts (delivery_id, event) values ('n1', 'pedido.status_alterado')")),
    ).rejects.toThrow(/duplicate key/);
    await expect(as(db, "editor", (tx) => tx.query("select * from public.trama_webhook_receipts"))).rejects.toThrow(/permission denied/);
  });
});

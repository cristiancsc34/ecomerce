import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase } from "./helpers";

/** Frete por região e avisos automáticos (supabase/migrations/20261103000300_shipping_notifications.sql). */

let db: PGlite;

const order = (over: Record<string, unknown> = {}) => ({
  customerName: "Maria da Silva",
  customerPhone: "5548999990000",
  customerEmail: "maria@exemplo.com",
  whatsappOptIn: true,
  address: { cep: "88015200", rua: "Rua A", numero: "1", bairro: "Centro", cidade: "Florianópolis", uf: "SC" },
  deliveryMethod: "entrega_propria",
  shippingCents: 9900,
  items: [{ name: "Poltrona Azul", unitPriceCents: 129990, quantity: 1 }],
  ...over,
});

async function createOrder(tx: Transaction, data: Record<string, unknown> = order()) {
  const { rows } = await tx.query<{ id: string }>("select public.create_order($1) as id", [JSON.stringify(data)]);
  return rows[0].id;
}

const outbox = async (orderId: string) =>
  (
    await db.query<{ event: string; channel: string; recipient: string }>(
      "select event, channel, recipient from public.notification_outbox where order_ref = $1 order by created_at, channel",
      [orderId],
    )
  ).rows;

beforeAll(async () => {
  db = await createDatabase({ seed: false });
  const insert = (sql: string, params: unknown[]) => db.query(sql, params);
  await insert(
    `insert into public.shipping_options (name, method, cep_ranges, price_cents, days_min, days_max)
     values ('Entrega na Grande Florianópolis', 'entrega_propria', $1, 9900, 2, 5)`,
    [JSON.stringify([{ from: "88000000", to: "88139999" }])],
  );
  await insert(`insert into public.shipping_options (name, method, cep_ranges, price_cents) values ('Resto de SC', 'entrega_propria', $1, null)`, [
    JSON.stringify([{ from: "88140000", to: "89999999" }]),
  ]);
  await insert(`insert into public.shipping_options (name, method, details) values ('Retirada na loja', 'retirada', 'Rua X, 10')`, []);
  await insert(`insert into public.shipping_options (name, method, cep_ranges, price_cents, active) values ('Desativada', 'entrega_propria', $1, 0, false)`, [
    JSON.stringify([{ from: "88000000", to: "88999999" }]),
  ]);
});

describe("frete por região", () => {
  it("formas por CEP: a região certa + retirada; valor vazio fica 'a combinar'; desativada não aparece", async () => {
    const forCep = async (cep: string) =>
      (await as(db, "anon", (tx) => tx.query<{ o: { name: string; priceCents: number | null; daysMax: number | null }[] }>("select public.shipping_options_for($1) as o", [cep])))
        .rows[0].o;
    expect((await forCep("88015-200")).map((o) => [o.name, o.priceCents, o.daysMax])).toEqual([
      ["Entrega na Grande Florianópolis", 9900, 5],
      ["Retirada na loja", null, null],
    ]);
    expect((await forCep("89010000")).map((o) => [o.name, o.priceCents])).toEqual([
      ["Resto de SC", null],
      ["Retirada na loja", null],
    ]);
    expect((await forCep("01310100")).map((o) => o.name)).toEqual(["Retirada na loja"]);
    expect((await forCep("")).map((o) => o.name)).toEqual(["Retirada na loja"]);
  });

  it("o público só usa a função; só administradores mudam as formas de entrega", async () => {
    await expect(as(db, "anon", (tx) => tx.query("select * from public.shipping_options"))).rejects.toThrow(/permission denied/);
    const editorRead = await as(db, "editor", (tx) => tx.query("select name from public.shipping_options"));
    expect(editorRead.rows.length).toBe(4);
    await expect(
      as(db, "editor", (tx) => tx.query("insert into public.shipping_options (name, method) values ('Retirada X', 'retirada')")),
    ).rejects.toThrow(/row-level security/);
    const update = await as(db, "editor", (tx) => tx.query("update public.shipping_options set price_cents = 1 returning id"));
    expect(update.rows).toEqual([]);
    await as(db, "admin", (tx) => tx.query("insert into public.shipping_options (name, method, active) values ('Retirada admin', 'retirada', false)"));
  });

  it("faixas de CEP inválidas e entrega sem faixa são recusadas", async () => {
    await expect(
      db.query("insert into public.shipping_options (name, method, cep_ranges) values ('Faixa invertida', 'entrega_propria', $1)", [
        JSON.stringify([{ from: "99999999", to: "00000000" }]),
      ]),
    ).rejects.toThrow(/shipping_options_ranges_valid/);
    await expect(db.query("insert into public.shipping_options (name, method) values ('Sem faixa', 'entrega_propria')")).rejects.toThrow(
      /shipping_options_needs_ranges/,
    );
  });

  it("a chave de serviço (scripts) também cadastra formas de entrega", async () => {
    await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      await tx.query("insert into public.shipping_options (name, method, cep_ranges, active) values ('Por script', 'entrega_propria', $1, false)", [
        JSON.stringify([{ from: "90000000", to: "90999999" }]),
      ]);
    });
  });
});

describe("avisos automáticos", () => {
  it("desligados (padrão): nenhuma etapa entra na fila", async () => {
    const id = await as(db, "editor", (tx) => createOrder(tx));
    expect(await outbox(id)).toEqual([]);
  });

  it("só administradores ligam os avisos", async () => {
    const r = await as(db, "editor", (tx) => tx.query("update public.notification_settings set notify_email = true returning id"));
    expect(r.rows).toEqual([]);
    await as(db, "admin", (tx) => tx.query("update public.notification_settings set notify_email = true, notify_whatsapp = true"));
  });

  it("ligados: cada etapa entra na fila por e-mail e, com aceite, WhatsApp; sem aceite, só e-mail", async () => {
    const withOptIn = await as(db, "editor", (tx) => createOrder(tx));
    const without = await as(db, "editor", (tx) => createOrder(tx, order({ whatsappOptIn: false })));
    await as(db, "admin", (tx) => tx.query("select public.set_order_status($1, 'pago')", [withOptIn]));
    expect(await outbox(withOptIn)).toEqual([
      { event: "pedido_recebido", channel: "email", recipient: "maria@exemplo.com" },
      { event: "pedido_recebido", channel: "whatsapp", recipient: "5548999990000" },
      { event: "pedido_pago", channel: "email", recipient: "maria@exemplo.com" },
      { event: "pedido_pago", channel: "whatsapp", recipient: "5548999990000" },
    ]);
    expect((await outbox(without)).map((r) => r.channel)).toEqual(["email"]);
  });

  it("sem e-mail no pedido, não há aviso por e-mail", async () => {
    const id = await as(db, "editor", (tx) => createOrder(tx, order({ customerEmail: "" })));
    expect((await outbox(id)).map((r) => r.channel)).toEqual(["whatsapp"]);
  });

  it("a equipe vê o que foi avisado; visitantes e clientes não", async () => {
    const id = await as(db, "editor", (tx) => createOrder(tx));
    const staff = await as(db, "editor", (tx) => tx.query("select * from public.order_notifications($1)", [id]));
    expect(staff.rows.length).toBe(2);
    const outsider = await as(db, "outsider", (tx) => tx.query("select * from public.order_notifications($1)", [id]));
    expect(outsider.rows).toEqual([]);
    await expect(as(db, "anon", (tx) => tx.query("select * from public.order_notifications($1)", [id]))).rejects.toThrow(/permission denied/);
  });
});

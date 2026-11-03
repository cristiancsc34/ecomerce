import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase } from "./helpers";

let db: PGlite;

const items = (over: Record<string, unknown> = {}) => [
  { name: "Poltrona Azul", unitPriceCents: 129990, quantity: 1, ...over },
  { name: "Almofada", unitPriceCents: 5000, quantity: 2 },
];

const order = (over: Record<string, unknown> = {}) => ({
  customerName: "Maria da Silva",
  customerPhone: "5511987654321",
  address: { cep: "01310100", rua: "Avenida Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" },
  deliveryMethod: "entrega_propria",
  deliveryNotes: "3º andar, sem elevador",
  shippingCents: 15000,
  internalNotes: "Cliente prefere manhã",
  items: items(),
  ...over,
});

async function create(tx: Transaction, data: Record<string, unknown> = order()) {
  const { rows } = await tx.query<{ id: string }>("select public.create_order($1) as id", [JSON.stringify(data)]);
  return rows[0].id;
}

const setStatus = (tx: Transaction, id: string, status: string, delivery: Record<string, unknown> = {}, note: string | null = null) =>
  tx.query("select public.set_order_status($1, $2::public.order_status, $3, $4, $5)", [id, status, note, "nota interna", JSON.stringify(delivery)]);

beforeAll(async () => {
  db = await createDatabase({ seed: false });
});

describe("pedidos: acesso", () => {
  it("visitante e cliente logado não leem nem criam pedidos", async () => {
    await expect(as(db, "anon", (tx) => tx.query("select * from public.orders"))).rejects.toThrow(/permission denied/);
    const { rows } = await as(db, "outsider", (tx) => tx.query("select * from public.orders"));
    expect(rows).toEqual([]);
    await expect(as(db, "outsider", (tx) => create(tx))).rejects.toThrow(/row-level security/);
  });

  it("editor registra o pedido: número sequencial, totais calculados no banco e primeira etapa", async () => {
    const result = await as(db, "editor", async (tx) => {
      const id = await create(tx);
      const { rows } = await tx.query<{ code: string; status: string; subtotal_cents: number; total_cents: number }>(
        "select code, status, subtotal_cents, total_cents from public.orders where id = $1",
        [id],
      );
      const events = await tx.query<{ status: string }>("select status from public.order_events where order_id = $1", [id]);
      return { ...rows[0], events: events.rows.map((e) => e.status) };
    });
    expect(result.code).toMatch(/^PED-\d{4,}$/);
    expect(result).toMatchObject({ status: "recebido", subtotal_cents: 139990, total_cents: 154990, events: ["recebido"] });
  });

  it("desconto maior que o pedido e pedido sem itens são recusados", async () => {
    await expect(as(db, "editor", (tx) => create(tx, order({ discountCents: 999999 })))).rejects.toThrow(/desconto/);
    await expect(as(db, "editor", (tx) => create(tx, order({ items: [] })))).rejects.toThrow(/pelo menos um item/);
  });

  it("link de rastreio só https", async () => {
    await expect(
      as(db, "editor", async (tx) => {
        const id = await create(tx);
        await setStatus(tx, id, "pago");
        await setStatus(tx, id, "em_preparacao");
        await setStatus(tx, id, "enviado", { carrier: "Transportadora", trackingUrl: "http://rastreio.exemplo/123" });
      }),
    ).rejects.toThrow(/orders_tracking_url/);
  });
});

describe("pedidos: etapas", () => {
  it("segue a ordem e grava a entrega e a linha do tempo", async () => {
    const result = await as(db, "editor", async (tx) => {
      const id = await create(tx);
      await setStatus(tx, id, "pago");
      await setStatus(tx, id, "em_preparacao");
      await setStatus(tx, id, "enviado", { scheduledDate: "2026-11-10", scheduledWindow: "Manhã (8h às 12h)" }, "Entrega agendada");
      await setStatus(tx, id, "saiu_para_entrega");
      await setStatus(tx, id, "entregue");
      const { rows } = await tx.query<{ status: string; paid_at: string | null; scheduled_window: string }>(
        "select status, paid_at, scheduled_window from public.orders where id = $1",
        [id],
      );
      const events = await tx.query<{ status: string }>("select status from public.order_events where order_id = $1 order by created_at, id", [id]);
      return { ...rows[0], events: events.rows.length };
    });
    expect(result).toMatchObject({ status: "entregue", scheduled_window: "Manhã (8h às 12h)", events: 6 });
    expect(result.paid_at).not.toBeNull();
  });

  it("não pula etapas nem volta de um pedido cancelado", async () => {
    await expect(
      as(db, "editor", async (tx) => {
        const id = await create(tx);
        await setStatus(tx, id, "entregue");
      }),
    ).rejects.toThrow(/Não dá para passar de "recebido" para "entregue"/);
    await expect(
      as(db, "editor", async (tx) => {
        const id = await create(tx);
        await setStatus(tx, id, "cancelado");
        await setStatus(tx, id, "pago");
      }),
    ).rejects.toThrow(/cancelado/);
  });

  it("itens não mudam depois do envio", async () => {
    await expect(
      as(db, "editor", async (tx) => {
        const id = await create(tx);
        await setStatus(tx, id, "pago");
        await setStatus(tx, id, "em_preparacao");
        await setStatus(tx, id, "enviado");
        await tx.query("select public.update_order($1, $2)", [id, JSON.stringify(order({ items: items({ quantity: 3 }) }))]);
      }),
    ).rejects.toThrow(/antes do envio/);
  });

  it("a linha do tempo não se edita nem se apaga", async () => {
    await expect(
      as(db, "admin", async (tx) => {
        const id = await create(tx);
        await tx.query("update public.order_events set public_note = 'x' where order_id = $1", [id]);
      }),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, "admin", (tx) => tx.query("delete from public.order_events"))).rejects.toThrow(/permission denied/);
  });
});

describe("pedidos: acompanhamento pelo cliente", () => {
  it("com o link secreto vê as etapas e os itens, sem notas internas nem endereço completo", async () => {
    const { code, token } = await as(db, "editor", async (tx) => {
      const id = await create(tx);
      await setStatus(tx, id, "pago", {}, "Pagamento recebido. Obrigado!");
      const { rows } = await tx.query<{ code: string; public_token: string }>("select code, public_token from public.orders where id = $1", [id]);
      return { code: rows[0].code, token: rows[0].public_token };
    });
    const { rows } = await as(db, "anon", (tx) => tx.query<{ t: Record<string, unknown> }>("select public.order_tracking($1, $2) as t", [code.toLowerCase(), token]));
    const tracking = rows[0].t;
    expect(tracking).toMatchObject({ code, status: "pago", customerFirstName: "Maria", place: { bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" } });
    expect(tracking.items).toHaveLength(2);
    expect(tracking.events).toEqual([
      expect.objectContaining({ status: "recebido" }),
      expect.objectContaining({ status: "pago", note: "Pagamento recebido. Obrigado!" }),
    ]);
    const text = JSON.stringify(tracking);
    expect(text).not.toContain("nota interna");
    expect(text).not.toContain("Cliente prefere manhã");
    expect(text).not.toContain("Paulista");
    expect(text).not.toContain("987654321");
  });

  it("link errado não mostra nada", async () => {
    const code = await as(db, "editor", async (tx) => {
      const id = await create(tx);
      const { rows } = await tx.query<{ code: string }>("select code from public.orders where id = $1", [id]);
      return rows[0].code;
    });
    const { rows } = await as(db, "anon", (tx) =>
      tx.query<{ t: unknown }>("select public.order_tracking($1, $2) as t", [code, "00000000-0000-4000-8000-000000000000"]),
    );
    expect(rows[0].t).toBeNull();
  });

  it("número do pedido + celular (com ou sem 55 e máscara) devolve o link; outro celular, não", async () => {
    const { code, token } = await as(db, "editor", async (tx) => {
      const id = await create(tx);
      const { rows } = await tx.query<{ code: string; public_token: string }>("select code, public_token from public.orders where id = $1", [id]);
      return { code: rows[0].code, token: rows[0].public_token };
    });
    const lookup = (phone: string) =>
      as(db, "anon", (tx) => tx.query<{ t: string | null }>("select public.order_tracking_token($1, $2) as t", [code, phone])).then((r) => r.rows[0].t);
    expect(await lookup("(11) 98765-4321")).toBe(token);
    expect(await lookup("+55 11 98765-4321")).toBe(token);
    expect(await lookup("(11) 91111-2222")).toBeNull();
    expect(await lookup("4321")).toBeNull();
  });
});

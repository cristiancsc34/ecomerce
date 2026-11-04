import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, productPayload } from "./helpers";

/** Áreas do painel (supabase/migrations/20261104000200_areas_do_painel.sql): cada senha abre só a sua parte. */

let db: PGlite;

const AREA = {
  itens: "00000000-0000-4000-8000-0000000a1001",
  pedidos: "00000000-0000-4000-8000-0000000a1002",
  entrega: "00000000-0000-4000-8000-0000000a1003",
} as const;
type Area = keyof typeof AREA;

async function asArea<T>(area: Area, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: AREA[area], role: "authenticated" })]);
    return fn(tx);
  });
}

const order = {
  customerName: "Helena Dias",
  customerPhone: "5548999990000",
  address: { cep: "88058000", rua: "Rua A", numero: "1", bairro: "Ingleses", cidade: "Florianópolis", uf: "SC" },
  deliveryMethod: "entrega_propria",
  items: [{ name: "Poltrona Azul", unitPriceCents: 129990, quantity: 1 }],
};
const createOrder = (tx: Transaction) => tx.query<{ id: string }>("select public.create_order($1) as id", [JSON.stringify(order)]);
const saveProduct = (tx: Transaction) =>
  tx.query<{ id: string }>("select public.save_product(null, $1) as id", [JSON.stringify(productPayload())]);

let orderId: string;

beforeAll(async () => {
  db = await createDatabase({ seed: false });
  for (const [area, id] of Object.entries(AREA)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `painel+${area}@teste`]);
    await db.query("insert into public.admin_users (user_id, role, areas) values ($1, 'editor', $2)", [id, [area]]);
  }
  orderId = (await as(db, "admin", createOrder)).rows[0]!.id;
});

describe("área de pedidos", () => {
  it("só ela (e o administrador, e as contas antigas sem área) vê e mexe nos pedidos", async () => {
    expect((await asArea("pedidos", (tx) => tx.query("select id from public.orders"))).rows).toHaveLength(1);
    expect((await asArea("pedidos", createOrder)).rows[0]!.id).toBeTruthy();
    expect((await as(db, "admin", (tx) => tx.query("select id from public.orders"))).rows).toHaveLength(2);
    expect((await as(db, "editor", (tx) => tx.query("select id from public.orders"))).rows).toHaveLength(2);

    for (const area of ["itens", "entrega"] as const) {
      expect((await asArea(area, (tx) => tx.query("select id from public.orders"))).rows).toEqual([]);
      expect((await asArea(area, (tx) => tx.query("select id from public.order_events"))).rows).toEqual([]);
      await expect(asArea(area, createOrder)).rejects.toThrow(/row-level security/);
      const updated = await asArea(area, (tx) => tx.query("update public.orders set internal_notes = 'x' returning id"));
      expect(updated.rows).toEqual([]);
    }
  });

  it("avisos do pedido e reenvio ao Trama também exigem a área", async () => {
    const avisos = (area: Area) => asArea(area, (tx) => tx.query("select * from public.order_notifications($1)", [orderId]));
    expect((await avisos("pedidos")).rows).toEqual([]);
    expect((await avisos("itens")).rows).toEqual([]);
    await expect(asArea("itens", (tx) => tx.query("select public.requeue_order_integration($1)", [orderId]))).rejects.toThrow(/Sem permissão/);
    await expect(asArea("pedidos", (tx) => tx.query("select public.requeue_order_integration($1)", [orderId]))).rejects.toThrow(
      /pagamento confirmado/,
    );
  });
});

describe("área de itens", () => {
  it("só ela cria e edita produtos e categorias; as outras áreas só leem o catálogo", async () => {
    const id = (await asArea("itens", saveProduct)).rows[0]!.id;
    expect(id).toBeTruthy();
    await asArea("itens", (tx) => tx.query("insert into public.categories (name, slug) values ('Poltronas', 'poltronas-areas')"));
    for (const area of ["pedidos", "entrega"] as const) {
      await expect(asArea(area, saveProduct)).rejects.toThrow(/row-level security/);
      await expect(
        asArea(area, (tx) => tx.query("insert into public.categories (name, slug) values ('X', $1)", [`x-${area}`])),
      ).rejects.toThrow(/row-level security/);
      const changed = await asArea(area, (tx) => tx.query("update public.products set name = 'Mudou' where id = $1 returning id", [id]));
      expect(changed.rows).toEqual([]);
      // Ler continua: a área de pedidos escolhe produtos ao lançar um pedido.
      expect((await asArea(area, (tx) => tx.query("select id from public.products where id = $1", [id]))).rows).toHaveLength(1);
    }
  });

  it("arquivos do catálogo: só a área de itens envia", async () => {
    const insert = (area: Area) =>
      asArea(area, (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('product-media', $1)", [`products/${area}.jpg`]));
    await expect(insert("pedidos")).rejects.toThrow(/row-level security/);
  });

  it("histórico do catálogo só para a área de itens", async () => {
    expect((await asArea("itens", (tx) => tx.query("select id from public.audit_events"))).rows.length).toBeGreaterThan(0);
    expect((await asArea("pedidos", (tx) => tx.query("select id from public.audit_events"))).rows).toEqual([]);
  });
});

describe("área de entrega", () => {
  it("cuida das formas de entrega e dos avisos; as contas antigas sem área continuam só lendo", async () => {
    await asArea("entrega", (tx) =>
      tx.query("insert into public.shipping_options (name, method, details) values ('Retirada na loja', 'retirada', 'Rua X, 10')"),
    );
    const ligou = await asArea("entrega", (tx) => tx.query("update public.notification_settings set notify_email = true returning id"));
    expect(ligou.rows).toHaveLength(1);
    await expect(
      as(db, "editor", (tx) => tx.query("insert into public.shipping_options (name, method) values ('Outra', 'retirada')")),
    ).rejects.toThrow(/row-level security/);
    for (const area of ["pedidos", "itens"] as const) {
      expect((await asArea(area, (tx) => tx.query("select id from public.shipping_options"))).rows).toEqual([]);
      await expect(
        asArea(area, (tx) => tx.query("insert into public.shipping_options (name, method) values ('Outra', 'retirada')")),
      ).rejects.toThrow(/row-level security/);
    }
    // O frete para o CEP continua público (checkout).
    const forCep = await as(db, "anon", (tx) => tx.query<{ o: unknown[] }>("select public.shipping_options_for('88015200') as o"));
    expect(forCep.rows[0]!.o).toHaveLength(1);
  });

  it("áreas desconhecidas são recusadas", async () => {
    await expect(db.query("update public.admin_users set areas = '{deposito}' where user_id = $1", [AREA.itens])).rejects.toThrow(
      /admin_users_areas/,
    );
  });
});

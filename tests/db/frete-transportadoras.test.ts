import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, productPayload } from "./helpers";

/** Frete por transportadora (Melhor Envio): supabase/migrations/20261119000200_frete_transportadoras.sql. */

let db: PGlite;
let produto: string;

const address = { cep: "01310-100", rua: "Avenida Paulista", numero: "1000", complemento: "", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP", referencia: "" };
let phoneSeq = 0;
const nextPhone = () => `(31) 9${String(30_000_000 + ++phoneSeq).slice(-8)}`;
const items = () => [{ productId: produto, variantId: null, quantity: 2 }];

const checkout = (over: Record<string, unknown> = {}) => ({
  customerName: "Maria da Silva",
  customerPhone: nextPhone(),
  customerEmail: "",
  whatsappOptIn: true,
  deliveryMethod: "entrega_propria",
  address,
  deliveryNotes: "",
  acceptTerms: true,
  items: items(),
  ...over,
});

/** Como o servidor da loja (chave de serviço): só ele grava cotações. */
async function asService<T>(fn: (tx: Parameters<Parameters<PGlite["transaction"]>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return fn(tx);
  });
}

async function quote(over: Record<string, unknown> = {}) {
  const q = {
    provider: "melhor_envio",
    service_id: 3,
    service_name: ".Package",
    company_name: "Jadlog",
    cep: "01310100",
    items: JSON.stringify(items()),
    price_cents: 18990,
    days_min: 5,
    days_max: 7,
    ...over,
  };
  const cols = Object.keys(q);
  return asService(async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into public.shipping_carrier_quotes (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
      Object.values(q),
    );
    return r.rows[0].id;
  });
}

async function place(data: Record<string, unknown>) {
  const { rows } = await as(db, "anon", (tx) =>
    tx.query<{ r: { code: string } }>("select public.place_site_order($1) as r", [JSON.stringify(data)]),
  );
  return rows[0].r.code;
}

async function read(code: string) {
  return as(db, "editor", async (tx) => {
    const o = (
      await tx.query<{ id: string; shipping_cents: number | null; total_cents: number; delivery_method: string }>(
        "select id, shipping_cents, total_cents, delivery_method from public.orders where code = $1",
        [code],
      )
    ).rows[0];
    const note = (await tx.query<{ public_note: string }>("select public_note from public.order_events where order_id = $1", [o.id])).rows[0].public_note;
    return { ...o, note };
  });
}

beforeAll(async () => {
  db = await createDatabase();
  const categoryId = (await db.query<{ id: string }>("select id from public.categories where slug = 'colchoes'")).rows[0].id;
  produto = await as(db, "admin", async (tx) => {
    const r = await tx.query<{ id: string }>("select public.save_product(null, $1::jsonb) as id", [
      JSON.stringify(productPayload({ categoryId, name: "Sofá Retrátil", priceCents: 100000, variants: [] })),
    ]);
    const id = r.rows[0].id;
    await tx.query(
      `insert into public.product_media (product_id, storage_path, media_type, alt_text, is_primary, width, height)
       values ($1, $2, 'image', 'Sofá de frente', true, 1200, 900)`,
      [id, `products/${id}/foto.jpg`],
    );
    await tx.query("update public.products set status = 'published' where id = $1", [id]);
    return id;
  });
});

describe("caixas da embalagem", () => {
  const box = { weightKg: 32.5, lengthCm: 200, widthCm: 40, heightCm: 30 };

  it("a equipe cadastra as caixas e a vitrine lê (só de produto publicado)", async () => {
    await as(db, "admin", (tx) =>
      tx.query("update public.products set shipping_packages = $1 where id = $2", [JSON.stringify([box, box]), produto]),
    );
    const { rows } = await as(db, "anon", (tx) =>
      tx.query<{ shipping_packages: unknown[] }>("select shipping_packages from public.products where id = $1", [produto]),
    );
    expect(rows[0].shipping_packages).toEqual([box, box]);
  });

  it("recusa caixa sem medida, com medida zero, com campo a mais ou mais de 10 caixas", async () => {
    const bad = [
      [{ weightKg: 1, lengthCm: 10, widthCm: 10 }],
      [{ ...box, heightCm: 0 }],
      [{ ...box, cor: "azul" }],
      [{ ...box, weightKg: "10" }],
      Array.from({ length: 11 }, () => box),
      { ...box },
    ];
    for (const value of bad) {
      await expect(
        as(db, "admin", (tx) => tx.query("update public.products set shipping_packages = $1 where id = $2", [JSON.stringify(value), produto])),
      ).rejects.toThrow(/shipping_packages_valid/);
    }
  });

  it("o visitante não altera as caixas", async () => {
    const r = await as(db, "anon", (tx) =>
      tx.query("update public.products set shipping_packages = '[]' where id = $1", [produto]).then(
        () => "ok",
        (e: Error) => e.message,
      ),
    );
    expect(r).not.toBe("ok");
  });
});

describe("cotação da transportadora", () => {
  it("o visitante e a equipe não gravam cotação; o visitante não lê", async () => {
    for (const actor of ["anon", "editor"] as const) {
      await expect(
        as(db, actor, (tx) =>
          tx.query(
            "insert into public.shipping_carrier_quotes (provider, service_id, service_name, company_name, cep, items, price_cents) values ('melhor_envio', 1, 'PAC', 'Correios', '01310100', '[]', 1)",
          ),
        ),
      ).rejects.toThrow();
    }
    await quote();
    await expect(as(db, "anon", (tx) => tx.query("select * from public.shipping_carrier_quotes"))).rejects.toThrow(/permission/);
  });

  it("pedido com cotação: o frete vem da cotação, tipo transportadora, e a cotação fica presa ao pedido", async () => {
    const id = await quote();
    const code = await place(checkout({ carrierQuoteId: id, shippingCents: 1 }));
    const o = await read(code);
    expect(o.shipping_cents).toBe(18990);
    expect(o.total_cents).toBe(218990);
    expect(o.delivery_method).toBe("transportadora");
    expect(o.note).toContain("Jadlog .Package");
    expect(o.note).toContain("de 5 a 7 dias úteis após a postagem");
    const linked = await as(db, "editor", (tx) =>
      tx.query<{ order_id: string }>("select order_id from public.shipping_carrier_quotes where id = $1", [id]),
    );
    expect(linked.rows[0].order_id).toBe(o.id);
    // A mesma cotação não vale para outro pedido.
    await expect(place(checkout({ carrierQuoteId: id }))).rejects.toThrow(/venceu ou não vale/);
  });

  it("itens na mesma quantidade em outra ordem ou em duas linhas valem", async () => {
    const id = await quote();
    const split = [
      { productId: produto.toUpperCase(), variantId: null, quantity: 1 },
      { productId: produto, variantId: null, quantity: 1 },
    ];
    expect((await read(await place(checkout({ carrierQuoteId: id, items: split })))).shipping_cents).toBe(18990);
  });

  it("recusa cotação vencida, de outro CEP, de outra sacola ou junto com forma da loja", async () => {
    const vencida = await quote({ expires_at: new Date(Date.now() - 60_000).toISOString() });
    await expect(place(checkout({ carrierQuoteId: vencida }))).rejects.toThrow(/venceu ou não vale/);

    const outroCep = await quote({ cep: "88010000" });
    await expect(place(checkout({ carrierQuoteId: outroCep }))).rejects.toThrow(/venceu ou não vale/);

    const outraSacola = await quote({ items: JSON.stringify([{ productId: produto, variantId: null, quantity: 1 }]) });
    await expect(place(checkout({ carrierQuoteId: outraSacola }))).rejects.toThrow(/sacola mudou/);
    // O pedido recusado não prende a cotação.
    const free = await as(db, "editor", (tx) =>
      tx.query<{ order_id: string | null }>("select order_id from public.shipping_carrier_quotes where id = $1", [outraSacola]),
    );
    expect(free.rows[0].order_id).toBeNull();

    await expect(place(checkout({ carrierQuoteId: "nao-e-uuid" }))).rejects.toThrow(/inválido/);
    await expect(place(checkout({ carrierQuoteId: crypto.randomUUID() }))).rejects.toThrow(/venceu ou não vale/);

    const sp = JSON.stringify([{ from: "01000000", to: "05999999" }]);
    const loja = await as(db, "admin", async (tx) =>
      (await tx.query<{ id: string }>("insert into public.shipping_options (name, method, cep_ranges, price_cents) values ('Entrega SP', 'entrega_propria', $1, 100) returning id", [sp])).rows[0].id,
    );
    await expect(place(checkout({ carrierQuoteId: await quote(), shippingOptionId: loja }))).rejects.toThrow(/só uma forma/);
  });

  it("sem cotação, o pedido continua como antes (frete a combinar)", async () => {
    const o = await read(await place(checkout()));
    expect(o.shipping_cents).toBeNull();
    expect(o.delivery_method).toBe("entrega_propria");
  });
});

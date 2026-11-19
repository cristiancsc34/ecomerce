import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, productPayload } from "./helpers";

/** Frete e pagamento no pedido do site: supabase/migrations/20261119000100_frete_e_pagamento_no_checkout.sql. */

let db: PGlite;
let produto: string;
let entregaSP: string;
let combinarSP: string;
let transportadora: string;
let desativada: string;
let retirada: string;

const address = { cep: "01310-100", rua: "Avenida Paulista", numero: "1000", complemento: "", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP", referencia: "" };
let phoneSeq = 0;
const nextPhone = () => `(21) 9${String(20_000_000 + ++phoneSeq).slice(-8)}`;

const checkout = (over: Record<string, unknown> = {}) => ({
  customerName: "Maria da Silva",
  customerPhone: nextPhone(),
  customerEmail: "",
  whatsappOptIn: true,
  deliveryMethod: "entrega_propria",
  address,
  deliveryNotes: "",
  acceptTerms: true,
  items: [{ productId: produto, variantId: null, quantity: 2 }],
  ...over,
});

async function place(data: Record<string, unknown>) {
  const { rows } = await as(db, "anon", (tx) =>
    tx.query<{ r: { code: string } }>("select public.place_site_order($1) as r", [JSON.stringify(data)]),
  );
  return rows[0].r.code;
}

async function read(code: string) {
  return as(db, "editor", async (tx) => {
    const o = (
      await tx.query<{ id: string; shipping_cents: number | null; total_cents: number; delivery_method: string; payment_method: string | null }>(
        "select id, shipping_cents, total_cents, delivery_method, payment_method from public.orders where code = $1",
        [code],
      )
    ).rows[0];
    const note = (await tx.query<{ public_note: string }>("select public_note from public.order_events where order_id = $1", [o.id])).rows[0].public_note;
    return { ...o, note };
  });
}

async function option(sql: string, params: unknown[]) {
  return as(db, "admin", async (tx) => (await tx.query<{ id: string }>(`${sql} returning id`, params)).rows[0].id);
}

beforeAll(async () => {
  db = await createDatabase();
  const categoryId = (await db.query<{ id: string }>("select id from public.categories where slug = 'colchoes'")).rows[0].id;
  produto = await as(db, "admin", async (tx) => {
    const r = await tx.query<{ id: string }>("select public.save_product(null, $1::jsonb) as id", [
      JSON.stringify(productPayload({ categoryId, name: "Mesa de Jantar", priceCents: 100000, variants: [] })),
    ]);
    const id = r.rows[0].id;
    await tx.query(
      `insert into public.product_media (product_id, storage_path, media_type, alt_text, is_primary, width, height)
       values ($1, $2, 'image', 'Mesa de jantar de frente', true, 1200, 900)`,
      [id, `products/${id}/foto.jpg`],
    );
    await tx.query("update public.products set status = 'published' where id = $1", [id]);
    return id;
  });
  const sp = JSON.stringify([{ from: "01000000", to: "05999999" }]);
  entregaSP = await option("insert into public.shipping_options (name, method, cep_ranges, price_cents) values ('Entrega em São Paulo', 'entrega_propria', $1, 15000)", [sp]);
  combinarSP = await option("insert into public.shipping_options (name, method, cep_ranges, price_cents) values ('Entrega especial', 'entrega_propria', $1, null)", [sp]);
  transportadora = await option("insert into public.shipping_options (name, method, cep_ranges, price_cents) values ('Transportadora', 'transportadora', $1, 25990)", [sp]);
  desativada = await option("insert into public.shipping_options (name, method, cep_ranges, price_cents, active) values ('Antiga', 'entrega_propria', $1, 0, false)", [sp]);
  retirada = await option("insert into public.shipping_options (name, method, details) values ('Retirada', 'retirada', 'Rua X')", []);
});

describe("frete escolhido no pedido do site", () => {
  it("sem escolha: frete a combinar, como antes", async () => {
    const o = await read(await place(checkout()));
    expect(o.shipping_cents).toBeNull();
    expect(o.total_cents).toBe(200000);
    expect(o.delivery_method).toBe("entrega_propria");
    expect(o.payment_method).toBeNull();
  });

  it("com escolha: o valor vem do cadastro e entra no total", async () => {
    const o = await read(await place(checkout({ shippingOptionId: entregaSP, shippingCents: 1 })));
    expect(o.shipping_cents).toBe(15000);
    expect(o.total_cents).toBe(215000);
    expect(o.note).toContain("Entrega: Entrega em São Paulo.");
  });

  it("forma sem valor fica a combinar; transportadora grava o tipo certo", async () => {
    expect((await read(await place(checkout({ shippingOptionId: combinarSP })))).shipping_cents).toBeNull();
    const t = await read(await place(checkout({ shippingOptionId: transportadora })));
    expect(t.delivery_method).toBe("transportadora");
    expect(t.total_cents).toBe(225990);
  });

  it("recusa forma desativada, retirada, fora do CEP ou id inválido", async () => {
    for (const id of [desativada, retirada, "nao-e-uuid"]) {
      await expect(place(checkout({ shippingOptionId: id }))).rejects.toThrow(/forma de entrega/i);
    }
    await expect(
      place(checkout({ shippingOptionId: entregaSP, address: { ...address, cep: "88010-000", cidade: "Florianópolis", uf: "SC" } })),
    ).rejects.toThrow(/não atende o seu CEP/);
  });

  it("retirada continua com frete 0 e ignora a forma de entrega", async () => {
    const o = await read(await place(checkout({ deliveryMethod: "retirada", address: {}, shippingOptionId: entregaSP })));
    expect(o.shipping_cents).toBe(0);
    expect(o.delivery_method).toBe("retirada");
  });
});

describe("forma de pagamento no pedido do site", () => {
  it("grava pix, cartão ou boleto", async () => {
    for (const m of ["pix", "cartao", "boleto"]) {
      expect((await read(await place(checkout({ paymentMethod: m })))).payment_method).toBe(m);
    }
  });

  it("recusa outra forma", async () => {
    await expect(place(checkout({ paymentMethod: "dinheiro" }))).rejects.toThrow(/forma de pagamento/i);
  });
});

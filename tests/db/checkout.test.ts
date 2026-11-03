import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, productPayload, type Actor } from "./helpers";

/** Pedido feito pelo site: public.place_site_order (supabase/migrations/20261103000200_site_checkout.sql). */

let db: PGlite;
let categoryId: string;
/** Produto publicado sem variações, preço R$ 1.299,90. */
let simples: string;
/** Produto publicado com variações (Casal R$ 1.500,00 e Queen R$ 1.900,00), sem preço no produto. */
let comVariacoes: { id: string; casal: string; queen: string };
/** Outro produto publicado com variação (para testar variação de outro produto). */
let outro: { id: string; variant: string };

async function createProduct(overrides: Record<string, unknown> = {}) {
  return as(db, "admin", async (tx) => {
    const r = await tx.query<{ id: string }>("select public.save_product(null, $1::jsonb) as id", [
      JSON.stringify(productPayload({ categoryId, ...overrides })),
    ]);
    return r.rows[0].id;
  });
}

async function publish(productId: string) {
  await as(db, "admin", async (tx) => {
    await tx.query(
      `insert into public.product_media (product_id, storage_path, media_type, alt_text, is_primary, width, height)
       values ($1, $2, 'image', 'Foto real do produto de frente', true, 1200, 900)`,
      [productId, `products/${productId}/foto.jpg`],
    );
    await tx.query("update public.products set status = 'published' where id = $1", [productId]);
  });
}

async function variantIds(productId: string) {
  const { rows } = await db.query<{ id: string; name: string }>(
    "select id, name from public.product_variants where product_id = $1 order by sort_order, name",
    [productId],
  );
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
}

const address = {
  cep: "01310-100",
  rua: "Avenida Paulista",
  numero: "1000",
  complemento: "Apto 12",
  bairro: "Bela Vista",
  cidade: "São Paulo",
  uf: "sp",
  referencia: "",
};

/** Celular diferente a cada pedido, para os testes não esbarrarem no limite por celular (testado à parte). */
let phoneSeq = 0;
const nextPhone = () => `(11) 9${String(10_000_000 + ++phoneSeq).slice(-8)}`;

const checkout = (over: Record<string, unknown> = {}) => ({
  customerName: "Maria da Silva",
  customerPhone: nextPhone(),
  customerEmail: "",
  whatsappOptIn: true,
  deliveryMethod: "entrega_propria",
  address,
  deliveryNotes: "3º andar, sem elevador",
  acceptTerms: true,
  items: [{ productId: simples, variantId: null, quantity: 1 }],
  ...over,
});

async function place(data: Record<string, unknown>, actor: Actor = "anon") {
  const { rows } = await as(db, actor, (tx) =>
    tx.query<{ r: { code: string; token: string } }>("select public.place_site_order($1) as r", [JSON.stringify(data)]),
  );
  return rows[0].r;
}

type OrderRow = {
  id: string;
  source: string;
  status: string;
  customer_phone: string;
  customer_email: string | null;
  whatsapp_opt_in: boolean;
  address: Record<string, string>;
  delivery_method: string;
  subtotal_cents: number;
  shipping_cents: number | null;
  total_cents: number;
  created_by: string | null;
};

/** Lê como a equipe (editor), pelas regras de acesso normais. */
async function staffRead(code: string) {
  return as(db, "editor", async (tx) => {
    const order = (await tx.query<OrderRow>("select * from public.orders where code = $1", [code])).rows[0];
    const items = (
      await tx.query<{ name: string; variant_name: string | null; unit_price_cents: number; quantity: number; variant_id: string | null }>(
        "select name, variant_name, unit_price_cents, quantity, variant_id from public.order_items where order_id = $1 order by sort_order",
        [order.id],
      )
    ).rows;
    const events = (
      await tx.query<{ status: string; public_note: string | null }>(
        "select status, public_note from public.order_events where order_id = $1 order by created_at",
        [order.id],
      )
    ).rows;
    return { order, items, events };
  });
}

beforeAll(async () => {
  db = await createDatabase();
  categoryId = (await db.query<{ id: string }>("select id from public.categories where slug = 'colchoes'")).rows[0].id;

  simples = await createProduct({ name: "Poltrona Azul", priceCents: 129990, variants: [] });
  await publish(simples);

  const v = await createProduct({
    name: "Colchão Real",
    variants: [
      { name: "Casal", sku: null, priceCents: 150000, stockQuantity: null, size: "casal", widthCm: 138, lengthCm: 188 },
      { name: "Queen", sku: null, priceCents: 190000, stockQuantity: 2, size: "queen", widthCm: 158, lengthCm: 198 },
    ],
  });
  await publish(v);
  const vIds = await variantIds(v);
  comVariacoes = { id: v, casal: vIds.Casal, queen: vIds.Queen };

  const o = await createProduct({ name: "Travesseiro" });
  await publish(o);
  outro = { id: o, variant: Object.values(await variantIds(o))[0] };
});

describe("pedido pelo site: caminho feliz", () => {
  it("visitante cria o pedido; preço e total vêm do banco mesmo se o navegador mandar outro preço", async () => {
    const result = await place(
      checkout({
        items: [
          { productId: simples, variantId: null, quantity: 2, unitPriceCents: 1, priceCents: 1, name: "Barato" },
          { productId: comVariacoes.id, variantId: comVariacoes.casal, quantity: 1, unitPriceCents: 1 },
        ],
        customerPhone: "(11) 98765-4321",
        subtotalCents: 2,
        totalCents: 2,
        shippingCents: 0,
        status: "pago",
        source: "painel",
      }),
    );
    expect(result.code).toMatch(/^PED-\d{4,}$/);
    expect(result.token).toMatch(/^[0-9a-f-]{36}$/);

    const { order, items, events } = await staffRead(result.code);
    expect(order).toMatchObject({
      source: "site",
      status: "recebido",
      customer_phone: "5511987654321",
      customer_email: null,
      whatsapp_opt_in: true,
      delivery_method: "entrega_propria",
      subtotal_cents: 2 * 129990 + 150000,
      shipping_cents: null, // frete a combinar, nunca inventado
      total_cents: 2 * 129990 + 150000,
      created_by: null,
    });
    expect(order.address).toEqual({
      cep: "01310100",
      rua: "Avenida Paulista",
      numero: "1000",
      complemento: "Apto 12",
      bairro: "Bela Vista",
      cidade: "São Paulo",
      uf: "SP",
    });
    expect(items).toEqual([
      { name: "Poltrona Azul", variant_name: null, unit_price_cents: 129990, quantity: 2, variant_id: null },
      { name: "Colchão Real", variant_name: "Casal", unit_price_cents: 150000, quantity: 1, variant_id: comVariacoes.casal },
    ]);
    expect(events).toEqual([
      {
        status: "recebido",
        public_note: "Pedido feito pelo site. Vamos confirmar o pagamento e a entrega com você pelo WhatsApp.",
      },
    ]);
  });

  it("cliente logado (sem ser da equipe) também faz pedido", async () => {
    const { code } = await place(checkout(), "outsider");
    expect(code).toMatch(/^PED-/);
  });

  it("retirada sem endereço é aceita, com frete 0 e endereço vazio", async () => {
    const { code } = await place(checkout({ deliveryMethod: "retirada", address: { cep: "", rua: "" } }));
    const { order } = await staffRead(code);
    expect(order).toMatchObject({ delivery_method: "retirada", shipping_cents: 0, total_cents: 129990, address: {} });
  });

  it("mesmo produto e variação repetidos viram uma linha com a soma", async () => {
    const { code } = await place(
      checkout({
        items: [
          { productId: simples, variantId: null, quantity: 3 },
          { productId: simples, variantId: null, quantity: 4 },
        ],
      }),
    );
    const { items, order } = await staffRead(code);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(7);
    expect(order.total_cents).toBe(7 * 129990);
  });

  it("o pedido aparece para a equipe com source 'site'", async () => {
    const { code } = await place(checkout());
    const { rows } = await as(db, "editor", (tx) =>
      tx.query<{ code: string; source: string }>("select code, source from public.orders where source = 'site' and code = $1", [code]),
    );
    expect(rows).toEqual([{ code, source: "site" }]);
  });

  it("acompanhamento com o link devolvido funciona, sem dados internos", async () => {
    const { code, token } = await place(checkout({ customerPhone: "(11) 98765-4321" }));
    const { rows } = await as(db, "anon", (tx) =>
      tx.query<{ t: Record<string, unknown> }>("select public.order_tracking($1, $2) as t", [code, token]),
    );
    expect(rows[0].t).toMatchObject({
      code,
      status: "recebido",
      customerFirstName: "Maria",
      shippingCents: null,
      totalCents: 129990,
      place: { bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" },
    });
    expect(JSON.stringify(rows[0].t)).not.toContain("Paulista");
    // Pelo número + celular também acha.
    const lookup = await as(db, "anon", (tx) =>
      tx.query<{ t: string | null }>("select public.order_tracking_token($1, $2) as t", [code, "11 98765-4321"]),
    );
    expect(lookup.rows[0].t).toBe(token);
  });
});

describe("pedido pelo site: acesso", () => {
  it("visitante continua sem ler nem gravar direto nas tabelas de pedidos", async () => {
    await place(checkout());
    await expect(as(db, "anon", (tx) => tx.query("select * from public.orders"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", (tx) => tx.query("select * from public.order_items"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", (tx) => tx.query("select * from public.order_events"))).rejects.toThrow(/permission denied/);
    const { rows } = await as(db, "outsider", (tx) => tx.query("select * from public.orders"));
    expect(rows).toEqual([]);
  });
});

describe("pedido pelo site: recusas", () => {
  const refuses = (data: Record<string, unknown>, message: RegExp) => expect(place(data)).rejects.toThrow(message);

  it("produto em rascunho, de demonstração ou inexistente", async () => {
    const rascunho = await createProduct({ name: "Rascunho", priceCents: 1000, variants: [] });
    await refuses(checkout({ items: [{ productId: rascunho, variantId: null, quantity: 1 }] }), /Produto indisponível/);

    const demo = (await db.query<{ id: string }>("select id from public.products where is_demo limit 1")).rows[0].id;
    await refuses(checkout({ items: [{ productId: demo, variantId: null, quantity: 1 }] }), /Produto indisponível/);

    await refuses(
      checkout({ items: [{ productId: "00000000-0000-4000-8000-000000000000", variantId: null, quantity: 1 }] }),
      /Produto indisponível/,
    );
    await refuses(checkout({ items: [{ productId: "nao-e-uuid", variantId: null, quantity: 1 }] }), /Produto indisponível/);
  });

  it("produto publicado que ficou sem preço", async () => {
    const id = await createProduct({ name: "Sem Preço Agora", priceCents: 5000, variants: [] });
    await publish(id);
    await db.query("update public.products set price_cents = null where id = $1", [id]);
    await refuses(checkout({ items: [{ productId: id, variantId: null, quantity: 1 }] }), /Produto sem preço/);
  });

  it("variação de outro produto, ou produto com variações sem escolher a variação", async () => {
    await refuses(
      checkout({ items: [{ productId: comVariacoes.id, variantId: outro.variant, quantity: 1 }] }),
      /Variação não encontrada/,
    );
    await refuses(checkout({ items: [{ productId: comVariacoes.id, variantId: null, quantity: 1 }] }), /Escolha o tamanho/);
    await refuses(checkout({ items: [{ productId: simples, variantId: outro.variant, quantity: 1 }] }), /Variação não encontrada/);
  });

  it("quantidade 0, 11, quebrada ou soma acima de 10", async () => {
    for (const quantity of [0, 11, -1, 1.5, "2"]) {
      await refuses(checkout({ items: [{ productId: simples, variantId: null, quantity }] }), /Quantidade inválida/);
    }
    await refuses(
      checkout({
        items: [
          { productId: simples, variantId: null, quantity: 6 },
          { productId: simples, variantId: null, quantity: 5 },
        ],
      }),
      /Quantidade inválida/,
    );
  });

  it("sacola vazia ou com mais de 20 itens", async () => {
    await refuses(checkout({ items: [] }), /A sacola está vazia/);
    const many = Array.from({ length: 21 }, () => ({ productId: simples, variantId: null, quantity: 1 }));
    await refuses(checkout({ items: many }), /até 20 itens/);
  });

  it("estoque da variação", async () => {
    await refuses(
      checkout({ items: [{ productId: comVariacoes.id, variantId: comVariacoes.queen, quantity: 3 }] }),
      /Estoque insuficiente: temos 2/,
    );
  });

  it("entrega sem endereço completo", async () => {
    await refuses(checkout({ address: {} }), /CEP/);
    await refuses(checkout({ address: { ...address, cep: "0131" } }), /CEP/);
    await refuses(checkout({ address: { ...address, rua: " " } }), /rua/);
    await refuses(checkout({ address: { ...address, numero: "" } }), /número/);
    await refuses(checkout({ address: { ...address, cidade: "" } }), /cidade/);
    await refuses(checkout({ address: { ...address, uf: "S" } }), /UF/);
  });

  it("dados do cliente", async () => {
    await refuses(checkout({ customerName: "M" }), /Informe seu nome/);
    await refuses(checkout({ customerPhone: "98765-4321" }), /celular com DDD/);
    await refuses(checkout({ customerPhone: "" }), /celular com DDD/);
    await refuses(checkout({ customerEmail: "maria@" }), /E-mail inválido/);
    await refuses(checkout({ whatsappOptIn: false }), /WhatsApp/);
    await refuses(checkout({ whatsappOptIn: "true" }), /WhatsApp/);
    await refuses(checkout({ acceptTerms: false }), /condições de compra/);
    await refuses(checkout({ deliveryMethod: "transportadora" }), /entrega e retirada/);
  });

  it("e-mail válido é guardado; celular de 13 dígitos é aceito como está", async () => {
    const { code } = await place(checkout({ customerEmail: " maria@exemplo.com.br ", customerPhone: "+55 21 99876-5432" }));
    const { order } = await staffRead(code);
    expect(order).toMatchObject({ customer_email: "maria@exemplo.com.br", customer_phone: "5521998765432" });
  });

  it("recusa não gasta número de pedido", async () => {
    const before = (await place(checkout())).code;
    await expect(place(checkout({ items: [] }))).rejects.toThrow();
    const after = (await place(checkout())).code;
    expect(Number(after.slice(4))).toBe(Number(before.slice(4)) + 1);
  });
});

describe("pedido pelo site: textos e pedidos em massa", () => {
  it("tira caracteres de controle e invisíveis dos textos do cliente", async () => {
    const { code } = await place(
      checkout({
        customerName: "  Maria\u202E\u200B da\nSilva\u0007 ",
        address: { ...address, rua: "Avenida\tPaulista\u2066", bairro: "Bela\r\nVista" },
        deliveryNotes: "3º andar\r\nsem elevador\u202E",
      }),
    );
    const { rows } = await db.query<{ customer_name: string; address: Record<string, string>; delivery_notes: string }>(
      "select customer_name, address, delivery_notes from public.orders where code = $1",
      [code],
    );
    expect(rows[0].customer_name).toBe("Maria da Silva");
    expect(rows[0].address.rua).toBe("Avenida Paulista");
    expect(rows[0].address.bairro).toBe("Bela Vista");
    expect(rows[0].delivery_notes).toBe("3º andar\nsem elevador");
  });

  it("nome só com caracteres invisíveis é recusado", async () => {
    await expect(place(checkout({ customerName: "\u200B\u200B\u202E" }))).rejects.toThrow(/Informe seu nome/);
  });

  it("até 5 pedidos do mesmo celular por hora (mesmo chamando a função direto)", async () => {
    const phone = "(21) 99999-0001";
    for (let i = 0; i < 5; i++) await place(checkout({ customerPhone: phone }));
    await expect(place(checkout({ customerPhone: "+55 21 99999-0001" }))).rejects.toThrow(/vários pedidos deste celular/);
    // Outro celular continua comprando.
    await expect(place(checkout())).resolves.toMatchObject({ code: expect.stringMatching(/^PED-/) });
    // Passada a hora, o mesmo celular volta a comprar.
    await db.query("update public.orders set created_at = created_at - interval '61 minutes' where customer_phone = '5521999990001'");
    await expect(place(checkout({ customerPhone: phone }))).resolves.toMatchObject({ code: expect.stringMatching(/^PED-/) });
  });

  it("até 30 pedidos do site a cada 10 minutos; o recusado não gasta número", async () => {
    // Começa do zero: os pedidos dos outros testes ficam no passado.
    await db.query("update public.orders set created_at = created_at - interval '1 day' where source = 'site'");
    let last = "";
    for (let i = 0; i < 30; i++) last = (await place(checkout())).code;
    await expect(place(checkout())).rejects.toThrow(/Muitos pedidos ao mesmo tempo/);
    // Passados os 10 minutos, volta a aceitar; a recusa não gastou número de pedido.
    await db.query("update public.orders set created_at = created_at - interval '11 minutes' where source = 'site'");
    const next = (await place(checkout())).code;
    expect(Number(next.slice(4))).toBe(Number(last.slice(4)) + 1);
  });
});

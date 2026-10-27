import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, productPayload, USERS } from "./helpers";

let db: PGlite;
let categoryId: string;

beforeAll(async () => {
  db = await createDatabase();
  categoryId = (await db.query<{ id: string }>("select id from public.categories where slug = 'colchoes'")).rows[0].id;
});

async function createProduct(actor: "admin" | "editor", overrides: Record<string, unknown> = {}) {
  return as(db, actor, async (tx) => {
    const r = await tx.query<{ save_product: string }>("select public.save_product(null, $1::jsonb)", [
      JSON.stringify(productPayload({ categoryId, ...overrides })),
    ]);
    return r.rows[0].save_product;
  });
}

async function addMedia(productId: string, { illustrative = false, primary = true, alt = "Foto real do colchão de frente" } = {}) {
  return as(db, "admin", async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into public.product_media (product_id, storage_path, media_type, alt_text, is_primary, is_illustrative, width, height)
       values ($1, $2, 'image', $3, $4, $5, 1200, 900) returning id`,
      [productId, `products/${productId}/${Math.random().toString(36).slice(2)}.jpg`, alt, primary, illustrative],
    );
    return r.rows[0].id;
  });
}

async function setStatus(actor: "admin" | "editor", productId: string, status: string) {
  return as(db, actor, (tx) => tx.query("update public.products set status = $2 where id = $1", [productId, status]));
}

describe("visitante anônimo", () => {
  it("não vê rascunhos nem demonstrações", async () => {
    const rows = await as(db, "anon", (tx) => tx.query("select id from public.products"));
    expect(rows.rows).toEqual([]);
    const media = await as(db, "anon", (tx) => tx.query("select id from public.product_media"));
    expect(media.rows).toEqual([]);
    const variants = await as(db, "anon", (tx) => tx.query("select id from public.product_variants"));
    expect(variants.rows).toEqual([]);
  });

  it("vê categorias", async () => {
    const rows = await as(db, "anon", (tx) => tx.query("select slug from public.categories"));
    expect(rows.rows).toEqual([{ slug: "colchoes" }]);
  });

  it("não escreve em nada", async () => {
    await expect(
      as(db, "anon", (tx) => tx.query("insert into public.products (name, slug) values ('x', 'x')")),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", (tx) => tx.query("insert into public.categories (name, slug) values ('x', 'x')"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(as(db, "anon", (tx) => tx.query("delete from public.products"))).rejects.toThrow(/permission denied/);
  });

  it("não lê equipe, auditoria nem colunas internas", async () => {
    await expect(as(db, "anon", (tx) => tx.query("select * from public.admin_users"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", (tx) => tx.query("select * from public.audit_events"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", (tx) => tx.query("select created_by from public.products"))).rejects.toThrow(/permission denied/);
  });

  it("não executa as funções do painel", async () => {
    await expect(
      as(db, "anon", (tx) => tx.query("select public.save_product(null, $1::jsonb)", [JSON.stringify(productPayload())])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, "anon", (tx) => tx.query("select public.duplicate_product('00000000-0000-4000-8000-000000000000')")),
    ).rejects.toThrow(/permission denied/);
  });

  it("não envia nem lista arquivos no Storage", async () => {
    await expect(
      as(db, "anon", (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('product-media', 'products/x/a.jpg')")),
    ).rejects.toThrow(/row-level security/);
    await db.exec("insert into storage.objects (bucket_id, name) values ('product-media', 'products/seed/existente.jpg')");
    const listed = await as(db, "anon", (tx) => tx.query("select name from storage.objects"));
    expect(listed.rows).toEqual([]);
  });
});

describe("usuário logado que não é da equipe", () => {
  it("não vê rascunhos e não cria produtos", async () => {
    const rows = await as(db, "outsider", (tx) => tx.query("select id from public.products"));
    expect(rows.rows).toEqual([]);
    await expect(
      as(db, "outsider", (tx) => tx.query("select public.save_product(null, $1::jsonb)", [JSON.stringify(productPayload())])),
    ).rejects.toThrow(/row-level security/);
  });

  it("não se promove a administrador", async () => {
    await expect(
      as(db, "outsider", (tx) => tx.query("insert into public.admin_users (user_id, role) values ($1, 'admin')", [USERS.outsider])),
    ).rejects.toThrow(/permission denied|row-level security/);
    const self = await as(db, "outsider", (tx) => tx.query("select * from public.admin_users"));
    expect(self.rows).toEqual([]);
  });

  it("não envia arquivos nem lê a auditoria", async () => {
    await expect(
      as(db, "outsider", (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('product-media', 'products/x/b.jpg')")),
    ).rejects.toThrow(/row-level security/);
    const audit = await as(db, "outsider", (tx) => tx.query("select id from public.audit_events"));
    expect(audit.rows).toEqual([]);
  });
});

describe("editor", () => {
  it("cria rascunho com variações e envia para revisão", async () => {
    const id = await createProduct("editor");
    const variants = await as(db, "editor", (tx) => tx.query("select name, price_cents from public.product_variants where product_id = $1", [id]));
    expect(variants.rows).toEqual([{ name: "Casal", price_cents: 150000 }]);
    await setStatus("editor", id, "review");
    const status = await as(db, "editor", (tx) => tx.query<{ status: string }>("select status from public.products where id = $1", [id]));
    expect(status.rows[0].status).toBe("review");
  });

  it("não publica nem arquiva, mesmo direto no banco", async () => {
    const id = await createProduct("editor");
    await addMedia(id);
    await expect(setStatus("editor", id, "published")).rejects.toThrow(/Somente administradores/);
    await expect(setStatus("editor", id, "archived")).rejects.toThrow(/Somente administradores/);
  });

  it("não cria produto já publicado", async () => {
    await expect(
      as(db, "editor", (tx) =>
        tx.query("insert into public.products (name, slug, status, description, category_id) values ('x', 'editor-publicado', 'published', 'd', $1)", [
          categoryId,
        ]),
      ),
    ).rejects.toThrow(/Somente administradores/);
  });

  it("não altera produto publicado nem suas fotos e variações", async () => {
    const id = await createProduct("admin");
    await addMedia(id);
    await setStatus("admin", id, "published");
    await expect(
      as(db, "editor", (tx) => tx.query("update public.products set name = 'hack' where id = $1", [id])),
    ).rejects.toThrow(/Somente administradores/);
    const media = await as(db, "editor", (tx) => tx.query("delete from public.product_media where product_id = $1 returning id", [id]));
    expect(media.rows).toEqual([]);
    const variants = await as(db, "editor", (tx) => tx.query("update public.product_variants set price_cents = 1 where product_id = $1 returning id", [id]));
    expect(variants.rows).toEqual([]);
  });

  it("não converte produto de demonstração", async () => {
    const demo = (await db.query<{ id: string }>("select id from public.products where is_demo limit 1")).rows[0].id;
    await expect(
      as(db, "editor", (tx) => tx.query("update public.products set is_demo = false where id = $1", [demo])),
    ).rejects.toThrow(/Somente administradores/);
  });

  it("envia arquivos só para a pasta products/", async () => {
    await as(db, "editor", (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('product-media', 'products/abc/foto.jpg')"));
    await expect(
      as(db, "editor", (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('product-media', 'outra/foto.jpg')")),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("publicação controlada (administrador)", () => {
  it("demonstração nunca é publicada", async () => {
    const demo = (await db.query<{ id: string }>("select id from public.products where is_demo limit 1")).rows[0].id;
    await expect(setStatus("admin", demo, "published")).rejects.toThrow(/demonstração não pode ser publicado/);
  });

  it("exige preço, foto principal real e textos alternativos", async () => {
    const semPreco = await createProduct("admin", { variants: [] });
    await addMedia(semPreco);
    await expect(setStatus("admin", semPreco, "published")).rejects.toThrow(/informe o preço/);

    const semFoto = await createProduct("admin");
    await expect(setStatus("admin", semFoto, "published")).rejects.toThrow(/foto principal/);

    const ilustrativa = await createProduct("admin");
    await addMedia(ilustrativa, { illustrative: true });
    await expect(setStatus("admin", ilustrativa, "published")).rejects.toThrow(/foto real/);

    const semAlt = await createProduct("admin");
    await addMedia(semAlt);
    await addMedia(semAlt, { primary: false, alt: "" });
    await expect(setStatus("admin", semAlt, "published")).rejects.toThrow(/texto alternativo/);
  });

  it("exige categoria e descrição", async () => {
    const id = await createProduct("admin", { categoryId: null });
    await addMedia(id);
    await expect(setStatus("admin", id, "published")).rejects.toThrow(/products_published_requires_category/);
  });

  it("publica produto completo, que passa a aparecer para o público", async () => {
    const id = await createProduct("admin");
    await addMedia(id);
    await setStatus("admin", id, "published");

    const pub = await db.query<{ published_at: string | null }>("select published_at from public.products where id = $1", [id]);
    expect(pub.rows[0].published_at).not.toBeNull();

    const visible = await as(db, "anon", (tx) =>
      tx.query("select p.id, (select count(*) from public.product_media m where m.product_id = p.id)::int as media, (select count(*) from public.product_variants v where v.product_id = p.id)::int as variants from public.products p where p.id = $1", [id]),
    );
    expect(visible.rows).toEqual([{ id, media: 1, variants: 1 }]);

    // Despublicar tira da vitrine.
    await setStatus("admin", id, "draft");
    const hidden = await as(db, "anon", (tx) => tx.query("select id from public.products where id = $1", [id]));
    expect(hidden.rows).toEqual([]);
  });

  it("recusa preço “de” menor ou igual ao preço", async () => {
    await expect(createProduct("admin", { variants: [], priceCents: 1000, compareAtPriceCents: 900 })).rejects.toThrow(
      /products_compare_at_gt_price/,
    );
  });
});

describe("funções do painel", () => {
  it("save_product sincroniza variações (mantém, altera, remove e cria)", async () => {
    const id = await createProduct("admin", {
      variants: [
        { name: "A", sku: null, priceCents: 100, stockQuantity: null, size: "casal", widthCm: 138, lengthCm: 188 },
        { name: "B", sku: null, priceCents: 200, stockQuantity: null, size: "queen", widthCm: 158, lengthCm: 198 },
      ],
    });
    const before = (await as(db, "admin", (tx) => tx.query<{ id: string; name: string }>("select id, name from public.product_variants where product_id = $1 order by sort_order", [id]))).rows;

    await as(db, "admin", (tx) =>
      tx.query("select public.save_product($1, $2::jsonb)", [
        id,
        JSON.stringify(
          productPayload({
            categoryId,
            slug: `sync-${id.slice(-6)}`,
            variants: [
              { id: before[1].id, name: "B alterado", sku: null, priceCents: 250, stockQuantity: 3, size: "queen", widthCm: 158, lengthCm: 198 },
              { name: "C novo", sku: null, priceCents: 300, stockQuantity: null, size: "king", widthCm: 193, lengthCm: 203 },
            ],
          }),
        ),
      ]),
    );
    const after = (await as(db, "admin", (tx) => tx.query<{ id: string; name: string; price_cents: number; attributes: unknown }>("select id, name, price_cents, attributes from public.product_variants where product_id = $1 order by sort_order", [id]))).rows;
    expect(after.map((v) => v.name)).toEqual(["B alterado", "C novo"]);
    expect(after[0].id).toBe(before[1].id);
    expect(after[0].price_cents).toBe(250);
    expect(after[1].attributes).toEqual({ size: "king", widthCm: 193, lengthCm: 203 });
  });

  it("save_product recusa variação de outro produto", async () => {
    const a = await createProduct("admin");
    const b = await createProduct("admin");
    const foreign = (await db.query<{ id: string }>("select id from public.product_variants where product_id = $1", [b])).rows[0].id;
    await expect(
      as(db, "admin", (tx) =>
        tx.query("select public.save_product($1, $2::jsonb)", [
          a,
          JSON.stringify(productPayload({ categoryId, variants: [{ id: foreign, name: "x", sku: null, priceCents: 1, stockQuantity: null, size: null, widthCm: null, lengthCm: null }] })),
        ]),
      ),
    ).rejects.toThrow(/não pertence/);
  });

  it("set_primary_media troca a foto principal", async () => {
    const id = await createProduct("admin");
    const first = await addMedia(id);
    const second = await addMedia(id, { primary: false });
    await as(db, "admin", (tx) => tx.query("select public.set_primary_media($1)", [second]));
    const rows = (await db.query<{ id: string; is_primary: boolean }>("select id, is_primary from public.product_media where product_id = $1", [id])).rows;
    expect(rows.find((r) => r.id === first)?.is_primary).toBe(false);
    expect(rows.find((r) => r.id === second)?.is_primary).toBe(true);
  });

  it("duplicate_product cria rascunho com variações e mídia", async () => {
    const id = await createProduct("admin");
    await addMedia(id);
    await setStatus("admin", id, "published");
    const copy = await as(db, "editor", async (tx) => (await tx.query<{ duplicate_product: string }>("select public.duplicate_product($1)", [id])).rows[0].duplicate_product);
    const row = (await db.query<{ status: string; slug: string; name: string }>("select status, slug, name from public.products where id = $1", [copy])).rows[0];
    expect(row.status).toBe("draft");
    expect(row.slug).toMatch(/-copia-[0-9a-f]{6}$/);
    expect(row.name).toMatch(/\(cópia\)$/);
    const counts = (await db.query<{ m: number; v: number }>("select (select count(*) from public.product_media where product_id = $1)::int m, (select count(*) from public.product_variants where product_id = $1)::int v", [copy])).rows[0];
    expect(counts).toEqual({ m: 1, v: 1 });
  });
});

describe("auditoria", () => {
  it("registra criação, status e preço com o autor", async () => {
    const id = await createProduct("admin", { variants: [], priceCents: 1000 });
    await as(db, "admin", (tx) => tx.query("update public.products set price_cents = 1200 where id = $1", [id]));
    await addMedia(id);
    await setStatus("admin", id, "published");

    const events = (await as(db, "editor", (tx) => tx.query<{ action: string; actor_id: string; details: Record<string, unknown> }>("select action, actor_id, details from public.audit_events where entity_id = $1 order by id", [id]))).rows;
    expect(events.map((e) => e.action)).toEqual(["product.created", "product.price_changed", "media.added", "product.status_changed"]);
    expect(events.every((e) => e.actor_id === USERS.admin)).toBe(true);
    expect(events[1].details).toMatchObject({ from: 1000, to: 1200 });
    expect(events[3].details).toMatchObject({ from: "draft", to: "published" });
  });

  it("ninguém da API apaga ou altera a auditoria", async () => {
    await expect(as(db, "admin", (tx) => tx.query("delete from public.audit_events"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "admin", (tx) => tx.query("update public.audit_events set action = 'x'"))).rejects.toThrow(/permission denied/);
  });
});

import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, productPayload, USERS } from "./helpers";

/** Cores no Estúdio (supabase/migrations/20261105000100_cores_tipo_de_tarefa.sql e 20261105000200_cores.sql). */

let db: PGlite;
let chairs: string;

beforeAll(async () => {
  db = await createDatabase();
  chairs = (await db.query<{ id: string }>("select id from public.categories where slug = 'cadeiras'")).rows[0].id;
});

async function asService<T>(fn: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return fn(tx);
  });
}

async function createProduct(overrides: Record<string, unknown> = {}) {
  return as(db, "editor", async (tx) => {
    const r = await tx.query<{ save_product: string }>("select public.save_product(null, $1::jsonb)", [
      JSON.stringify(productPayload({ categoryId: chairs, variants: [], priceCents: 59900, ...overrides })),
    ]);
    return r.rows[0].save_product;
  });
}

/** Foto de catálogo de IA já aprovada pela equipe. */
async function addCatalogPhoto(productId: string, view = "frente") {
  const id = (
    await db.query<{ id: string }>(
      `insert into public.product_media (product_id, storage_path, media_type, alt_text, width, height, ai_generated)
       values ($1, $2, 'image', $3, 1600, 1200, true) returning id`,
      [productId, `products/${productId}/catalogo-${view}.jpg`, `Cadeira, vista ${view}`],
    )
  ).rows[0].id;
  await as(db, "editor", (tx) => tx.query("update public.product_media set approved_at = now() where id = $1", [id]));
  return id;
}

const colorParams = (sourceMediaIds: string[], colorName = "Marrom", colorHex = "#6b4a35") => ({ colorName, colorHex, sourceMediaIds });

async function requestColor(actor: "editor" | "admin" | "outsider" | "anon", productId: string, params: unknown, path?: string) {
  return as(db, actor, async (tx) => {
    const r = await tx.query<{ id: string }>(
      "insert into public.ai_jobs (product_id, kind, input_path, params) values ($1, 'color_variant', $2, $3::jsonb) returning id",
      [productId, path ?? `products/${productId}/catalogo-frente.jpg`, JSON.stringify(params)],
    );
    return r.rows[0].id;
  });
}

/** O processador grava as fotos da cor e conclui a tarefa. */
async function finishColorJob(productId: string, jobId: string, count = 2) {
  return asService(async (tx) => {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const r = await tx.query<{ id: string }>(
        `insert into public.product_media (product_id, storage_path, media_type, alt_text, sort_order, width, height,
           ai_generated, is_illustrative, color_job_id)
         values ($1, $2, 'image', 'Cadeira na cor marrom (imagem ilustrativa)', $3, 1600, 1200, true, true, $4) returning id`,
        [productId, `products/${productId}/cor-${jobId}-${i}.jpg`, 10 + i, jobId],
      );
      ids.push(r.rows[0].id);
    }
    await tx.query("update public.ai_jobs set status = 'succeeded', details = $2::jsonb where id = $1", [jobId, JSON.stringify({ mediaIds: ids })]);
    return ids;
  });
}

const publish = (actor: "editor" | "admin" | "outsider", jobId: string, mediaIds: string[], color: unknown, original: unknown = null) =>
  as(db, actor, async (tx) => {
    const r = await tx.query<{ v: string }>("select public.publish_color_variant($1, $2::uuid[], $3::jsonb, $4::jsonb) as v", [
      jobId,
      mediaIds,
      JSON.stringify(color),
      original === null ? null : JSON.stringify(original),
    ]);
    return r.rows[0].v;
  });

const variantsOf = (productId: string) =>
  db
    .query<{ id: string; name: string; price_cents: number; attributes: { colorHex?: string }; sort_order: number }>(
      "select id, name, price_cents, attributes, sort_order from public.product_variants where product_id = $1 order by sort_order",
      [productId],
    )
    .then((r) => r.rows);

describe("cores: pedido", () => {
  it("a equipe pede a cor com nome, cor e fotos de origem; o banco recusa pedido incompleto", async () => {
    const id = await createProduct();
    const photo = await addCatalogPhoto(id);
    const jobId = await requestColor("editor", id, colorParams([photo]));
    const job = (await db.query<{ kind: string; status: string; params: Record<string, unknown>; created_by: string }>(
      "select kind, status, params, created_by from public.ai_jobs where id = $1",
      [jobId],
    )).rows[0];
    expect(job).toMatchObject({ kind: "color_variant", status: "queued", params: { colorName: "Marrom", colorHex: "#6b4a35" }, created_by: USERS.editor });

    for (const bad of [
      colorParams([photo], "Marrom", "marrom"),
      colorParams([photo], "  ", "#6B4A35"),
      colorParams([], "Marrom", "#6B4A35"),
      { colorName: "Marrom", colorHex: "#6B4A35" },
      { colorName: "Marrom", colorHex: "#6B4A35", sourceMediaIds: "x" },
      { colorName: "Marrom", sourceMediaIds: [photo] },
      {},
    ]) {
      await expect(requestColor("editor", id, bad)).rejects.toThrow(/ai_jobs_color_params/);
    }
  });

  it("quem não é da equipe não pede; a equipe não grava resultado nem status", async () => {
    const id = await createProduct();
    const photo = await addCatalogPhoto(id);
    await expect(requestColor("anon", id, colorParams([photo]))).rejects.toThrow(/permission denied/);
    await expect(requestColor("outsider", id, colorParams([photo]))).rejects.toThrow(/row-level security/);
    await expect(
      as(db, "editor", (tx) =>
        tx.query("insert into public.ai_jobs (product_id, kind, input_path, params, details) values ($1, 'color_variant', $2, $3::jsonb, '{}')", [
          id,
          `products/${id}/catalogo-frente.jpg`,
          JSON.stringify(colorParams([photo])),
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("o processador pega a tarefa de cor só quando pede esse tipo", async () => {
    const id = await createProduct();
    const photo = await addCatalogPhoto(id);
    await requestColor("editor", id, colorParams([photo]));
    const none = await asService((tx) => tx.query("select id from public.claim_ai_job(array['catalog_photos']::public.ai_job_kind[])"));
    expect(none.rows).toEqual([]);
    // A fila entrega as tarefas de cor em ordem, com os parâmetros.
    const claimed = await asService((tx) =>
      tx.query<{ kind: string; status: string; params: Record<string, unknown> }>(
        "select kind, status, params from public.claim_ai_job(array['color_variant']::public.ai_job_kind[])",
      ),
    );
    expect(claimed.rows[0]).toMatchObject({ kind: "color_variant", status: "running", params: { colorName: "Marrom", colorHex: "#6b4a35" } });
  });
});

describe("cores: fotos geradas", () => {
  it("nascem sem aprovação e não aparecem na loja; são ilustrativas e nunca a principal", async () => {
    const id = await createProduct();
    const photo = await addCatalogPhoto(id);
    const jobId = await requestColor("editor", id, colorParams([photo]));
    const [first] = await finishColorJob(id, jobId, 1);
    const row = (await db.query<{ approved_at: string | null }>("select approved_at from public.product_media where id = $1", [first])).rows[0];
    expect(row.approved_at).toBeNull();

    await expect(as(db, "admin", (tx) => tx.query("update public.product_media set is_illustrative = false where id = $1", [first]))).rejects.toThrow(
      /product_media_color_photo/,
    );
    await expect(as(db, "admin", (tx) => tx.query("update public.product_media set approved_at = now(), is_primary = true where id = $1", [first]))).rejects.toThrow(
      /product_media_color_photo/,
    );
  });
});

describe("cores: publicar", () => {
  it("primeira cor: cria a cor atual e a nova, aprova e liga as fotos escolhidas, em nome de quem conferiu", async () => {
    const id = await createProduct();
    const photo = await addCatalogPhoto(id);
    const jobId = await requestColor("editor", id, colorParams([photo]));
    const media = await finishColorJob(id, jobId, 3);
    const before = (await db.query<{ updated_at: string }>("select updated_at from public.products where id = $1", [id])).rows[0].updated_at;

    // Sem a cor atual, não publica (a 1ª cor da lista é a das fotos originais).
    await expect(publish("editor", jobId, media.slice(0, 2), { priceCents: 64900, stockQuantity: 2 })).rejects.toThrow(/cor atual do produto/);

    const variantId = await publish("editor", jobId, media.slice(0, 2), { priceCents: 64900, stockQuantity: 2 }, {
      name: "Azul",
      colorHex: "#2f3e62",
      priceCents: 59900,
      stockQuantity: null,
    });
    const variants = await variantsOf(id);
    expect(variants.map((v) => [v.name, v.attributes.colorHex, v.price_cents, v.sort_order])).toEqual([
      ["Azul", "#2F3E62", 59900, 0],
      ["Marrom", "#6B4A35", 64900, 1],
    ]);
    expect(variants[1].id).toBe(variantId);

    const rows = (await db.query<{ id: string; variant_id: string | null; approved_by: string | null }>(
      "select id, variant_id, approved_by from public.product_media where color_job_id = $1 order by sort_order",
      [jobId],
    )).rows;
    expect(rows.slice(0, 2).every((r) => r.variant_id === variantId && r.approved_by === USERS.editor)).toBe(true);
    // A não escolhida continua sem aprovação e sem cor.
    expect(rows[2]).toMatchObject({ variant_id: null, approved_by: null });

    const after = (await db.query<{ updated_at: string }>("select updated_at from public.products where id = $1", [id])).rows[0].updated_at;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
    const audit = await db.query("select 1 from public.audit_events where action = 'media.ai_approved' and entity_id = $1", [id]);
    expect(audit.rows.length).toBeGreaterThanOrEqual(2);
  });

  it("segunda cor: não pede a cor atual de novo; recusa nome repetido, fotos de outra cor e foto já publicada", async () => {
    const id = await createProduct();
    const photo = await addCatalogPhoto(id);
    const first = await requestColor("editor", id, colorParams([photo]));
    const firstMedia = await finishColorJob(id, first, 1);
    await publish("editor", first, firstMedia, { priceCents: 64900 }, { name: "Azul", colorHex: "#2F3E62", priceCents: 59900 });

    const second = await requestColor("editor", id, colorParams([photo], "Vermelho", "#9C2A2A"));
    const secondMedia = await finishColorJob(id, second, 1);
    await expect(publish("editor", second, secondMedia, { priceCents: 64900 }, { name: "Azul", colorHex: "#2F3E62", priceCents: 1 })).rejects.toThrow(
      /já está cadastrada/,
    );
    await expect(publish("editor", second, firstMedia, { priceCents: 64900 })).rejects.toThrow(/não é desta cor ou já foi publicada/);
    await expect(publish("editor", second, [], { priceCents: 64900 })).rejects.toThrow(/ao menos uma foto/);
    await publish("editor", second, secondMedia, { priceCents: 69900 });
    expect((await variantsOf(id)).map((v) => v.name)).toEqual(["Azul", "Marrom", "Vermelho"]);

    const again = await requestColor("editor", id, colorParams([photo], "vermelho", "#9C2A2A"));
    const againMedia = await finishColorJob(id, again, 1);
    await expect(publish("editor", again, againMedia, { priceCents: 69900 })).rejects.toThrow(/já tem uma cor com esse nome/);
  });

  it("não mistura cor com tamanho, e só publica tarefa de cor concluída", async () => {
    const id = await createProduct({
      variants: [{ name: "Casal", sku: null, priceCents: 150000, stockQuantity: null, size: "casal", widthCm: 138, lengthCm: 188 }],
    });
    const photo = await addCatalogPhoto(id);
    const jobId = await requestColor("editor", id, colorParams([photo]));
    await expect(publish("editor", jobId, [], { priceCents: 1 })).rejects.toThrow(/não encontrada ou ainda não terminou/);
    const media = await finishColorJob(id, jobId, 1);
    await expect(publish("editor", jobId, media, { priceCents: 1 }, { name: "Azul", colorHex: "#2F3E62", priceCents: 1 })).rejects.toThrow(
      /variações sem cor/,
    );
  });

  it("quem não é da equipe não publica; editor não publica cor em produto já publicado", async () => {
    const id = await createProduct();
    const photo = await addCatalogPhoto(id);
    const jobId = await requestColor("editor", id, colorParams([photo]));
    const media = await finishColorJob(id, jobId, 1);
    await expect(publish("outsider", jobId, media, { priceCents: 1 }, { name: "Azul", colorHex: "#2F3E62", priceCents: 1 })).rejects.toThrow(
      /não encontrada/,
    );
    await expect(
      as(db, "anon", (tx) => tx.query("select public.publish_color_variant($1, $2::uuid[], '{}'::jsonb, null)", [jobId, media])),
    ).rejects.toThrow(/permission denied/);

    // Para publicar o produto: foto principal real e modelo 3D (exigido em cadeiras).
    await db.query(
      `insert into public.product_media (product_id, storage_path, media_type, alt_text, is_primary, width, height)
       values ($1, $2, 'image', 'Foto real da cadeira', true, 1600, 1200),
              ($1, $3, 'model_3d', 'Modelo 3D da cadeira', false, null, null)`,
      [id, `products/${id}/real.jpg`, `products/${id}/modelo.glb`],
    );
    await db.query("update public.products set status = 'published' where id = $1", [id]);
    await expect(publish("editor", jobId, media, { priceCents: 1 }, { name: "Azul", colorHex: "#2F3E62", priceCents: 1 })).rejects.toThrow(
      /Sem permissão/,
    );
    const variantId = await publish("admin", jobId, media, { priceCents: 64900 }, { name: "Azul", colorHex: "#2F3E62", priceCents: 59900 });
    expect(variantId).toBeTruthy();
    // Publicada: a loja vê a cor e a foto aprovada.
    const seen = await as(db, "anon", (tx) => tx.query("select id from public.product_media where id = $1", [media[0]]));
    expect(seen.rows).toHaveLength(1);
  });
});

describe("cores: apagar e duplicar", () => {
  it("tirar a cor em 'Preço e estoque' apaga as fotos de cor dela (não viram fotos do produto)", async () => {
    const id = await createProduct();
    const photo = await addCatalogPhoto(id);
    const jobId = await requestColor("editor", id, colorParams([photo]));
    const media = await finishColorJob(id, jobId, 2);
    await publish("editor", jobId, media, { priceCents: 64900 }, { name: "Azul", colorHex: "#2F3E62", priceCents: 59900 });
    const [azul] = await variantsOf(id);
    // Salva só com a cor atual: a Marrom some, e as fotos dela também.
    await as(db, "editor", (tx) =>
      tx.query("select public.save_product($1, $2::jsonb)", [
        id,
        JSON.stringify(
          productPayload({
            categoryId: chairs,
            priceCents: 59900,
            variants: [{ id: azul.id, name: "Azul", sku: null, priceCents: 59900, stockQuantity: null, size: null, widthCm: null, lengthCm: null, colorHex: "#2F3E62" }],
          }),
        ),
      ]),
    );
    expect((await variantsOf(id)).map((v) => v.name)).toEqual(["Azul"]);
    const left = await db.query("select id from public.product_media where color_job_id = $1", [jobId]);
    expect(left.rows).toEqual([]);
    // A foto de catálogo continua.
    expect((await db.query("select id from public.product_media where id = $1", [photo])).rows).toHaveLength(1);
  });

  it("duplicar não leva fotos de IA sem conferência; as aprovadas e as de cor seguem a cor da cópia", async () => {
    const id = await createProduct();
    const photo = await addCatalogPhoto(id);
    // Foto de catálogo ainda sem conferência.
    await db.query(
      `insert into public.product_media (product_id, storage_path, media_type, alt_text, ai_generated) values ($1, $2, 'image', 'Pendente de conferência', true)`,
      [id, `products/${id}/pendente.jpg`],
    );
    const jobId = await requestColor("editor", id, colorParams([photo]));
    const media = await finishColorJob(id, jobId, 2);
    await publish("editor", jobId, media.slice(0, 1), { priceCents: 64900 }, { name: "Azul", colorHex: "#2F3E62", priceCents: 59900 });

    const copy = await as(db, "editor", async (tx) => (await tx.query<{ d: string }>("select public.duplicate_product($1) as d", [id])).rows[0].d);
    const copied = (await db.query<{ storage_path: string; ai_generated: boolean; approved_at: string | null; variant_id: string | null; color_job_id: string | null }>(
      "select storage_path, ai_generated, approved_at, variant_id, color_job_id from public.product_media where product_id = $1 order by storage_path",
      [copy],
    )).rows;
    // A pendente e a foto de cor não publicada ficaram de fora.
    expect(copied.map((m) => m.storage_path).sort()).toEqual([`products/${id}/catalogo-frente.jpg`, `products/${id}/cor-${jobId}-0.jpg`].sort());
    expect(copied.every((m) => m.ai_generated && m.approved_at !== null)).toBe(true);
    const copyVariants = await variantsOf(copy);
    const colorPhoto = copied.find((m) => m.color_job_id === jobId)!;
    expect(colorPhoto.variant_id).toBe(copyVariants.find((v) => v.name === "Marrom")!.id);
  });
});

describe("cores: salvar o formulário depois de publicar a cor", () => {
  const formPayload = (id: string, expectedUpdatedAt?: string, variants: unknown[] = []) =>
    JSON.stringify(productPayload({ categoryId: chairs, priceCents: 59900, variants, name: "Cadeira renomeada", ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) }));
  const version = async (id: string) =>
    (await db.query<{ v: string }>("select updated_at::text as v from public.products where id = $1", [id])).rows[0].v;

  it("formulário velho (aberto antes da cor) é recusado e não apaga a cor nem as fotos", async () => {
    const id = await createProduct();
    const opened = await version(id);
    const photo = await addCatalogPhoto(id);
    const jobId = await requestColor("editor", id, colorParams([photo]));
    const media = await finishColorJob(id, jobId, 2);
    await publish("editor", jobId, media, { priceCents: 64900 }, { name: "Azul", colorHex: "#2F3E62", priceCents: 59900 });

    await expect(
      as(db, "editor", (tx) => tx.query("select public.save_product($1, $2::jsonb)", [id, formPayload(id, opened)])),
    ).rejects.toThrow(/O produto mudou desde que você abriu esta página/);
    expect((await variantsOf(id)).map((v) => v.name)).toEqual(["Azul", "Marrom"]);
    expect((await db.query("select id from public.product_media where color_job_id = $1", [jobId])).rows).toHaveLength(2);

    // Com a versão atual (o formulário recarregado, já com as cores), salva normalmente.
    const variants = (await variantsOf(id)).map((v) => ({
      id: v.id, name: v.name, sku: null, priceCents: v.price_cents, stockQuantity: null, size: null, widthCm: null, lengthCm: null, colorHex: v.attributes.colorHex,
    }));
    const current = await version(id);
    await as(db, "editor", (tx) => tx.query("select public.save_product($1, $2::jsonb)", [id, formPayload(id, current, variants)]));
    expect((await db.query<{ name: string }>("select name from public.products where id = $1", [id])).rows[0].name).toBe("Cadeira renomeada");
    expect((await variantsOf(id)).map((v) => v.name)).toEqual(["Azul", "Marrom"]);
  });

  it("sem a versão (chamadas antigas), salva como antes", async () => {
    const id = await createProduct();
    await as(db, "editor", (tx) => tx.query("select public.save_product($1, $2::jsonb)", [id, formPayload(id)]));
    expect((await db.query<{ name: string }>("select name from public.products where id = $1", [id])).rows[0].name).toBe("Cadeira renomeada");
  });
});

describe("cores: publicar (regras extras)", () => {
  it("nome igual sem acento é a mesma cor; cor atual sem #RRGGBB é recusada; foto repetida na lista não atrapalha", async () => {
    const id = await createProduct();
    const photo = await addCatalogPhoto(id);
    const first = await requestColor("editor", id, colorParams([photo], "Café", "#6B4A35"));
    const firstMedia = await finishColorJob(id, first, 1);
    await expect(publish("editor", first, firstMedia, { priceCents: 1 }, { name: "Azul", colorHex: "azul", priceCents: 1 })).rejects.toThrow(
      /formato #RRGGBB/,
    );
    await expect(publish("editor", first, firstMedia, { priceCents: 1 }, { name: "  ", colorHex: "#2F3E62", priceCents: 1 })).rejects.toThrow(
      /cor atual do produto/,
    );
    await publish("editor", first, [firstMedia[0], firstMedia[0]], { priceCents: 64900 }, { name: "Azul", colorHex: "#2F3E62", priceCents: 59900 });

    const again = await requestColor("editor", id, colorParams([photo], "cafe", "#6B4A35"));
    const againMedia = await finishColorJob(id, again, 1);
    await expect(publish("editor", again, againMedia, { priceCents: 1 })).rejects.toThrow(/já tem uma cor com esse nome/);
  });
});

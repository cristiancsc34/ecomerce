import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, productPayload } from "./helpers";

let db: PGlite;
let chairs: string;

beforeAll(async () => {
  db = await createDatabase();
  chairs = (await db.query<{ id: string }>("select id from public.categories where slug = 'cadeiras'")).rows[0].id;
});

async function createProduct(overrides: Record<string, unknown> = {}) {
  return as(db, "editor", async (tx) => {
    const r = await tx.query<{ save_product: string }>("select public.save_product(null, $1::jsonb)", [
      JSON.stringify(productPayload({ categoryId: chairs, variants: [], priceCents: 59900, ...overrides })),
    ]);
    return r.rows[0].save_product;
  });
}

async function addImage(productId: string) {
  await db.query(
    `insert into public.product_media (product_id, storage_path, media_type, alt_text, is_primary, width, height)
     values ($1, $2, 'image', 'Foto real da cadeira de frente', true, 1600, 1200)`,
    [productId, `products/${productId}/foto.jpg`],
  );
}

async function enqueue(actor: "editor" | "outsider" | "anon", productId: string, path = `products/${productId}/originais/a.jpg`) {
  return as(db, actor, (tx) =>
    tx.query<{ id: string }>(
      "insert into public.ai_jobs (product_id, kind, input_path) values ($1, 'background_removal', $2) returning id",
      [productId, path],
    ),
  );
}

/** O processador usa a chave de serviço. */
async function asService<T>(fn: (tx: Parameters<Parameters<PGlite["transaction"]>[0]>[0]) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return fn(tx);
  });
}

describe("jobs de IA", () => {
  it("visitante e usuário de fora não veem nem criam jobs", async () => {
    const id = await createProduct();
    await expect(enqueue("anon", id)).rejects.toThrow(/permission denied/);
    await expect(enqueue("outsider", id)).rejects.toThrow(/row-level security/);
    await expect(as(db, "anon", (tx) => tx.query("select * from public.ai_jobs"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", (tx) => tx.query("select * from public.ai_workers"))).rejects.toThrow(/permission denied/);
    const seen = await as(db, "outsider", (tx) => tx.query("select id from public.ai_jobs"));
    expect(seen.rows).toEqual([]);
  });

  it("editor cria job só para arquivo do próprio produto, sempre na fila", async () => {
    const id = await createProduct();
    const other = await createProduct();
    const ok = await enqueue("editor", id);
    expect(ok.rows).toHaveLength(1);
    await expect(enqueue("editor", id, `products/${other}/originais/x.jpg`)).rejects.toThrow(/row-level security/);
    await expect(
      as(db, "editor", (tx) =>
        tx.query("insert into public.ai_jobs (product_id, kind, input_path, status) values ($1, 'background_removal', $2, 'succeeded')", [
          id,
          `products/${id}/originais/b.jpg`,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("editor não altera o resultado de um job nem cria job em produto publicado", async () => {
    const id = await createProduct();
    const job = (await enqueue("editor", id)).rows[0].id;
    await expect(
      as(db, "editor", (tx) => tx.query("update public.ai_jobs set status = 'succeeded' where id = $1", [job])),
    ).rejects.toThrow(/permission denied/);

    const published = await createProduct();
    await addImage(published);
    await db.query(
      `insert into public.product_media (product_id, storage_path, media_type, alt_text) values ($1, $2, 'model_3d', 'Modelo 3D da cadeira')`,
      [published, `products/${published}/m.glb`],
    );
    await as(db, "admin", (tx) => tx.query("update public.products set status = 'published' where id = $1", [published]));
    await expect(enqueue("editor", published)).rejects.toThrow(/row-level security/);
  });

  it("só o processador pega jobs da fila, do mais antigo e do tipo que sabe fazer", async () => {
    const id = await createProduct();
    await db.query("delete from public.ai_jobs");
    const first = (await enqueue("editor", id, `products/${id}/originais/1.jpg`)).rows[0].id;
    await enqueue("editor", id, `products/${id}/originais/2.jpg`);
    await as(db, "editor", (tx) =>
      tx.query("insert into public.ai_jobs (product_id, kind, input_path) values ($1, 'model_3d', $2)", [id, `products/${id}/recortes/r.png`]),
    );

    await expect(
      as(db, "editor", (tx) => tx.query("select * from public.claim_ai_job(array['background_removal']::public.ai_job_kind[])")),
    ).rejects.toThrow(/permission denied/);

    const claimed = await asService((tx) =>
      tx.query<{ id: string; status: string; attempts: number }>(
        "select id, status, attempts from public.claim_ai_job(array['background_removal']::public.ai_job_kind[])",
      ),
    );
    expect(claimed.rows).toEqual([{ id: first, status: "running", attempts: 1 }]);

    // Sem 3D habilitado, o job de 3D fica esperando.
    await asService((tx) => tx.query("select * from public.claim_ai_job(array['background_removal']::public.ai_job_kind[])"));
    const none = await asService((tx) => tx.query("select * from public.claim_ai_job(array['background_removal']::public.ai_job_kind[])"));
    expect(none.rows).toEqual([]);
    const waiting = await db.query<{ kind: string; status: string }>("select kind, status from public.ai_jobs where kind = 'model_3d'");
    expect(waiting.rows).toEqual([{ kind: "model_3d", status: "queued" }]);
  });
});

describe("categoria que exige 3D", () => {
  it("não publica cadeira sem modelo 3D; com 3D, publica", async () => {
    const id = await createProduct();
    await addImage(id);
    await expect(
      as(db, "admin", (tx) => tx.query("update public.products set status = 'published' where id = $1", [id])),
    ).rejects.toThrow(/gere ou envie o modelo 3D/);

    await db.query(
      `insert into public.product_media (product_id, storage_path, media_type, alt_text) values ($1, $2, 'model_3d', 'Modelo 3D da cadeira')`,
      [id, `products/${id}/m.glb`],
    );
    await as(db, "admin", (tx) => tx.query("update public.products set status = 'published' where id = $1", [id]));
    const row = await db.query<{ status: string }>("select status from public.products where id = $1", [id]);
    expect(row.rows[0].status).toBe("published");
  });

  it("colchões continuam sem exigir 3D", async () => {
    const mattress = (await db.query<{ id: string }>("select id from public.categories where slug = 'colchoes'")).rows[0].id;
    const id = await createProduct({ categoryId: mattress });
    await addImage(id);
    await as(db, "admin", (tx) => tx.query("update public.products set status = 'published' where id = $1", [id]));
  });
});

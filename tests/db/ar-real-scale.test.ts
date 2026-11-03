import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, productPayload } from "./helpers";

let db: PGlite;
let productId: string;

beforeAll(async () => {
  db = await createDatabase();
  const categoryId = (await db.query<{ id: string }>("select id from public.categories where slug = 'colchoes'")).rows[0].id;
  productId = await as(db, "admin", async (tx) => {
    const r = await tx.query<{ save_product: string }>("select public.save_product(null, $1::jsonb)", [
      JSON.stringify(productPayload({ categoryId })),
    ]);
    return r.rows[0].save_product;
  });
});

const insertMedia = (type: string, extra: Record<string, unknown>) =>
  as(db, "admin", (tx) =>
    tx.query<{ id: string }>(
      `insert into public.product_media (product_id, storage_path, media_type, alt_text, usdz_storage_path, real_scale, bounds_cm)
       values ($1, $2, $3::public.media_type, 'Modelo', $4, $5, $6::jsonb) returning id`,
      [
        productId,
        `products/${productId}/${Math.random().toString(36).slice(2)}.${type === "image" ? "jpg" : "glb"}`,
        type,
        extra.usdz ?? null,
        extra.realScale ?? false,
        extra.bounds ? JSON.stringify(extra.bounds) : null,
      ],
    ),
  );

describe("realidade aumentada em tamanho real (banco)", () => {
  it("modelo 3D conferido guarda o .usdz, a marcação e a caixa", async () => {
    const r = await insertMedia("model_3d", {
      usdz: `products/${productId}/modelo.usdz`,
      realScale: true,
      bounds: { widthCm: 78, depthCm: 90, heightCm: 100 },
    });
    expect(r.rows).toHaveLength(1);
  });

  it("tamanho real exige o .usdz e a caixa", async () => {
    await expect(insertMedia("model_3d", { realScale: true })).rejects.toThrow(/product_media_real_scale_files/);
  });

  it("foto não tem .usdz nem tamanho real", async () => {
    await expect(insertMedia("image", { usdz: "products/x/y.usdz" })).rejects.toThrow(/product_media_ar_only_model/);
  });

  it("o bucket aceita o .usdz", async () => {
    const r = await db.query<{ allowed_mime_types: string[] }>("select allowed_mime_types from storage.buckets where id = 'product-media'");
    expect(r.rows[0].allowed_mime_types).toContain("model/vnd.usdz+zip");
    expect(r.rows[0].allowed_mime_types).toContain("model/gltf-binary");
  });

  it("a vitrine (anon) pode ler as colunas novas", async () => {
    const r = await as(db, "anon", (tx) => tx.query("select usdz_storage_path, real_scale, bounds_cm from public.product_media"));
    // Produto não publicado: nenhuma linha, mas sem erro de permissão de coluna.
    expect(r.rows).toEqual([]);
  });
});

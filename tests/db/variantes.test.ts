import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase, productPayload } from "./helpers";

let db: PGlite;
let categoryId: string;

beforeAll(async () => {
  db = await createDatabase();
  categoryId = (await db.query<{ id: string }>("select id from public.categories where slug = 'colchoes'")).rows[0].id;
});

const color = (name: string, colorHex: string | undefined, priceCents = 189900) => ({
  name,
  sku: null,
  priceCents,
  stockQuantity: null,
  size: null,
  widthCm: null,
  lengthCm: null,
  ...(colorHex ? { colorHex } : {}),
});

async function save(id: string | null, variants: unknown[]) {
  return as(db, "admin", async (tx) => {
    const r = await tx.query<{ save_product: string }>("select public.save_product($1, $2::jsonb)", [
      id,
      JSON.stringify(productPayload({ categoryId, variants })),
    ]);
    return r.rows[0].save_product;
  });
}

const variantsOf = (productId: string) =>
  db.query<{ id: string; name: string; attributes: Record<string, unknown> }>(
    "select id, name, attributes from public.product_variants where product_id = $1 order by sort_order",
    [productId],
  );

describe("variantes de cor (banco)", () => {
  it("o painel salva a cor da variação e não apaga ao salvar de novo", async () => {
    const id = await save(null, [color("Azul", "#2F3E62"), color("Marrom", "#6B4A35")]);
    let rows = (await variantsOf(id)).rows;
    expect(rows.map((r) => [r.name, r.attributes.colorHex])).toEqual([
      ["Azul", "#2F3E62"],
      ["Marrom", "#6B4A35"],
    ]);
    // Salvar de novo (com os ids) mantém a cor.
    await save(id, rows.map((r) => ({ id: r.id, ...color(r.name, r.attributes.colorHex as string) })));
    rows = (await variantsOf(id)).rows;
    expect(rows.map((r) => r.attributes.colorHex)).toEqual(["#2F3E62", "#6B4A35"]);
  });

  it("cor fora do formato #RRGGBB é recusada", async () => {
    await expect(save(null, [color("Rosa", "rosa")])).rejects.toThrow(/product_variants_color_hex/);
  });

  it("foto ou modelo 3D de uma variação precisa ser do mesmo produto", async () => {
    const a = await save(null, [color("Azul", "#2F3E62")]);
    const b = await save(null, [color("Bege", "#CDB797")]);
    const variantOfB = (await variantsOf(b)).rows[0].id;
    const insert = (productId: string, variantId: string) =>
      as(db, "admin", (tx) =>
        tx.query(
          `insert into public.product_media (product_id, storage_path, media_type, alt_text, variant_id)
           values ($1, $2, 'image', 'Foto', $3)`,
          [productId, `products/${productId}/${Math.random().toString(36).slice(2)}.jpg`, variantId],
        ),
      );
    await expect(insert(a, variantOfB)).rejects.toThrow(/não pertence a este produto/);
    await expect(insert(b, variantOfB)).resolves.toBeTruthy();
  });

  it("apagar a variação solta a mídia (volta a ser do produto)", async () => {
    const id = await save(null, [color("Azul", "#2F3E62"), color("Vermelho", "#9C2A2A")]);
    const [, red] = (await variantsOf(id)).rows;
    await as(db, "admin", (tx) =>
      tx.query(
        `insert into public.product_media (product_id, storage_path, media_type, alt_text, variant_id)
         values ($1, 'products/x/vermelho.jpg', 'image', 'Foto vermelha', $2)`,
        [id, red.id],
      ),
    );
    await save(id, [color("Azul", "#2F3E62")]); // a variação vermelha sai
    const media = await db.query<{ variant_id: string | null }>("select variant_id from public.product_media where product_id = $1", [id]);
    expect(media.rows).toEqual([{ variant_id: null }]);
  });

  it("a vitrine (anon) pode ler a variação da mídia", async () => {
    await expect(as(db, "anon", (tx) => tx.query("select variant_id from public.product_media"))).resolves.toBeTruthy();
  });
});

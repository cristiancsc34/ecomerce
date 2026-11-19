import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase } from "./helpers";

let db: PGlite;

beforeAll(async () => {
  db = await createDatabase();
});

const slug = () => `cat-${Math.random().toString(36).slice(2, 8)}`;

describe("SEO das categorias (banco)", () => {
  it("a equipe grava título, resumo e texto da categoria; o público lê", async () => {
    const s = slug();
    await as(db, "editor", (tx) =>
      tx.query(
        "insert into public.categories (slug, name, seo_title, seo_description, content) values ($1, 'Sofás', $2, $3, $4)",
        [s, "Sofás para sala", "Sofás com medidas e fotos de todos os ângulos.", "Como escolher o sofá.\n\nMeça a sala."],
      ),
    );
    const row = await as(db, "anon", (tx) =>
      tx.query<{ seo_title: string; seo_description: string; content: string }>(
        "select seo_title, seo_description, content from public.categories where slug = $1",
        [s],
      ),
    );
    expect(row.rows[0]).toEqual({
      seo_title: "Sofás para sala",
      seo_description: "Sofás com medidas e fotos de todos os ângulos.",
      content: "Como escolher o sofá.\n\nMeça a sala.",
    });
  });

  it("os campos são opcionais (categorias antigas continuam valendo)", async () => {
    const r = await db.query<{ n: number }>(
      "select count(*)::int as n from public.categories where seo_title is null and seo_description is null and content is null",
    );
    expect(r.rows[0].n).toBeGreaterThan(0);
  });

  it("recusa textos longos demais ou só com espaços", async () => {
    const insert = (col: string, value: string) =>
      as(db, "admin", (tx) => tx.query(`insert into public.categories (slug, name, ${col}) values ($1, 'X', $2)`, [slug(), value]));
    await expect(insert("seo_title", "a".repeat(71))).rejects.toThrow(/categories_seo_title_length/);
    await expect(insert("seo_description", "a".repeat(171))).rejects.toThrow(/categories_seo_description_length/);
    await expect(insert("content", "a".repeat(4001))).rejects.toThrow(/categories_content_length/);
    await expect(insert("content", "   ")).rejects.toThrow(/categories_content_length/);
  });

  it("visitante não altera o texto da categoria", async () => {
    await expect(
      as(db, "anon", (tx) => tx.query("update public.categories set content = 'invadido' where slug = 'colchoes'")),
    ).rejects.toThrow();
    const r = await db.query<{ content: string | null }>("select content from public.categories where slug = 'colchoes'");
    expect(r.rows[0].content).toBeNull();
  });
});

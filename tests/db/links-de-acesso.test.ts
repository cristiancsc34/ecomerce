import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase } from "./helpers";

/** Links de acesso ao painel (supabase/migrations/20261104000300_links_de_acesso.sql). */

let db: PGlite;
const HASH = "a".repeat(64);

beforeAll(async () => {
  db = await createDatabase({ seed: false });
});

const novo = (hash: string, areas = "{itens}") =>
  `insert into public.admin_access_links (label, areas, token_hash) values ('Depósito do João', '${areas}', '${hash}') returning id`;

describe("links de acesso", () => {
  it("só o administrador cria e vê os links", async () => {
    const criado = await as(db, "admin", (tx) => tx.query<{ id: string }>(novo(HASH)));
    expect(criado.rows).toHaveLength(1);
    expect((await as(db, "admin", (tx) => tx.query("select id from public.admin_access_links"))).rows).toHaveLength(1);
    await expect(as(db, "editor", (tx) => tx.query(novo("b".repeat(64))))).rejects.toThrow(/row-level security/);
    expect((await as(db, "editor", (tx) => tx.query("select id from public.admin_access_links"))).rows).toEqual([]);
    await expect(as(db, "anon", (tx) => tx.query("select id from public.admin_access_links"))).rejects.toThrow(/permission denied/);
  });

  it("nem o administrador revoga ou edita direto: isso passa pelo servidor (conta do link no Auth)", async () => {
    await expect(as(db, "admin", (tx) => tx.query("update public.admin_access_links set revoked_at = now()"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(as(db, "admin", (tx) => tx.query("delete from public.admin_access_links"))).rejects.toThrow(/permission denied/);
  });

  it("precisa de pelo menos uma área conhecida, nome e hash no formato certo; o hash não repete", async () => {
    await expect(db.query(novo("c".repeat(64), "{}"))).rejects.toThrow(/admin_access_links_areas/);
    await expect(db.query(novo("c".repeat(64), "{deposito}"))).rejects.toThrow(/admin_access_links_areas/);
    await expect(db.query(novo("curto"))).rejects.toThrow(/admin_access_links_token_hash/);
    await expect(db.query(novo(HASH))).rejects.toThrow(/duplicate key/);
    await expect(
      db.query(`insert into public.admin_access_links (label, areas, token_hash) values ('x', '{itens}', '${"d".repeat(64)}')`),
    ).rejects.toThrow(/admin_access_links_label/);
  });
});

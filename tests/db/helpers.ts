import { readdirSync, readFileSync } from "node:fs";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);

export const USERS = {
  admin: "00000000-0000-4000-8000-00000000a001",
  editor: "00000000-0000-4000-8000-00000000e001",
  outsider: "00000000-0000-4000-8000-00000000f001",
} as const;

/** Postgres embutido com os stubs do Supabase, as migrações e o seed. */
export async function createDatabase({ seed = true } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(new URL("tests/db/supabase-stubs.sql", root), "utf8"));
  const dir = new URL("supabase/migrations/", root);
  for (const file of readdirSync(dir).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8"));
  }
  if (seed) await db.exec(readFileSync(new URL("supabase/seed.sql", root), "utf8"));
  await db.exec(`
    insert into auth.users (id, email) values
      ('${USERS.admin}', 'admin@teste'),
      ('${USERS.editor}', 'editor@teste'),
      ('${USERS.outsider}', 'cliente@teste');
    insert into public.admin_users (user_id, role) values
      ('${USERS.admin}', 'admin'),
      ('${USERS.editor}', 'editor');
  `);
  return db;
}

export type Actor = "anon" | keyof typeof USERS;

/**
 * Executa como um papel do Supabase: anon, ou authenticated com o JWT do
 * usuário. Tudo numa transação; erros propagam (e a transação é desfeita).
 */
export async function as<T>(db: PGlite, actor: Actor, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (actor === "anon") {
      await tx.exec("set local role anon");
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    } else {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USERS[actor], role: "authenticated" }),
      ]);
    }
    return fn(tx);
  });
}

export function productPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Colchão Real",
    slug: `colchao-real-${Math.random().toString(36).slice(2, 8)}`,
    shortDescription: "Curta",
    description: "Descrição revisada.",
    categoryId: null,
    priceCents: null,
    compareAtPriceCents: null,
    sku: null,
    stockQuantity: null,
    dimensions: { heightCm: 25 },
    attributes: { firmness: "medio" },
    faq: [],
    seoTitle: null,
    seoDescription: null,
    variants: [
      { name: "Casal", sku: null, priceCents: 150000, stockQuantity: null, size: "casal", widthCm: 138, lengthCm: 188 },
    ],
    ...overrides,
  };
}

import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Testes contra um Supabase de verdade (Auth + PostgREST + Storage), rodando
 * localmente com `npx supabase start`. Desligados por padrão:
 *
 *   npm run test:integration
 *
 * Usa NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e
 * SUPABASE_SERVICE_ROLE_KEY de .env.local. Cria usuários de teste próprios.
 */
const enabled = process.env.SUPABASE_INTEGRATION === "1";
if (enabled && existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const PNG_1x1 = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
);

function client(): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signedIn(email: string, password: string) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

describe.skipIf(!enabled)("Supabase real (local)", () => {
  const suffix = Date.now().toString(36);
  const outsider = { email: `cliente-${suffix}@teste.local`, password: `Cliente-${suffix}-!9` };
  const editor = { email: `editor-${suffix}@teste.local`, password: `Editor-${suffix}-!9` };
  let service: SupabaseClient;

  beforeAll(async () => {
    service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const u of [outsider, editor]) {
      const { error } = await service.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
      if (error) throw error;
    }
    const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
    const editorId = data.users.find((u) => u.email === editor.email)!.id;
    const { error } = await service.from("admin_users").insert({ user_id: editorId, role: "editor" });
    if (error) throw error;
  });

  it("cadastro público está desligado", async () => {
    const { error } = await client().auth.signUp({ email: `intruso-${suffix}@teste.local`, password: "Intruso-123456!" });
    expect(error).not.toBeNull();
  });

  it("anônimo não vê rascunhos/demonstrações e não escreve", async () => {
    const c = client();
    const { data } = await c.from("products").select("id,status,is_demo");
    expect((data ?? []).every((p) => p.status === "published" && !p.is_demo)).toBe(true);
    const insert = await c.from("products").insert({ name: "x", slug: `x-${suffix}` });
    expect(insert.error).not.toBeNull();
    const rpc = await c.rpc("save_product", { p_product_id: null, p_data: {} });
    expect(rpc.error).not.toBeNull();
  });

  it("anônimo não envia arquivo nem lista o bucket", async () => {
    const c = client();
    const up = await c.storage.from("product-media").upload(`products/${suffix}/a.png`, PNG_1x1, { contentType: "image/png" });
    expect(up.error).not.toBeNull();
    const list = await c.storage.from("product-media").list("products");
    expect(list.data ?? []).toEqual([]);
  });

  it("usuário logado fora da equipe não vê rascunhos, não cria produto e não envia arquivo", async () => {
    const c = await signedIn(outsider.email, outsider.password);
    const { data } = await c.from("products").select("id,status");
    expect((data ?? []).every((p) => p.status === "published")).toBe(true);
    const rpc = await c.rpc("save_product", {
      p_product_id: null,
      p_data: { name: "Hack", slug: `hack-${suffix}`, variants: [] },
    });
    expect(rpc.error).not.toBeNull();
    const promote = await c.from("admin_users").insert({ user_id: (await c.auth.getUser()).data.user!.id, role: "admin" });
    expect(promote.error).not.toBeNull();
    const up = await c.storage.from("product-media").upload(`products/${suffix}/b.png`, PNG_1x1, { contentType: "image/png" });
    expect(up.error).not.toBeNull();
  });

  it("editor cria rascunho e envia foto, mas não publica", async () => {
    const c = await signedIn(editor.email, editor.password);
    const { data: id, error } = await c.rpc("save_product", {
      p_product_id: null,
      p_data: {
        name: "Integração",
        slug: `integracao-${suffix}`,
        description: "Teste",
        priceCents: 1000,
        dimensions: {},
        attributes: {},
        faq: [],
        variants: [],
      },
    });
    expect(error).toBeNull();
    const path = `products/${id}/${suffix}.png`;
    const up = await c.storage.from("product-media").upload(path, PNG_1x1, { contentType: "image/png" });
    expect(up.error).toBeNull();

    // Fora da pasta products/: recusado.
    const outside = await c.storage.from("product-media").upload(`outra/${suffix}.png`, PNG_1x1, { contentType: "image/png" });
    expect(outside.error).not.toBeNull();

    // Tipo não permitido pelo bucket: recusado.
    const html = await c.storage.from("product-media").upload(`products/${id}/x.html`, new TextEncoder().encode("<h1>x</h1>"), {
      contentType: "text/html",
    });
    expect(html.error).not.toBeNull();

    const publish = await c.from("products").update({ status: "published" }).eq("id", id);
    expect(publish.error?.message).toMatch(/Somente administradores/);

    await service.storage.from("product-media").remove([path]);
    await service.from("products").delete().eq("id", id);
  });

  it("editor não sobrescreve nem apaga pelo Storage a foto de um produto publicado", async () => {
    const c = await signedIn(editor.email, editor.password);
    const { data: id, error } = await c.rpc("save_product", {
      p_product_id: null,
      p_data: {
        name: "Publicado",
        slug: `publicado-${suffix}`,
        description: "Teste",
        priceCents: 1000,
        dimensions: {},
        attributes: {},
        faq: [],
        variants: [],
      },
    });
    expect(error).toBeNull();
    const path = `products/${id}/${suffix}-pub.png`;
    expect((await c.storage.from("product-media").upload(path, PNG_1x1, { contentType: "image/png" })).error).toBeNull();

    // Publicado por fora (service role), com a foto como principal.
    const { data: category } = await service.from("categories").select("id").eq("slug", "colchoes").single();
    const media = await service.from("product_media").insert({
      product_id: id,
      storage_path: path,
      media_type: "image",
      alt_text: "Foto real do produto",
      is_primary: true,
      width: 1,
      height: 1,
    });
    expect(media.error).toBeNull();
    const pub = await service.from("products").update({ category_id: category!.id, status: "published" }).eq("id", id);
    expect(pub.error).toBeNull();

    const overwrite = await c.storage.from("product-media").upload(path, PNG_1x1, { contentType: "image/png", upsert: true });
    expect(overwrite.error).not.toBeNull();

    await c.storage.from("product-media").remove([path]);
    const stillThere = await service.storage.from("product-media").list(`products/${id}`);
    expect((stillThere.data ?? []).map((f) => f.name)).toContain(`${suffix}-pub.png`);

    await service.storage.from("product-media").remove([path]);
    await service.from("products").update({ status: "archived" }).eq("id", id);
    await service.from("products").delete().eq("id", id);
  });
});

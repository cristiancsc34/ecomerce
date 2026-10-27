import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { BUCKET, processNext } from "../../scripts/ai-worker.mjs";

/**
 * Encanamento do processador contra o Supabase local (fila, Storage, mídia).
 * Os motores de IA são trocados por versões rápidas que escrevem arquivos
 * válidos — os modelos em si são verificados à parte (docs/ESTUDIO-IA.md).
 */
const enabled = process.env.SUPABASE_INTEGRATION === "1";
if (enabled && existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
  "base64",
);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function glb(): Buffer {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" } }).padEnd(28, " "));
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "latin1");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length, 8);
  const chunk = Buffer.alloc(8);
  chunk.writeUInt32LE(json.length, 0);
  chunk.write("JSON", 4, "latin1");
  return Buffer.concat([header, chunk, json]);
}

const fakeEngines = {
  async backgroundRemoval(_input: string, dir: string) {
    const cutout = path.join(dir, "recorte.png");
    const studio = path.join(dir, "estudio.jpg");
    await writeFile(cutout, PNG);
    await writeFile(studio, JPEG);
    return { cutout, studio, meta: { width: 1600, height: 1200, droppedBackgroundObject: true } };
  },
  async model3d(_input: string, dir: string) {
    const out = path.join(dir, "modelo.glb");
    await writeFile(out, glb());
    return { glb: out, meta: { faces: 12, seconds: 1 } };
  },
};

const brokenEngines = {
  ...fakeEngines,
  async backgroundRemoval() {
    throw new Error("Nenhum objeto encontrado na foto.");
  },
};

describe.skipIf(!enabled)("processador do estúdio de IA (Supabase local)", () => {
  const suffix = Date.now().toString(36);
  const editor = { email: `editor-ia-${suffix}@teste.local`, password: `Editor-${suffix}-!9` };
  let service: SupabaseClient;
  let staff: SupabaseClient;
  let productId: string;

  beforeAll(async () => {
    service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: created, error } = await service.auth.admin.createUser({ email: editor.email, password: editor.password, email_confirm: true });
    if (error) throw error;
    await service.from("admin_users").insert({ user_id: created.user.id, role: "editor" });
    staff = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await staff.auth.signInWithPassword(editor);
    const { data: id, error: saveError } = await staff.rpc("save_product", {
      p_product_id: null,
      p_data: { name: "Cadeira Teste IA", slug: `cadeira-ia-${suffix}`, dimensions: { heightCm: 90 }, attributes: {}, faq: [], variants: [] },
    });
    if (saveError) throw saveError;
    productId = id;
    // Fila limpa para o teste não pegar jobs de outros produtos.
    await service.from("ai_jobs").delete().in("status", ["queued", "running"]);
  });

  async function enqueuePhoto() {
    const input = `products/${productId}/originais/${crypto.randomUUID()}.jpg`;
    expect((await staff.storage.from(BUCKET).upload(input, JPEG, { contentType: "image/jpeg" })).error).toBeNull();
    const { data, error } = await staff
      .from("ai_jobs")
      .insert({ product_id: productId, kind: "background_removal", input_path: input })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id as string;
  }

  it("limpeza: grava a foto limpa como foto principal e guarda o recorte", async () => {
    const jobId = await enqueuePhoto();
    const done = await processNext(service, ["background_removal"], fakeEngines, { background_removal: "teste" });
    expect(done).toEqual({ id: jobId, kind: "background_removal", status: "succeeded" });

    const { data: job } = await service.from("ai_jobs").select("*").eq("id", jobId).single();
    expect(job.status).toBe("succeeded");
    expect(job.engine).toBe("teste");
    expect(job.cutout_path).toMatch(new RegExp(`^products/${productId}/recortes/.+\\.png$`));
    expect(job.details).toMatchObject({ droppedBackgroundObject: true });

    const { data: media } = await service.from("product_media").select("*").eq("id", job.output_media_id).single();
    expect(media).toMatchObject({ media_type: "image", is_primary: true, is_illustrative: false, width: 1600, height: 1200 });
    expect(media.alt_text).toContain("Cadeira Teste IA");
    const file = await service.storage.from(BUCKET).download(media.storage_path);
    expect(file.error).toBeNull();
  });

  it("falha do motor fica registrada no job, sem deixar arquivo para trás", async () => {
    const jobId = await enqueuePhoto();
    const done = await processNext(service, ["background_removal"], brokenEngines);
    expect(done?.status).toBe("failed");
    const { data: job } = await service.from("ai_jobs").select("status,error,output_media_id").eq("id", jobId).single();
    expect(job).toEqual({ status: "failed", error: "Nenhum objeto encontrado na foto.", output_media_id: null });
  });

  it("3D: grava o .glb como mídia ilustrativa e um novo 3D substitui o anterior", async () => {
    const { data: base } = await service
      .from("ai_jobs")
      .select("cutout_path,output_media_id")
      .eq("product_id", productId)
      .eq("status", "succeeded")
      .limit(1)
      .single();

    const ask = () =>
      staff.from("ai_jobs").insert({ product_id: productId, kind: "model_3d", input_path: base!.cutout_path, source_media_id: base!.output_media_id });

    expect((await ask()).error).toBeNull();
    expect((await processNext(service, ["model_3d"], fakeEngines))?.status).toBe("succeeded");
    const first = await service.from("product_media").select("id,storage_path,is_illustrative").eq("product_id", productId).eq("media_type", "model_3d");
    expect(first.data).toHaveLength(1);
    expect(first.data![0].is_illustrative).toBe(true);

    expect((await ask()).error).toBeNull();
    expect((await processNext(service, ["model_3d"], fakeEngines))?.status).toBe("succeeded");
    const second = await service.from("product_media").select("id,storage_path").eq("product_id", productId).eq("media_type", "model_3d");
    expect(second.data).toHaveLength(1);
    expect(second.data![0].id).not.toBe(first.data![0].id);
    const old = await service.storage.from(BUCKET).download(first.data![0].storage_path);
    expect(old.error).not.toBeNull();
  });

  it("sem motor de 3D, o pedido de 3D espera na fila", async () => {
    const { data: base } = await service.from("ai_jobs").select("cutout_path").eq("product_id", productId).eq("status", "succeeded").limit(1).single();
    await staff.from("ai_jobs").insert({ product_id: productId, kind: "model_3d", input_path: base!.cutout_path });
    expect(await processNext(service, ["background_removal"], fakeEngines)).toBeNull();
    const { data } = await service.from("ai_jobs").select("status").eq("product_id", productId).eq("kind", "model_3d").eq("status", "queued");
    expect(data).toHaveLength(1);
    await service.from("ai_jobs").delete().eq("product_id", productId).eq("status", "queued");
  });
});

describe.skipIf(!enabled)("fotos de catálogo (Supabase local)", () => {
  const suffix = `c${Date.now().toString(36)}`;
  const editor = { email: `editor-cat-${suffix}@teste.local`, password: `Editor-${suffix}-!9` };
  let service: SupabaseClient;
  let staff: SupabaseClient;
  let anon: SupabaseClient;
  let productId: string;
  const seen: { refs: number; views: string[] } = { refs: 0, views: [] };

  const catalogEngines = {
    ...fakeEngines,
    async catalogPhotos(refs: string[], dir: string, _product: unknown, views: string[]) {
      seen.refs = refs.length;
      seen.views = views;
      return Promise.all(
        views.map(async (view) => {
          const file = path.join(dir, `gerada-${view}.jpg`);
          await writeFile(file, JPEG);
          return { file, view };
        }),
      );
    },
  };

  beforeAll(async () => {
    service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: created, error } = await service.auth.admin.createUser({ email: editor.email, password: editor.password, email_confirm: true });
    if (error) throw error;
    await service.from("admin_users").insert({ user_id: created.user.id, role: "editor" });
    staff = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await staff.auth.signInWithPassword(editor);
    const { data: id, error: saveError } = await staff.rpc("save_product", {
      p_product_id: null,
      p_data: { name: "Poltrona Teste Catálogo", slug: `poltrona-cat-${suffix}`, dimensions: {}, attributes: {}, faq: [], variants: [] },
    });
    if (saveError) throw saveError;
    productId = id;
    await service.from("ai_jobs").delete().in("status", ["queued", "running"]);
    // Duas fotos reais já limpas.
    for (let i = 0; i < 2; i++) {
      const input = `products/${productId}/originais/${crypto.randomUUID()}.jpg`;
      await staff.storage.from(BUCKET).upload(input, JPEG, { contentType: "image/jpeg" });
      await staff.from("ai_jobs").insert({ product_id: productId, kind: "background_removal", input_path: input });
      await processNext(service, ["background_removal"], catalogEngines);
    }
  });

  it("gera os 4 ângulos padrão a partir de todas as fotos reais, sem aprovação", async () => {
    const { data: first } = await service
      .from("ai_jobs")
      .select("input_path")
      .eq("product_id", productId)
      .eq("kind", "background_removal")
      .limit(1)
      .single();
    expect((await staff.from("ai_jobs").insert({ product_id: productId, kind: "catalog_photos", input_path: first!.input_path })).error).toBeNull();
    expect((await processNext(service, ["catalog_photos"], catalogEngines))?.status).toBe("succeeded");
    expect(seen).toEqual({ refs: 2, views: ["frente", "tres-quartos", "lateral", "traseira"] });

    const { data: media } = await service
      .from("product_media")
      .select("id,ai_generated,approved_at,is_primary,alt_text")
      .eq("product_id", productId)
      .eq("ai_generated", true)
      .order("sort_order");
    expect(media).toHaveLength(4);
    expect(media!.every((m) => m.approved_at === null && !m.is_primary)).toBe(true);
    expect(media![1].alt_text).toContain("vista três-quartos");
  });

  it("só aparece para o público depois que a equipe aprova", async () => {
    const { data: media } = await service.from("product_media").select("id").eq("product_id", productId).eq("ai_generated", true);
    const target = media![0].id;
    const { data: approved, error } = await staff
      .from("product_media")
      .update({ approved_at: new Date().toISOString() })
      .eq("id", target)
      .select("approved_by");
    expect(error).toBeNull();
    expect(approved![0].approved_by).toBeTruthy();

    // Publica por fora (3D e preço) para conferir a visão do público.
    const { data: category } = await service.from("categories").select("id").eq("slug", "colchoes").single();
    await service.from("product_media").insert({
      product_id: productId,
      storage_path: `products/${productId}/m.glb`,
      media_type: "model_3d",
      alt_text: "Modelo 3D de teste",
    });
    const pub = await service
      .from("products")
      .update({ category_id: category!.id, description: "Teste", price_cents: 1000, status: "published" })
      .eq("id", productId);
    expect(pub.error).toBeNull();
    const { data: visible } = await anon.from("product_media").select("id,ai_generated").eq("product_id", productId).eq("ai_generated", true);
    expect(visible).toEqual([{ id: target, ai_generated: true }]);
    await service.from("products").update({ status: "archived" }).eq("id", productId);
  });
});

#!/usr/bin/env node
/**
 * Processador do estúdio de IA: pega os jobs criados no painel, roda os modelos
 * (scripts em ai/) e grava o resultado como mídia do produto.
 *
 *   npm run ai:setup    # uma vez: ambiente Python + modelos
 *   npm run ai:worker   # deixa rodando (lê .env.local)
 *
 * Usa a chave de serviço do Supabase: roda numa máquina da loja ou num servidor,
 * nunca no navegador nem na Vercel. Processa um job por vez.
 *
 * Motores habilitados:
 *   - limpeza de fundo: quando o modelo BiRefNet está baixado (ai:setup);
 *   - fotos de catálogo (IA recria a cena a partir das fotos reais): com
 *     OPENAI_API_KEY (GPT Image, edição com várias fotos de referência);
 *   - 3D: só com AI_3D_ENGINE=triposr e o TripoSR instalado (ver docs/ESTUDIO-IA.md).
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BUCKET = "product-media";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // limite do bucket
const PYTHON = process.env.AI_PYTHON ?? path.join(ROOT, ".venv-ai", "bin", "python");
const IDLE_MS = 2000;

/** Ângulos padrão das fotos de catálogo (sempre os mesmos, para todos os produtos). */
export const CATALOG_VIEWS = {
  frente: "vista frontal",
  "tres-quartos": "vista três-quartos",
  lateral: "vista lateral",
  traseira: "vista traseira",
};
const HEARTBEAT_MS = 10_000;

/** O que este computador consegue processar. */
export function detectEngines(root = ROOT, env = process.env) {
  const engines = {};
  if (existsSync(PYTHON) && existsSync(path.join(root, "ai", "models", "birefnet", "model.onnx"))) {
    engines.background_removal = "BiRefNet + Depth Anything V2 (local)";
  }
  if (env.OPENAI_API_KEY && engines.background_removal) {
    engines.catalog_photos = `OpenAI ${env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL}`;
  }
  if (
    env.AI_3D_ENGINE === "triposr" &&
    existsSync(PYTHON) &&
    existsSync(path.join(root, "ai", "models", "triposr", "model.ckpt")) &&
    existsSync(path.join(root, "ai", "vendor", "TripoSR"))
  ) {
    engines.model_3d = "TripoSR (local)";
  }
  return engines;
}

function runPython(script, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [path.join(ROOT, "ai", script), ...args], { cwd: ROOT });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("O processamento passou do tempo limite."));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const last = (stderr.trim().split("\n").pop() || stdout.trim().split("\n").pop() || "").slice(0, 300);
        return reject(new Error(last || `O motor terminou com erro (${code}).`));
      }
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop()));
      } catch {
        reject(new Error("Resposta inesperada do motor."));
      }
    });
  });
}

/** Motores reais (scripts Python em ai/). */
export const pythonEngines = {
  async backgroundRemoval(input, dir) {
    const cutout = path.join(dir, "recorte.png");
    const studio = path.join(dir, "estudio.jpg");
    const meta = await runPython("remove_background.py", [input, cutout, studio], 5 * 60_000);
    return { cutout, studio, meta };
  },
  async model3d(input, dir, heightCm) {
    const glb = path.join(dir, "modelo.glb");
    const args = [input, glb];
    if (heightCm) args.push(String(heightCm));
    const meta = await runPython("image_to_3d.py", args, 20 * 60_000);
    return { glb, meta };
  },
};

// ---------------------------------------------------------------------------
// Fotos de catálogo com a API de imagem da OpenAI
// ---------------------------------------------------------------------------

export const DEFAULT_IMAGE_MODEL = "gpt-image-2.5-sunburst";

const VIEW_INSTRUCTIONS = {
  frente: "straight front view: camera facing the front of the product head-on",
  "tres-quartos": "three-quarter front view: camera rotated about 35 degrees from the front, showing the front and one side",
  lateral: "side profile view: camera at 90 degrees, showing one full side of the product",
  traseira: "straight back view: camera facing the back of the product head-on",
};

/** Instrução enviada ao modelo. As fotos reais são a única fonte de verdade. */
export function catalogPrompt(view, referenceCount) {
  const refs = Array.from({ length: referenceCount }, (_, i) => `image ${i + 1}`).join(", ");
  return [
    `The attached photos (${refs}) show ONE real product from different angles, photographed casually (possibly tilted,`,
    "blurry or partly hidden) in a cluttered room. They are the only source of truth for this exact product.",
    "",
    `Create a professional e-commerce catalog photograph of this same product: ${VIEW_INSTRUCTIONS[view]},`,
    "camera at the height of the middle of the product, 50 mm lens, perfectly level and straight, whole product in frame",
    "with some margin, sharp focus, soft diffused studio light.",
    "",
    "Preserve exactly: overall shape and proportions, every part and how parts connect, colors, materials, fabric texture",
    "and stitching pattern, wood color, grain and finish, small wear marks. Use the other photos to see parts hidden in one",
    "of them. Do not add, remove, repair, restyle or redesign anything. No props, no people, no text, no logos.",
    "",
    "Output only the product on a fully transparent background, with no floor and no shadow.",
  ].join("\n");
}

const MIME_BY_EXT = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

async function openaiImageEdit({ apiKey, model, references, prompt, output }) {
  const form = new FormData();
  form.set("model", model);
  for (const ref of references) {
    const type = MIME_BY_EXT[path.extname(ref).toLowerCase()] ?? "image/jpeg";
    form.append("image[]", new Blob([await readFile(ref)], { type }), path.basename(ref));
  }
  form.set("prompt", prompt);
  form.set("size", "1536x1024");
  form.set("quality", "high");
  form.set("background", "transparent");
  form.set("output_format", "png");
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(4 * 60_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`OpenAI: ${body?.error?.message ?? `erro ${res.status}`}`.slice(0, 300));
  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) throw new Error("A OpenAI não devolveu a imagem.");
  await writeFile(output, Buffer.from(b64, "base64"));
  return body.usage ?? null;
}

/** Motor de fotos de catálogo (gera os ângulos de 2 em 2). */
export function openaiCatalogEngine(apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL) {
  return {
    async catalogPhotos(references, dir, _product, views) {
      const shots = [];
      for (let i = 0; i < views.length; i += 2) {
        const batch = views.slice(i, i + 2).map(async (view) => {
          const file = path.join(dir, `catalogo-${view}.png`);
          const usage = await openaiImageEdit({ apiKey, model, references, prompt: catalogPrompt(view, references.length), output: file });
          return { file, view, usage };
        });
        shots.push(...(await Promise.all(batch)));
      }
      return shots;
    },
  };
}

const isJpeg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isPng = (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const isGlb = (b) => b.length > 12 && b.toString("latin1", 0, 4) === "glTF" && b.readUInt32LE(4) === 2;

async function upload(supabase, storagePath, bytes, contentType) {
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error("O arquivo gerado passou de 4 MB.");
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`Falha ao gravar o arquivo: ${error.message}`);
  return storagePath;
}

async function nextMediaSlot(supabase, productId) {
  const { data, error } = await supabase.from("product_media").select("sort_order,is_primary,media_type").eq("product_id", productId);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    sortOrder: Math.max(-1, ...rows.map((m) => m.sort_order)) + 1,
    hasPrimary: rows.some((m) => m.is_primary),
    imageCount: rows.filter((m) => m.media_type === "image").length,
  };
}

async function backgroundRemoval(supabase, job, product, inputFile, dir, engines, uploaded) {
  const { cutout, studio, meta } = await engines.backgroundRemoval(inputFile, dir);
  const studioBytes = await readFile(studio);
  const cutoutBytes = await readFile(cutout);
  if (!isJpeg(studioBytes) || !isPng(cutoutBytes)) throw new Error("O motor gerou um arquivo inválido.");

  const cutoutPath = await upload(supabase, `products/${product.id}/recortes/${randomUUID()}.png`, cutoutBytes, "image/png");
  uploaded.push(cutoutPath);
  const studioPath = await upload(supabase, `products/${product.id}/${randomUUID()}.jpg`, studioBytes, "image/jpeg");
  uploaded.push(studioPath);

  const slot = await nextMediaSlot(supabase, product.id);
  const { data: media, error } = await supabase
    .from("product_media")
    .insert({
      product_id: product.id,
      storage_path: studioPath,
      media_type: "image",
      alt_text: `${product.name} com fundo limpo, foto ${slot.imageCount + 1}`.slice(0, 300),
      is_primary: !slot.hasPrimary,
      is_illustrative: false, // é a foto real do produto; só o fundo foi trocado
      sort_order: slot.sortOrder,
      width: meta.width,
      height: meta.height,
      mime_type: "image/jpeg",
      size_bytes: studioBytes.length,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { output_media_id: media.id, cutout_path: cutoutPath, details: meta };
}

async function model3d(supabase, job, product, inputFile, dir, engines, uploaded) {
  const heightCm = Number(product.dimensions?.heightCm) > 0 ? Number(product.dimensions.heightCm) : null;
  const { glb, meta } = await engines.model3d(inputFile, dir, heightCm);
  const bytes = await readFile(glb);
  if (!isGlb(bytes)) throw new Error("O motor gerou um arquivo 3D inválido.");
  const glbPath = await upload(supabase, `products/${product.id}/${randomUUID()}.glb`, bytes, "model/gltf-binary");
  uploaded.push(glbPath);

  // Um 3D novo substitui o anterior gerado pela IA (arquivos enviados à mão ficam).
  const { data: previous } = await supabase
    .from("ai_jobs")
    .select("output_media_id")
    .eq("product_id", product.id)
    .eq("kind", "model_3d")
    .eq("status", "succeeded")
    .not("output_media_id", "is", null);
  const previousIds = (previous ?? []).map((j) => j.output_media_id);

  const slot = await nextMediaSlot(supabase, product.id);
  const { data: media, error } = await supabase
    .from("product_media")
    .insert({
      product_id: product.id,
      storage_path: glbPath,
      media_type: "model_3d",
      alt_text: `Modelo 3D de ${product.name}, gerado por IA a partir da foto`.slice(0, 300),
      is_illustrative: true, // aproximação: a equipe confere antes de tirar a marcação
      sort_order: slot.sortOrder,
      mime_type: "model/gltf-binary",
      size_bytes: bytes.length,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (previousIds.length) {
    const { data: removed } = await supabase.from("product_media").delete().in("id", previousIds).select("storage_path");
    const paths = (removed ?? []).map((m) => m.storage_path);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  }
  return { output_media_id: media.id, details: meta };
}

/**
 * Fotos de catálogo: a IA recria a cena nos ângulos padrão usando TODAS as fotos
 * reais do produto como referência. Cada imagem gerada passa pela mesma limpeza
 * e enquadramento das fotos comuns (padrão da loja) e entra SEM aprovação: só
 * aparece na loja depois que alguém conferir com as fotos reais.
 */
async function catalogPhotos(supabase, job, product, _inputFile, dir, engines, uploaded) {
  const { data: cleaned, error } = await supabase
    .from("ai_jobs")
    .select("input_path")
    .eq("product_id", product.id)
    .eq("kind", "background_removal")
    .eq("status", "succeeded")
    .order("created_at");
  if (error) throw new Error(error.message);
  if (!cleaned?.length) throw new Error("Envie e limpe pelo menos uma foto real antes.");

  const references = [];
  for (const [i, row] of cleaned.entries()) {
    const { data: blob } = await supabase.storage.from(BUCKET).download(row.input_path);
    if (!blob) continue;
    const file = path.join(dir, `referencia-${i + 1}${path.extname(row.input_path) || ".jpg"}`);
    await writeFile(file, Buffer.from(await blob.arrayBuffer()));
    references.push(file);
  }
  if (!references.length) throw new Error("Não foi possível ler as fotos reais.");

  const shots = await engines.catalogPhotos(references, dir, product, Object.keys(CATALOG_VIEWS));
  const mediaIds = [];
  for (const [i, shot] of shots.entries()) {
    const shotDir = path.join(dir, `vista-${i + 1}`);
    await mkdir(shotDir);
    const { studio, meta } = await engines.backgroundRemoval(shot.file, shotDir);
    const bytes = await readFile(studio);
    if (!isJpeg(bytes)) throw new Error("O motor gerou um arquivo inválido.");
    const storagePath = await upload(supabase, `products/${product.id}/${randomUUID()}.jpg`, bytes, "image/jpeg");
    uploaded.push(storagePath);
    const slot = await nextMediaSlot(supabase, product.id);
    const label = CATALOG_VIEWS[shot.view] ?? "vista";
    const { data: media, error: insertError } = await supabase
      .from("product_media")
      .insert({
        product_id: product.id,
        storage_path: storagePath,
        media_type: "image",
        alt_text: `${product.name}, ${label} (imagem de catálogo feita a partir das fotos reais)`.slice(0, 300),
        ai_generated: true,
        is_primary: false,
        is_illustrative: false,
        sort_order: slot.sortOrder,
        width: meta.width,
        height: meta.height,
        mime_type: "image/jpeg",
        size_bytes: bytes.length,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    mediaIds.push(media.id);
  }
  const usage = shots.map((s) => s.usage).filter(Boolean);
  return {
    output_media_id: mediaIds[0] ?? null,
    details: {
      mediaIds,
      views: shots.map((s) => s.view),
      references: references.length,
      ...(usage.length
        ? {
            usage: {
              inputTokens: usage.reduce((n, u) => n + (u.input_tokens ?? 0), 0),
              outputTokens: usage.reduce((n, u) => n + (u.output_tokens ?? 0), 0),
            },
          }
        : {}),
    },
  };
}

/** Processa um job já marcado como "running". Nunca lança: registra a falha no job. */
export async function processJob(supabase, job, engines = pythonEngines, engineNames = {}) {
  const uploaded = [];
  const dir = await mkdtemp(path.join(tmpdir(), "cuxoes-ia-"));
  try {
    const { data: product, error } = await supabase.from("products").select("id,name,dimensions").eq("id", job.product_id).single();
    if (error || !product) throw new Error("Produto não encontrado.");

    const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(job.input_path);
    if (downloadError || !blob) throw new Error("Não foi possível ler a foto enviada.");
    const inputFile = path.join(dir, `entrada${path.extname(job.input_path) || ".jpg"}`);
    await writeFile(inputFile, Buffer.from(await blob.arrayBuffer()));

    const handler = { background_removal: backgroundRemoval, model_3d: model3d, catalog_photos: catalogPhotos }[job.kind];
    if (!handler) throw new Error("Tipo de job desconhecido.");
    const result = await handler(supabase, job, product, inputFile, dir, engines, uploaded);
    await supabase
      .from("ai_jobs")
      .update({ ...result, status: "succeeded", engine: engineNames[job.kind] ?? null, error: null, finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return "succeeded";
  } catch (e) {
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await supabase
      .from("ai_jobs")
      .update({ status: "failed", error: message, engine: engineNames[job.kind] ?? null, finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return "failed";
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Pega o próximo job que este processador sabe fazer e o processa. */
export async function processNext(supabase, kinds, engines = pythonEngines, engineNames = {}) {
  if (!kinds.length) return null;
  const { data, error } = await supabase.rpc("claim_ai_job", { p_kinds: kinds });
  if (error) throw new Error(`Falha ao consultar a fila: ${error.message}`);
  const job = (data ?? [])[0];
  if (!job) return null;
  const status = await processJob(supabase, job, engines, engineNames);
  return { id: job.id, kind: job.kind, status };
}

/** Jobs que ficaram "processando" quando um processador caiu voltam para a fila. */
export async function requeueStale(supabase, olderThanMinutes = 30) {
  const limit = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  await supabase.from("ai_jobs").update({ status: "queued", started_at: null }).eq("status", "running").lt("started_at", limit);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.");
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const engineNames = detectEngines();
  const engines = { ...pythonEngines, ...(engineNames.catalog_photos ? openaiCatalogEngine() : {}) };
  const kinds = Object.keys(engineNames);
  const workerId = `local-${hostname()}`.slice(0, 80);

  if (!kinds.length) {
    console.error("Nenhum motor instalado. Rode: npm run ai:setup");
    process.exit(1);
  }
  console.log(`Processador ${workerId}: ${kinds.map((k) => `${k} → ${engineNames[k]}`).join("; ")}`);

  const heartbeat = () =>
    supabase.from("ai_workers").upsert({ id: workerId, capabilities: kinds, engines: engineNames, last_seen_at: new Date().toISOString() });
  await heartbeat();
  const beat = setInterval(heartbeat, HEARTBEAT_MS);
  await requeueStale(supabase);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(beat);
    await supabase.from("ai_workers").delete().eq("id", workerId);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    try {
      const done = await processNext(supabase, kinds, engines, engineNames);
      if (done) {
        console.log(`${new Date().toLocaleTimeString("pt-BR")} job ${done.id} (${done.kind}): ${done.status}`);
        await heartbeat();
        continue;
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, IDLE_MS));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

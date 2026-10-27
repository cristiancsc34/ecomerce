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
 *     estilo em CATALOG_STYLE (padrão "creme"; ou "neutro" / "ambiente-vazio");
 *   - 3D: com TRIPO_API_KEY (API do Tripo, a partir da foto de catálogo ¾); ou
 *     AI_3D_ENGINE=triposr com o TripoSR instalado (ver docs/ESTUDIO-IA.md).
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress } from "@gltf-transform/functions";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BUCKET = "product-media";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // limite do bucket
const PYTHON = process.env.AI_PYTHON ?? path.join(ROOT, ".venv-ai", "bin", "python");
const IDLE_MS = 2000;

/**
 * Estilo das fotos de catálogo (CATALOG_STYLE). Padrão da loja: "creme" — o
 * produto recortado sobre fundo creme, como nas lojas de referência. Também
 * disponíveis: "neutro" (cinza-claro) e "ambiente-vazio" (o produto num cômodo
 * vazio — sempre o mesmo, ai/cenarios/ambiente-vazio.jpg — sem nenhum outro objeto).
 */
export const CATALOG_STYLES = ["creme", "neutro", "ambiente-vazio"];
export function catalogStyle(env = process.env) {
  return CATALOG_STYLES.includes(env.CATALOG_STYLE) ? env.CATALOG_STYLE : "creme";
}
const fundoFor = (style) => (style === "neutro" ? "neutro" : "creme");
const SCENE_TEMPLATE = path.join(ROOT, "ai", "cenarios", "ambiente-vazio.jpg");

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
  if (env.TRIPO_API_KEY) {
    engines.model_3d = `Tripo ${env.TRIPO_MODEL || DEFAULT_TRIPO_MODEL} (API)`;
  } else if (
    env.AI_3D_ENGINE === "triposr" &&
    existsSync(PYTHON) &&
    existsSync(path.join(root, "ai", "models", "triposr", "model.ckpt")) &&
    existsSync(path.join(root, "ai", "vendor", "TripoSR"))
  ) {
    engines.model_3d = "TripoSR (local)";
  }
  return engines;
}

function runPython(script, args, timeoutMs, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [path.join(ROOT, "ai", script), ...args], { cwd: ROOT, env: { ...process.env, ...extraEnv } });
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
  async backgroundRemoval(input, dir, { fundo = "creme" } = {}) {
    const cutout = path.join(dir, "recorte.png");
    const studio = path.join(dir, "estudio.jpg");
    const meta = await runPython("remove_background.py", [input, cutout, studio], 5 * 60_000, { ESTUDIO_FUNDO: fundo });
    return { cutout, studio, meta };
  },
  // O TripoSR local usa uma foto só (ignora os ângulos do catálogo).
  async model3d(input, dir, heightCm, _views = null) {
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
  lateral: "side profile view of the product's right side: camera at 90 degrees, the product's front pointing to the right edge of the image",
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

/** Instrução para pôr o produto (já fotografado) no cômodo vazio padrão. */
export function scenePrompt() {
  return [
    "Image 1 is a catalog photo of ONE real product on a plain studio background. Image 2 is an empty room.",
    "",
    "Create one single photorealistic photograph: the product from image 1 standing on the floor of the room from image 2,",
    "centered horizontally, in front of the corner, the whole product in frame and occupying about 60% of the image height.",
    "",
    "Keep the product exactly as in image 1: same viewing angle, shape, proportions, every part, colors, fabric and",
    "stitching, wood color and finish, wear marks. Keep the room exactly as in image 2: same walls, baseboards, floor,",
    "window light and camera. Add only a realistic contact shadow of the product on the floor, consistent with the light.",
    "",
    "Nothing else may appear: no other furniture, objects, plants, rugs, people, text or logos. Not a collage.",
  ].join("\n");
}

async function openaiImageEdit({ apiKey, model, references, prompt, output, size = "1536x1024", transparent = true }) {
  const form = new FormData();
  form.set("model", model);
  for (const ref of references) {
    const type = MIME_BY_EXT[path.extname(ref).toLowerCase()] ?? "image/jpeg";
    form.append("image[]", new Blob([await readFile(ref)], { type }), path.basename(ref));
  }
  form.set("prompt", prompt);
  form.set("size", size);
  form.set("quality", "high");
  if (transparent) form.set("background", "transparent");
  form.set("output_format", transparent ? "png" : "jpeg");
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
    /** Põe a foto de estúdio no cômodo vazio padrão (estilo "ambiente-vazio"). */
    async placeInScene(studioFile, dir) {
      const output = path.join(dir, "ambiente.jpg");
      const usage = await openaiImageEdit({
        apiKey,
        model,
        references: [studioFile, SCENE_TEMPLATE],
        prompt: scenePrompt(),
        output,
        size: "1600x1200",
        transparent: false,
      });
      return { file: output, usage };
    },
  };
}

function mergeUsage(a, b) {
  if (!a) return b;
  return { input_tokens: (a.input_tokens ?? 0) + (b.input_tokens ?? 0), output_tokens: (a.output_tokens ?? 0) + (b.output_tokens ?? 0) };
}

// ---------------------------------------------------------------------------
// 3D com a API do Tripo (https://developers.tripo3d.ai)
// ---------------------------------------------------------------------------

export const DEFAULT_TRIPO_MODEL = "v3.1-20260211";
const TRIPO_API = "https://openapi.tripo3d.ai/v3";
const TRIPO_POLL_MS = 5000;

async function tripoRequest(apiKey, pathname, init = {}) {
  const res = await fetch(`${TRIPO_API}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(2 * 60_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.code !== 0) {
    const message = body?.code === 2010 ? "Sem créditos no Tripo. Recarregue a conta." : body?.message ?? `erro ${res.status}`;
    throw new Error(`Tripo: ${message}`.slice(0, 300));
  }
  return body.data;
}

/**
 * Motor 3D do Tripo: envia o recorte (de preferência a foto de catálogo ¾),
 * cria a tarefa image-to-model, acompanha até terminar e baixa o .glb.
 */
export function tripoEngine(apiKey = process.env.TRIPO_API_KEY, model = process.env.TRIPO_MODEL || DEFAULT_TRIPO_MODEL, pollMs = TRIPO_POLL_MS) {
  return {
    /**
     * Com as fotos de catálogo (frente, lado direito e costas) usa o modo de
     * várias fotos — a traseira e o perfil saem fiéis. Sem elas, usa uma foto só.
     */
    async model3d(input, dir, _heightCm, views = null) {
      const upload = async (file) => {
        const form = new FormData();
        const type = MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "image/png";
        form.set("file", new Blob([await readFile(file)], { type }), path.basename(file));
        return (await tripoRequest(apiKey, "/files", { method: "POST", body: form })).file_token;
      };
      const common = { model, texture: true, pbr: true, texture_quality: "standard", face_limit: 60000 }; // leve no celular
      let endpoint;
      let body;
      if (views?.front && (views.right || views.back)) {
        const inputs = [];
        for (const key of ["front", "right", "back"]) if (views[key]) inputs.push({ [key]: await upload(views[key]) });
        endpoint = "/generation/multiview-to-model";
        body = { inputs, ...common };
      } else {
        endpoint = "/generation/image-to-model";
        body = { input: await upload(input), ...common };
      }
      const { task_id: taskId } = await tripoRequest(apiKey, endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const started = Date.now();
      let task;
      for (;;) {
        task = await tripoRequest(apiKey, `/tasks/${taskId}`);
        if (task.status === "success") break;
        if (task.status === "failed" || task.status === "cancelled") throw new Error(`Tripo: tarefa ${task.status}.`);
        if (Date.now() - started > 15 * 60_000) throw new Error("Tripo: o 3D passou de 15 minutos.");
        await new Promise((r) => setTimeout(r, pollMs));
      }

      const url = task.output?.model_url;
      if (!url) throw new Error("Tripo: a tarefa terminou sem arquivo 3D.");
      const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
      if (!res.ok) throw new Error(`Tripo: falha ao baixar o 3D (${res.status}).`);
      const glb = path.join(dir, "modelo.glb");
      await writeFile(glb, Buffer.from(await res.arrayBuffer()));
      return {
        glb,
        meta: {
          engine: "tripo",
          mode: endpoint.includes("multiview") ? "multiview" : "single",
          taskId,
          model,
          credits: task.credits_consumed ?? null,
          seconds: Math.round((Date.now() - started) / 1000),
        },
      };
    },
  };
}

/**
 * Prepara o .glb para a loja: gira para a frente do produto ficar virada para a
 * câmera inicial do visualizador (+Z, padrão glTF) e comprime as texturas em
 * WebP até caber no limite de upload — leve para abrir no celular.
 * O Tripo exporta com a frente em +X (padrão "export_orientation": "+x").
 */
export async function optimizeGlb(bytes, { frontAxis = "+z", maxBytes = MAX_UPLOAD_BYTES } = {}) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const ROTATIONS = { "+x": [0, -Math.SQRT1_2, 0, Math.SQRT1_2], "-x": [0, Math.SQRT1_2, 0, Math.SQRT1_2], "+z": null };
  for (const size of [2048, 1536, 1024, 768, 512]) {
    const doc = await io.readBinary(new Uint8Array(bytes));
    const rotation = ROTATIONS[frontAxis];
    if (rotation) {
      const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
      const pivot = doc.createNode("frente-do-produto").setRotation(rotation);
      for (const child of scene.listChildren()) {
        scene.removeChild(child);
        pivot.addChild(child);
      }
      scene.addChild(pivot);
    }
    await doc.transform(dedup(), prune({ keepLeaves: true }), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [size, size], quality: 88 }));
    const out = Buffer.from(await io.writeBinary(doc));
    if (out.length <= maxBytes) return { bytes: out, textureSize: size };
  }
  throw new Error("O modelo 3D continua grande demais mesmo com as texturas reduzidas.");
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
  const studioPath = await upload(supabase, `products/${product.id}/limpas/${randomUUID()}.jpg`, studioBytes, "image/jpeg");
  uploaded.push(studioPath);

  // A foto do celular limpa é material de trabalho (antes × depois, base do 3D e
  // referência): não vai para a galeria da loja. A loja recebe só as fotos de
  // catálogo padronizadas e aprovadas.
  return { output_media_id: null, cutout_path: cutoutPath, details: { ...meta, studioPath } };
}

async function model3d(supabase, job, product, inputFile, dir, engines, uploaded) {
  const heightCm = Number(product.dimensions?.heightCm) > 0 ? Number(product.dimensions.heightCm) : null;

  // Fotos de catálogo mais recentes: frente, lado direito e costas viram a base do 3D.
  let views = null;
  const { data: catalog } = await supabase
    .from("ai_jobs")
    .select("details")
    .eq("product_id", product.id)
    .eq("kind", "catalog_photos")
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cutouts = catalog?.details?.cutouts ?? {};
  if (cutouts.frente && (cutouts.lateral || cutouts.traseira)) {
    views = {};
    for (const [key, view] of [["front", "frente"], ["right", "lateral"], ["back", "traseira"]]) {
      if (!cutouts[view]) continue;
      const { data: blob } = await supabase.storage.from(BUCKET).download(cutouts[view]);
      if (!blob) continue;
      views[key] = path.join(dir, `vista-3d-${view}.png`);
      await writeFile(views[key], Buffer.from(await blob.arrayBuffer()));
    }
  }
  const { glb, meta } = await engines.model3d(inputFile, dir, heightCm, views);
  let bytes = await readFile(glb);
  if (!isGlb(bytes)) throw new Error("O motor gerou um arquivo 3D inválido.");
  if (meta.engine === "tripo") {
    const optimized = await optimizeGlb(bytes, { frontAxis: "+x" });
    meta.originalBytes = bytes.length;
    meta.textureSize = optimized.textureSize;
    bytes = optimized.bytes;
  }
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

  const style = catalogStyle();
  const shots = await engines.catalogPhotos(references, dir, product, Object.keys(CATALOG_VIEWS));

  // Um novo conjunto substitui as imagens anteriores que ninguém aprovou (as aprovadas ficam).
  const { data: stale } = await supabase
    .from("product_media")
    .delete()
    .eq("product_id", product.id)
    .eq("ai_generated", true)
    .is("approved_at", null)
    .select("storage_path");
  if (stale?.length) await supabase.storage.from(BUCKET).remove(stale.map((m) => m.storage_path));

  const mediaIds = [];
  const cutouts = {};
  for (const [i, shot] of shots.entries()) {
    const shotDir = path.join(dir, `vista-${i + 1}`);
    await mkdir(shotDir);
    const composed = await engines.backgroundRemoval(shot.file, shotDir, { fundo: fundoFor(style) });
    // O recorte de cada ângulo fica guardado: o de ¾ é a melhor base para o 3D.
    const cutoutBytes = await readFile(composed.cutout);
    if (isPng(cutoutBytes)) {
      const cutoutPath = await upload(supabase, `products/${product.id}/recortes/${randomUUID()}.png`, cutoutBytes, "image/png");
      uploaded.push(cutoutPath);
      cutouts[shot.view] = cutoutPath;
    }
    let finalFile = composed.studio;
    const meta = composed.meta;
    if (style === "ambiente-vazio") {
      const scene = await engines.placeInScene(composed.studio, shotDir);
      finalFile = scene.file;
      if (scene.usage) shot.usage = mergeUsage(shot.usage, scene.usage);
      meta.width = 1600;
      meta.height = 1200;
    }
    const bytes = await readFile(finalFile);
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
      cutouts,
      style,
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
  const engines = {
    ...pythonEngines,
    ...(engineNames.catalog_photos ? openaiCatalogEngine() : {}),
    ...(engineNames.model_3d?.startsWith("Tripo") ? tripoEngine() : {}),
  };
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

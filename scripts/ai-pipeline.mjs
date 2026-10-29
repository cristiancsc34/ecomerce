/**
 * Etapas do estúdio de IA que só usam Node (sem Python): fotos de catálogo
 * (OpenAI), 3D (Tripo), preparo do .glb e o processamento de um job da fila
 * (lê a entrada, chama o motor, grava os arquivos e a mídia do produto).
 *
 * Usado pelo processador local (scripts/ai-worker.mjs) e pela IA na nuvem
 * (lib/ai-cloud, na Vercel). Os motores chegam por parâmetro: Python local,
 * fal.ai, OpenAI, Tripo ou falsos nos testes.
 *
 * Não acessa arquivos do projeto por caminho calculado (o build da Vercel
 * levaria o projeto inteiro junto); o único arquivo fixo é o cenário do estilo
 * "ambiente-vazio", a partir da raiz do projeto.
 */
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";
import { cleanWith } from "./ai-background.mjs";

export const BUCKET = "product-media";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // limite do bucket

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
// Caminho a partir da raiz do projeto (onde o processador e o site rodam): o build da Vercel leva só este arquivo.
const SCENE_TEMPLATE = path.join(process.cwd(), "ai", "cenarios", "ambiente-vazio.jpg");

/** Ângulos padrão das fotos de catálogo (sempre os mesmos, para todos os produtos). */
export const CATALOG_VIEWS = {
  frente: "vista frontal",
  "tres-quartos": "vista três-quartos",
  lateral: "vista lateral",
  traseira: "vista traseira",
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

async function openaiImageEdit({ apiKey, model, references, prompt, output, size = "1536x1024", transparent = true, quality = "high" }) {
  const form = new FormData();
  form.set("model", model);
  for (const ref of references) {
    const type = MIME_BY_EXT[path.extname(ref).toLowerCase()] ?? "image/jpeg";
    form.append("image[]", new Blob([await readFile(ref)], { type }), path.basename(ref));
  }
  form.set("prompt", prompt);
  form.set("size", size);
  form.set("quality", quality);
  if (transparent) form.set("background", "transparent");
  form.set("output_format", transparent ? "png" : "jpeg");
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(4 * 60_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(`OpenAI: ${body?.error?.message ?? `erro ${res.status}`}`.slice(0, 300));
    error.status = res.status;
    throw error;
  }
  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) throw new Error("A OpenAI não devolveu a imagem.");
  await writeFile(output, Buffer.from(b64, "base64"));
  return body.usage ?? null;
}

/** Limite de pedidos por minuto da OpenAI (429): espera um pouco e tenta de novo, uma vez. */
async function retryRateLimit(run, waitMs = 20_000) {
  try {
    return await run();
  } catch (e) {
    if (e?.status !== 429) throw e;
    await new Promise((r) => setTimeout(r, waitMs));
    return run();
  }
}

/** Instrução da limpeza do fundo com o ChatGPT: só tira o cômodo, o produto fica igual. */
export function cleanupPrompt() {
  return [
    "Image 1 is a real phone photo of ONE product (a piece of furniture) in a room. It is the only source of truth for this exact product.",
    "",
    "Cut the product out: the same product, from the same viewing angle and perspective, whole product in frame, on a fully",
    "transparent background, with no floor, no shadow and nothing else from the room.",
    "",
    "Keep the product exactly as it is in the photo: shape, proportions, every part and how parts connect, colors, materials,",
    "texture, mesh and fabric pattern, small wear marks. Do not add, remove, repair, restyle or redesign anything. No text, no logos.",
  ].join("\n");
}

/** Tamanho aceito pela API mais próximo do formato da foto (o celular costuma tirar em pé). */
export function editSizeFor(width, height) {
  const ratio = width / height;
  return ratio < 0.85 ? "1024x1536" : ratio > 1.18 ? "1536x1024" : "1024x1024";
}

/**
 * Limpeza do fundo com o ChatGPT (mesma chave das fotos de catálogo). Diferente
 * da fal.ai, a IA redesenha a foto sem o cômodo: no teste com a cadeira real
 * ficou fiel, mas não é um recorte pixel a pixel. Serve de referência (antes ×
 * depois); a loja usa as fotos de catálogo aprovadas. Qualidade "medium" por
 * padrão (medido: ~20 s por foto; "high", ~33 s), em OPENAI_CLEANUP_QUALITY.
 */
export function openaiCleanupEngine(
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
  { quality = process.env.OPENAI_CLEANUP_QUALITY || "medium", retryWaitMs = 20_000 } = {},
) {
  const remove = async (file) => {
    // A foto vai já de pé (EXIF do celular) e no máximo com 2048 px.
    const { data, info } = await sharp(file)
      .rotate()
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer({ resolveWithObject: true });
    const reference = path.join(path.dirname(file), "limpeza-entrada.jpg");
    const output = path.join(path.dirname(file), "limpeza-chatgpt.png");
    await writeFile(reference, data);
    const size = editSizeFor(info.width, info.height);
    await retryRateLimit(
      () => openaiImageEdit({ apiKey, model, references: [reference], prompt: cleanupPrompt(), output, size, quality }),
      retryWaitMs,
    );
    return readFile(output);
  };
  return {
    backgroundRemoval: (input, dir, { fundo = "creme" } = {}) => cleanWith(remove, input, dir, { fundo, engine: "chatgpt" }),
  };
}

/** Motor de fotos de catálogo: os ângulos saem todos ao mesmo tempo (~40 s cada, em vez de 2 em 2). */
export function openaiCatalogEngine(
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
  { retryWaitMs = 20_000 } = {},
) {
  return {
    async catalogPhotos(references, dir, _product, views) {
      return Promise.all(
        views.map(async (view) => {
          const file = path.join(dir, `catalogo-${view}.png`);
          const prompt = catalogPrompt(view, references.length);
          const usage = await retryRateLimit(() => openaiImageEdit({ apiKey, model, references, prompt, output: file }), retryWaitMs);
          return { file, view, usage };
        }),
      );
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
export function tripoEngine(
  apiKey = process.env.TRIPO_API_KEY,
  model = process.env.TRIPO_MODEL || DEFAULT_TRIPO_MODEL,
  pollMs = TRIPO_POLL_MS,
  maxMs = 15 * 60_000, // na nuvem é menor: a tarefa precisa terminar antes da função da Vercel
) {
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
        if (Date.now() - started > maxMs) throw new Error(`Tripo: o 3D passou de ${Math.round(maxMs / 60_000)} minutos. Tente de novo.`);
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

/** Coloca todos os filhos da cena dentro de um nó novo (para girar ou mover o modelo inteiro). */
function wrapSceneChildren(doc, scene, name) {
  const pivot = doc.createNode(name);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    pivot.addChild(child);
  }
  scene.addChild(pivot);
  return pivot;
}

/**
 * Prepara o .glb para a loja e para a realidade aumentada:
 * - gira para a frente do produto ficar virada para a câmera inicial (+Z, padrão glTF).
 *   O Tripo exporta com a frente em +X (padrão "export_orientation": "+x");
 * - apoia a base do modelo no chão (y = 0) e centraliza em x/z: o AR do Android e do
 *   iPhone põe a origem do arquivo sobre o piso, e o Tripo entrega o modelo centrado
 *   no meio da altura (metade dele ficaria "dentro" do chão);
 * - comprime as texturas em JPEG até caber no limite de upload. Não usa WebP: o
 *   Scene Viewer (AR do Android) só abre JPEG/PNG.
 */
export async function optimizeGlb(bytes, { frontAxis = "+z", maxBytes = MAX_UPLOAD_BYTES } = {}) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const ROTATIONS = { "+x": [0, -Math.SQRT1_2, 0, Math.SQRT1_2], "-x": [0, Math.SQRT1_2, 0, Math.SQRT1_2], "+z": null };
  for (const size of [2048, 1536, 1024, 768, 512]) {
    const doc = await io.readBinary(new Uint8Array(bytes));
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    const rotation = ROTATIONS[frontAxis];
    if (rotation) wrapSceneChildren(doc, scene, "frente-do-produto").setRotation(rotation);

    const { min, max } = getBounds(scene);
    if (min.every(Number.isFinite)) {
      const offset = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
      if (offset.some((v) => Math.abs(v) > 1e-6)) wrapSceneChildren(doc, scene, "base-no-chao").setTranslation(offset);
    }

    await doc.transform(dedup(), prune({ keepLeaves: true }), textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [size, size], quality: 88 }));
    for (const extension of doc.getRoot().listExtensionsUsed()) {
      if (extension.extensionName === "EXT_texture_webp") extension.dispose();
    }
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
/**
 * Nome e descrição: na mesma rodada, a IA lê as mesmas fotos UMA vez e o rascunho
 * fica guardado nos detalhes da tarefa (o botão "Aprimorar descrição" só lê). Corre
 * junto com as imagens, sem aumentar a espera, e só se o produto ainda não tem
 * rascunho. Sem o motor de textos (processador local), não faz nada.
 */
export async function startCopyDraft(supabase, job, product, references, engines) {
  if (!engines.copyDraft) return {};
  const { data: existing } = await supabase
    .from("ai_jobs")
    .select("id")
    .eq("product_id", product.id)
    .not("details->copy", "is", null)
    .limit(1);
  if (existing?.length) return {};
  try {
    const copy = await engines.copyDraft(references, product);
    // Já aparece no painel antes de as fotos de catálogo terminarem.
    await supabase.from("ai_jobs").update({ details: { copy } }).eq("id", job.id);
    return { copy };
  } catch (e) {
    return { copyError: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}

async function catalogPhotos(supabase, job, product, _inputFile, dir, engines, uploaded) {
  // As referências são as fotos do celular como foram tiradas: não precisa esperar a limpeza.
  const { data: cleaned, error } = await supabase
    .from("ai_jobs")
    .select("input_path")
    .eq("product_id", product.id)
    .eq("kind", "background_removal")
    .neq("status", "failed")
    .order("created_at");
  if (error) throw new Error(error.message);
  if (!cleaned?.length) throw new Error("Envie pelo menos uma foto do produto antes.");

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
  const copyTask = startCopyDraft(supabase, job, product, references, engines);
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
  const copyResult = await copyTask;
  return {
    output_media_id: mediaIds[0] ?? null,
    details: {
      mediaIds,
      cutouts,
      style,
      views: shots.map((s) => s.view),
      references: references.length,
      ...copyResult,
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
export async function processJob(supabase, job, engines, engineNames = {}) {
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
export async function processNext(supabase, kinds, engines, engineNames = {}) {
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

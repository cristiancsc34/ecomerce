/**
 * Limpeza de fundo pela API da fal.ai (BiRefNet) e o enquadramento padrão da
 * loja feito aqui mesmo, com sharp. É a versão sem Python de
 * ai/remove_background.py: mesmas saídas, mesmo fundo, mesma sombra.
 *
 *   * recorte PNG com transparência (base do 3D e das fotos de catálogo);
 *   * foto "de estúdio" JPEG 4:3 (1600 × 1200) com fundo creme (ou neutro) e
 *     sombra de contato.
 *
 * Usado pela IA na nuvem (Vercel) e pelo processador local quando ele não tem
 * o BiRefNet instalado mas tem FAL_KEY. Diferença do Python: não há o passo de
 * profundidade (Depth Anything) que descarta um móvel mais ao fundo; continuam
 * descartadas as manchas soltas longe do objeto principal.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const FAL_BIREFNET_URL = "https://fal.run/fal-ai/birefnet/v2";
export const FAL_ENGINE_NAME = "fal.ai BiRefNet";
const FAL_MAX_SIDE = 2048; // a foto vai menor para a API: o BiRefNet trabalha em 1024
const FAL_TIMEOUT_MS = 2 * 60_000;

export const STUDIO_SIZE = { width: 1600, height: 1200 }; // 4:3, como a galeria
export const MAX_CUTOUT_SIDE = 1024;
// Fundo das fotos de estúdio (degradê do topo para a base) e cor da sombra.
// Mesmos valores de ai/remove_background.py. Padrão da loja: creme.
export const BACKGROUNDS = {
  creme: { top: [249, 245, 239], bottom: [239, 231, 219], shadow: [62, 52, 42] },
  neutro: { top: [252, 252, 253], bottom: [236, 239, 243], shadow: [40, 48, 60] },
};

/** Foto já de pé (EXIF do celular) em RGBA cru. */
async function readRgba(input) {
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function alphaOf({ data, width, height }) {
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return alpha;
}

/** Já veio recortada (ex.: foto de catálogo gerada com fundo transparente)? */
export function isCutout(rgba) {
  for (let i = 3; i < rgba.data.length; i += 4) if (rgba.data[i] < 250) return true;
  return false;
}

/**
 * Descarta manchas soltas longe do objeto principal (restos do cenário). Partes
 * grandes (≥ 8% da maior, ex.: pés separados na imagem) ficam, com a borda suave
 * ao redor (6 px). Igual ao keep_main_object do Python (vizinhança em cruz).
 */
export function keepMainObject(alpha, width, height) {
  const n = width * height;
  const labels = new Int32Array(n);
  const sizes = [0];
  const stack = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (alpha[start] <= 127 || labels[start]) continue;
    const label = sizes.length;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    const visit = (q) => {
      if (alpha[q] > 127 && !labels[q]) {
        labels[q] = label;
        stack[top++] = q;
      }
    };
    while (top) {
      const p = stack[--top];
      size++;
      const x = p % width;
      if (x > 0) visit(p - 1);
      if (x < width - 1) visit(p + 1);
      if (p >= width) visit(p - width);
      if (p + width < n) visit(p + width);
    }
    sizes.push(size);
  }
  if (sizes.length === 1) return alpha;

  let biggest = 0;
  for (const s of sizes) if (s > biggest) biggest = s;
  const keep = sizes.map((s) => s >= biggest * 0.08);
  // Distância em "passos de cruz" até a parte mantida mais próxima (duas passadas).
  const far = 1 << 20;
  const dist = new Int32Array(n);
  for (let p = 0; p < n; p++) dist[p] = labels[p] && keep[labels[p]] ? 0 : far;
  for (let p = 0; p < n; p++) {
    const x = p % width;
    if (x > 0) dist[p] = Math.min(dist[p], dist[p - 1] + 1);
    if (p >= width) dist[p] = Math.min(dist[p], dist[p - width] + 1);
  }
  for (let p = n - 1; p >= 0; p--) {
    const x = p % width;
    if (x < width - 1) dist[p] = Math.min(dist[p], dist[p + 1] + 1);
    if (p + width < n) dist[p] = Math.min(dist[p], dist[p + width] + 1);
  }
  const out = new Uint8Array(n);
  for (let p = 0; p < n; p++) out[p] = dist[p] <= 6 ? alpha[p] : 0;
  return out;
}

function bbox(alpha, width, height, threshold = 12) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] <= threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error("Nenhum objeto encontrado na foto.");
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Fundo da loja: degradê vertical bem suave do topo para a base. */
function gradient(width, height, { top, bottom }) {
  const bg = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const t = height > 1 ? y / (height - 1) : 0;
    const row = top.map((c, i) => Math.floor(c + (bottom[i] - c) * t));
    for (let x = 0; x < width; x++) bg.set(row, (y * width + x) * 3);
  }
  return bg;
}

/**
 * Foto de estúdio: objeto com até 82% da altura e 86% da largura, apoiado em 90%
 * da altura, com uma sombra de contato (silhueta achatada e desfocada) embaixo.
 */
async function studio(crop, fundo) {
  const { width: w, height: h } = STUDIO_SIZE;
  const colors = BACKGROUNDS[fundo] ?? BACKGROUNDS.creme;
  const meta = await sharp(crop).metadata();
  const scale = Math.min((h * 0.82) / meta.height, (w * 0.86) / meta.width);
  const objW = Math.max(1, Math.round(meta.width * scale));
  const objH = Math.max(1, Math.round(meta.height * scale));
  const obj = await sharp(crop).resize(objW, objH, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
  const x = Math.floor((w - objW) / 2);
  const floor = Math.round(h * 0.9);
  const y = floor - objH;

  const shadowH = Math.max(8, Math.floor(objH / 14));
  const contact = await sharp(obj).extractChannel("alpha").resize(objW, shadowH, { fit: "fill", kernel: "linear" }).raw().toBuffer();
  const plane = Buffer.alloc(w * h);
  const top = floor - Math.round(shadowH * 0.8);
  for (let r = 0; r < shadowH; r++) {
    const row = top + r;
    if (row < 0 || row >= h) continue;
    for (let c = 0; c < objW; c++) {
      const col = x + c;
      if (col >= 0 && col < w) plane[row * w + col] = contact[r * objW + c];
    }
  }
  const blurred = await sharp(plane, { raw: { width: w, height: h, channels: 1 } })
    .blur(Math.max(6, Math.floor(objH / 45)))
    .extractChannel(0) // o sharp devolve 3 canais depois do desfoque
    .raw()
    .toBuffer();
  const shadow = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    shadow.set(colors.shadow, p * 4);
    shadow[p * 4 + 3] = Math.floor(blurred[p] * 0.42);
  }

  const composed = await sharp(gradient(w, h, colors), { raw: { width: w, height: h, channels: 3 } })
    .composite([
      { input: shadow, raw: { width: w, height: h, channels: 4 } },
      { input: obj, left: x, top: y },
    ])
    .png()
    .toBuffer();
  return sharp(composed).flatten({ background: colors.top }).jpeg({ quality: 90, progressive: true }).toBuffer();
}

/**
 * Recorte + foto de estúdio a partir de uma imagem RGBA cujo alfa já separa o
 * objeto do fundo. `cleanMask` descarta manchas soltas (só para máscaras da IA).
 */
export async function composeStudio(rgba, { fundo = "creme", cleanMask = true } = {}) {
  const { width, height } = rgba;
  let alpha = alphaOf(rgba);
  if (cleanMask) {
    alpha = keepMainObject(alpha, width, height);
    for (let p = 0; p < alpha.length; p++) rgba.data[p * 4 + 3] = alpha[p];
  }
  const { x0, y0, x1, y1 } = bbox(alpha, width, height);
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
  const left = Math.max(0, x0 - pad);
  const top = Math.max(0, y0 - pad);
  const region = { left, top, width: Math.min(width, x1 + pad) - left, height: Math.min(height, y1 + pad) - top };
  const crop = await sharp(rgba.data, { raw: { width, height, channels: 4 } }).extract(region).png().toBuffer();

  const cutout = await sharp(crop)
    .resize(MAX_CUTOUT_SIDE, MAX_CUTOUT_SIDE, { fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  let solid = 0;
  for (const a of alpha) if (a > 127) solid++;
  return {
    cutout,
    studio: await studio(crop, fundo),
    meta: {
      width: STUDIO_SIZE.width,
      height: STUDIO_SIZE.height,
      coverage: Math.round((solid / alpha.length) * 10_000) / 10_000,
      droppedBackgroundObject: false,
    },
  };
}

function falError(status, body) {
  const detail = typeof body?.detail === "string" ? body.detail : Array.isArray(body?.detail) ? body.detail[0]?.msg : null;
  if (status === 401) return "chave inválida. Confira a FAL_KEY.";
  if (/balance|locked|billing|credit/i.test(String(detail ?? ""))) return "sem saldo. Recarregue a conta da fal.ai.";
  return detail ?? `erro ${status}`;
}

/** Manda a foto para o BiRefNet da fal.ai e devolve o PNG com o fundo transparente. */
async function falRemoveBackground(apiKey, input, fetchImpl) {
  const jpeg = await sharp(input)
    .rotate()
    .resize(FAL_MAX_SIDE, FAL_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
  const res = await fetchImpl(FAL_BIREFNET_URL, {
    method: "POST",
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
    // sync_mode: a imagem volta na própria resposta e não fica guardada no histórico da fal.ai.
    body: JSON.stringify({
      image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      output_format: "png",
      refine_foreground: true,
      sync_mode: true,
    }),
    signal: AbortSignal.timeout(FAL_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`fal.ai: ${falError(res.status, body)}`.slice(0, 300));
  const url = body?.image?.url;
  if (typeof url !== "string") throw new Error("A fal.ai não devolveu a imagem.");
  if (url.startsWith("data:")) return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  const image = await fetchImpl(url, { signal: AbortSignal.timeout(FAL_TIMEOUT_MS) });
  if (!image.ok) throw new Error(`fal.ai: falha ao baixar a imagem (${image.status}).`);
  return Buffer.from(await image.arrayBuffer());
}

/** Motor de limpeza com a fal.ai (mesma interface de pythonEngines.backgroundRemoval). */
export function falBackgroundEngine(apiKey = process.env.FAL_KEY, { fetchImpl = fetch } = {}) {
  return {
    async backgroundRemoval(input, dir, { fundo = "creme" } = {}) {
      const started = Date.now();
      const original = await readRgba(input);
      const alreadyCut = isCutout(original);
      // Imagem já recortada: só aplica o enquadramento padrão da loja (não gasta a API).
      const rgba = alreadyCut ? original : await readRgba(await falRemoveBackground(apiKey, input, fetchImpl));
      const result = await composeStudio(rgba, { fundo, cleanMask: !alreadyCut });
      const cutout = path.join(dir, "recorte.png");
      const studioFile = path.join(dir, "estudio.jpg");
      await writeFile(cutout, result.cutout);
      await writeFile(studioFile, result.studio);
      return {
        cutout,
        studio: studioFile,
        meta: { ...result.meta, ...(alreadyCut ? {} : { engine: "fal", seconds: Math.round((Date.now() - started) / 1000) }) },
      };
    },
  };
}

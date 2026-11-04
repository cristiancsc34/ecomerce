#!/usr/bin/env node
/**
 * DADO DE EXEMPLO (só para desenvolvimento): a Poltrona Azul recolorida em
 * marrom, branco, vermelho e bege, para mostrar a troca de cor na página do
 * produto sem cadastrar cores que a loja não vende.
 *
 *   npm run demo:variantes          # fotos recoloridas por computador (grátis, na hora)
 *   npm run demo:variantes:gpt      # fotos geradas pelo GPT (precisa de OPENAI_API_KEY)
 *
 * Gera em public/demo/exemplo/:
 * - as 4 fotos de catálogo de cada cor (só o tecido muda de cor: a madeira, o
 *   fundo e as sombras ficam como na foto original). No modo GPT, cada foto
 *   gerada é conferida com a original (fidelityCheck: fora do tecido, madeira,
 *   forma do tecido e cor pedida); se a IA mexeu na peça, acrescentou algo ou
 *   errou a cor em qualquer ângulo, a cor inteira fica com a versão recolorida
 *   por computador;
 * - poltrona-cores.glb: o modelo 3D com as 5 cores no mesmo arquivo
 *   (extensão KHR_materials_variants; o visualizador troca pelo nome da cor).
 *   No modo GPT, a cor do 3D é a cor medida no tecido das fotos geradas.
 *
 * Só aparece na loja com CATALOG_DEV_EXAMPLES=1, fora da Vercel e no modo
 * demonstração (lib/catalog/dev-examples.ts). Não são fotos reais: para vender
 * uma cor de verdade, cadastre a variação no painel com as fotos do produto.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRMaterialsVariants } from "@gltf-transform/extensions";
import sharp from "sharp";

const ROOT = process.cwd();
const DEMO = path.join(ROOT, "public", "demo");
const OUT = path.join(DEMO, "exemplo");
const VIEWS = ["frente", "tres-quartos", "lateral", "traseira"];

/** Cores de exemplo (hex do tecido). "azul" é a original. */
export const EXAMPLE_COLORS = [
  { slug: "azul", name: "Azul", hex: "#2F3E62" },
  { slug: "marrom", name: "Marrom", hex: "#6B4A35" },
  { slug: "branco", name: "Branco", hex: "#ECE7DE" },
  { slug: "vermelho", name: "Vermelho", hex: "#9C2A2A" },
  { slug: "bege", name: "Bege", hex: "#CDB797" },
];

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Peso do "tecido azul" no pixel (0–1): matiz azul, saturado o bastante. */
export function fabricWeight(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (!d || max < 0.02) return 0;
  const s = d / max;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const hueDistance = Math.abs(h - 222);
  return (1 - smooth(28, 48, hueDistance)) * smooth(0.12, 0.28, s);
}

const luminance = (r, g, b) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/** Luminância média do tecido na imagem (referência para manter as dobras e sombras). */
function fabricLuminance(data) {
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const w = fabricWeight(r, g, b);
    if (w < 0.5) continue;
    sum += luminance(r, g, b) * w;
    weight += w;
  }
  return weight ? sum / weight : 0.05;
}

/**
 * Troca a cor do tecido mantendo o sombreado: cada pixel do tecido vira a cor
 * nova × (luminância do pixel ÷ luminância média do tecido), em espaço linear.
 */
export async function recolor(input, hex, { reference } = {}) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mean = reference ?? fabricLuminance(data);
  const target = hexRgb(hex).map(toLinear);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const w = fabricWeight(r, g, b);
    if (!w) {
      out[i] = data[i];
      out[i + 1] = data[i + 1];
      out[i + 2] = data[i + 2];
      continue;
    }
    const k = luminance(r, g, b) / mean;
    for (let c = 0; c < 3; c++) {
      const recolored = toSrgb(Math.min(1, target[c] * k));
      const original = data[i + c] / 255;
      out[i + c] = Math.round((original * (1 - w) + recolored * w) * 255);
    }
  }
  return { image: sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }), mean };
}

const toHex = (rgb) => `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

// ---------------------------------------------------------------------------
// Conferência da foto gerada pela IA (regra da loja: o produto não muda e nenhum
// objeto é acrescentado; só a cor do tecido troca)
// ---------------------------------------------------------------------------

/** Tamanho da célula da conferência, em pixels (a IA redesenha tudo: pixel a pixel nunca bate). */
const CELL = 4;

/** Média de cada célula de CELL×CELL pixels (RGB 0–255). */
async function cellImage(input, width, height) {
  const w = Math.round(width / CELL);
  const h = Math.round(height / CELL);
  const data = await sharp(input).removeAlpha().resize(w, h, { fit: "fill", kernel: "cubic" }).raw().toBuffer();
  return { w, h, data };
}

/** Erosão (todas as células da janela) ou dilatação (alguma célula) num quadrado de lado 2r+1. */
function morph(mask, w, h, r, isErode) {
  const pass = (src, horizontal) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = isErode ? 1 : 0;
        for (let d = -r; d <= r; d++) {
          const xx = horizontal ? x + d : x;
          const yy = horizontal ? y : y + d;
          const m = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : src[yy * w + xx];
          if (isErode ? !m : m) {
            v = isErode ? 0 : 1;
            break;
          }
        }
        out[y * w + x] = v;
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
}
const erode = (m, w, h, r) => morph(m, w, h, r, true);
const dilate = (m, w, h, r) => morph(m, w, h, r, false);

/** Maior mancha contínua da máscara (vizinhança de 4), em células. */
function largestBlob(mask, w) {
  const seen = new Uint8Array(mask.length);
  const stack = [];
  let best = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let size = 0;
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop();
      size++;
      const x = j % w;
      for (const k of [j - w, j + w, x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1]) {
        if (k >= 0 && k < mask.length && mask[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    best = Math.max(best, size);
  }
  return best;
}

/** sRGB (0–1) → Lab (D65). */
function lab([r, g, b]) {
  const [R, G, B] = [r, g, b].map(toLinear);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (t * 24389) / 27 / 116 + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const median = (values) => {
  const v = Float64Array.from(values).sort();
  return v.length ? v[v.length >> 1] : 0;
};

/** Limites da conferência (calibrados com as 16 fotos recoloridas por computador e com fotos adulteradas). */
export const FIDELITY_LIMITS = {
  /** Diferença média fora do tecido (0–255). */
  maxMeanDiff: 10,
  /** Célula "mudou" fora do tecido a partir desta diferença (0–255). */
  changedCell: 28,
  /** Maior mancha mudada aceita, em fração da imagem (0,1% ≈ 44 × 44 px em 1600 × 1200). */
  maxBlobShare: 0.001,
  /** Diferença de cor média (ΔE) aceita na madeira e no resto da peça fora do tecido. */
  maxFrameDeltaE: 6,
  /** Fração do tecido que pode fugir do sombreado e da cor do resto do tecido. */
  maxFabricAnomalyShare: 0.03,
  /** Distância (ΔE) aceita entre a cor medida no tecido e a cor pedida. */
  maxColorDeltaE: 28,
};

/**
 * Confere uma foto gerada pela IA com a original. Recusa (ok = false, com os
 * motivos) quando:
 * - fora do tecido (madeira, fundo, sombra), alguma mancha mudou (objeto novo,
 *   peça deslocada, parte apagada) ou a imagem inteira mudou;
 * - a madeira (e o resto da peça fora do tecido) mudou de tom ou de acabamento;
 * - dentro do tecido, alguma região não segue o sombreado da original nem a cor
 *   do resto do tecido (almofada ou manta acrescentada, encosto cortado, outra
 *   forma);
 * - com `targetHex`, a cor medida no tecido não é a pedida (ou continua a original).
 * Trabalha em células de 4×4 px: a IA redesenha a imagem inteira e pixel a pixel
 * nunca bate. Na dúvida recusa: a reserva (recolor por computador) é fiel.
 *
 * @param {Buffer} original
 * @param {Buffer} generated
 * @param {{ targetHex?: string | null; limits?: Partial<typeof FIDELITY_LIMITS> }} [options]
 */
export async function fidelityCheck(original, generated, { targetHex = null, limits = {} } = {}) {
  const L = { ...FIDELITY_LIMITS, ...limits };
  const { width, height } = await sharp(original).metadata();
  const A = await cellImage(original, width, height);
  const B = await cellImage(await sharp(generated).removeAlpha().resize(width, height, { fit: "fill" }).toBuffer(), width, height);
  const { w, h } = A;
  const n = w * h;
  const px = (img, i) => [img.data[i * 3] / 255, img.data[i * 3 + 1] / 255, img.data[i * 3 + 2] / 255];

  // Regiões da original: tecido, borda do tecido, resto da peça (madeira, sombra) e fundo.
  const weight = new Float32Array(n);
  const anyFabric = new Uint8Array(n);
  const fabric = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    weight[i] = fabricWeight(...px(A, i));
    anyFabric[i] = weight[i] > 0 ? 1 : 0;
    fabric[i] = weight[i] > 0.5 ? 1 : 0;
  }
  const nearFabric = dilate(anyFabric, w, h, 2);
  const fabricCore = erode(fabric, w, h, 1);
  const ring = [];
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const y = (i / w) | 0;
    if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) ring.push(i);
  }
  const bg = [0, 1, 2].map((c) => median(ring.map((i) => A.data[i * 3 + c])));
  const diff = (i) => (Math.abs(A.data[i * 3] - B.data[i * 3]) + Math.abs(A.data[i * 3 + 1] - B.data[i * 3 + 1]) + Math.abs(A.data[i * 3 + 2] - B.data[i * 3 + 2])) / 3;
  const fromBg = (i) => (Math.abs(A.data[i * 3] - bg[0]) + Math.abs(A.data[i * 3 + 1] - bg[1]) + Math.abs(A.data[i * 3 + 2] - bg[2])) / 3;

  // 1) Fora do tecido: diferença média e maior mancha mudada (abertura de 5 × 5
  // células descarta faixas finas, como um deslocamento de poucos pixels na borda).
  const changed = new Uint8Array(n);
  let sum = 0;
  let count = 0;
  let changedCount = 0;
  const frameA = [0, 0, 0];
  const frameB = [0, 0, 0];
  let frameCount = 0;
  for (let i = 0; i < n; i++) {
    if (nearFabric[i]) continue;
    const d = diff(i);
    sum += d;
    count++;
    if (d > L.changedCell) {
      changed[i] = 1;
      changedCount++;
    }
    // Resto da peça (madeira, base, sombra): o que difere do fundo na original.
    if (fromBg(i) > 24) {
      for (let c = 0; c < 3; c++) {
        frameA[c] += toLinear(A.data[i * 3 + c] / 255);
        frameB[c] += toLinear(B.data[i * 3 + c] / 255);
      }
      frameCount++;
    }
  }
  const meanDiff = count ? sum / count : 0;
  const changedShare = count ? changedCount / count : 0;
  const blobShare = largestBlob(dilate(erode(changed, w, h, 2), w, h, 2), w) / n;

  // 2) Madeira e resto da peça: mesma cor média (ΔE).
  const meanLab = (acc, k) => lab(acc.map((v) => toSrgb(v / k)));
  const frameDeltaE = frameCount ? deltaE(meanLab(frameA, frameCount), meanLab(frameB, frameCount)) : 0;

  // 3) Dentro do tecido: a luminância da gerada tem de seguir a da original por uma
  // curva crescente (a cor nova comprime os brilhos de outro jeito; por isso não
  // é uma reta) e a cromaticidade tem de ser a do resto do tecido. O que foge dos
  // dois é forma nova ou algo por cima. Faixas finas na borda (deslocamento de
  // poucos pixels) não contam.
  const core = [];
  for (let i = 0; i < n; i++) if (fabricCore[i]) core.push(i);
  const lum = (img, i) => luminance(...px(img, i));
  const la = core.map((i) => lum(A, i));
  const lb = core.map((i) => lum(B, i));
  const order = core.map((_, k) => k).sort((p, q) => la[p] - la[q]);
  const BINS = 32;
  const knots = [];
  for (let bIdx = 0; bIdx < BINS && order.length; bIdx++) {
    const slice = order.slice(Math.floor((bIdx * order.length) / BINS), Math.floor(((bIdx + 1) * order.length) / BINS));
    if (slice.length) knots.push([median(slice.map((k) => la[k])), median(slice.map((k) => lb[k]))]);
  }
  const curve = (x) => {
    if (!knots.length) return 0;
    if (x <= knots[0][0]) return knots[0][1];
    for (let k = 1; k < knots.length; k++) {
      if (x <= knots[k][0]) {
        const [x0, y0] = knots[k - 1];
        const [x1, y1] = knots[k];
        return x1 > x0 ? y0 + ((x - x0) / (x1 - x0)) * (y1 - y0) : y1;
      }
    }
    return knots[knots.length - 1][1];
  };
  const res = core.map((_, k) => lb[k] - curve(la[k]));
  const sigma = 1.4826 * median(res.map(Math.abs));
  const chroma = (img, i) => {
    const rgb = px(img, i);
    if (Math.max(...rgb) > 0.96) return null; // brilho estourado: sem cor para comparar
    const [r, g, b] = rgb.map(toLinear);
    const t = r + g + b;
    return t > 0.03 ? [r / t, g / t] : null;
  };
  const chromaB = core.map((i) => chroma(B, i));
  const lit = chromaB.filter(Boolean);
  const chromaRef = [median(lit.map((c) => c[0])), median(lit.map((c) => c[1]))];
  const anomaly = new Uint8Array(n);
  const fabricSum = [0, 0, 0];
  core.forEach((i, k) => {
    const c = chromaB[k];
    const expected = curve(la[k]);
    const offShade = Math.abs(res[k]) > Math.max(0.035, 5 * sigma) && Math.abs(res[k]) > 0.35 * Math.max(lb[k], expected);
    const offHue = c !== null && Math.hypot(c[0] - chromaRef[0], c[1] - chromaRef[1]) > 0.07;
    if (offShade || offHue) anomaly[i] = 1;
    for (let ch = 0; ch < 3; ch++) fabricSum[ch] += toLinear(B.data[i * 3 + ch] / 255);
  });
  const opened = dilate(erode(anomaly, w, h, 2), w, h, 2);
  let anomalyCount = 0;
  for (const i of core) if (opened[i]) anomalyCount++;
  const fabricAnomalyShare = core.length ? anomalyCount / core.length : 1;
  const fabricBlobShare = largestBlob(opened, w) / n;
  const fabricRgb = core.length ? fabricSum.map((v) => toSrgb(v / core.length)) : null;
  const fabricHex = fabricRgb ? toHex(fabricRgb) : null;

  // 4) Cor pedida: a medida tem de estar perto dela e mais perto dela que da original.
  let colorDeltaE = null;
  let colorOk = true;
  if (targetHex && fabricRgb) {
    const origSum = [0, 0, 0];
    for (const i of core) for (let ch = 0; ch < 3; ch++) origSum[ch] += toLinear(A.data[i * 3 + ch] / 255);
    const origLab = lab(origSum.map((v) => toSrgb(v / core.length)));
    const gotLab = lab(fabricRgb);
    colorDeltaE = deltaE(gotLab, lab(hexRgb(targetHex)));
    colorOk = colorDeltaE <= L.maxColorDeltaE && colorDeltaE < deltaE(gotLab, origLab);
  }

  const reasons = [];
  if (meanDiff > L.maxMeanDiff) reasons.push("a imagem inteira mudou fora do tecido");
  if (blobShare > L.maxBlobShare) reasons.push("uma região mudou fora do tecido (objeto novo, peça deslocada ou parte apagada)");
  if (frameDeltaE > L.maxFrameDeltaE) reasons.push("a madeira ou o resto da peça mudou de tom");
  if (fabricAnomalyShare > L.maxFabricAnomalyShare || fabricBlobShare > L.maxBlobShare) {
    reasons.push("o tecido mudou de forma ou ganhou algo por cima (não é só a cor)");
  }
  if (!colorOk) reasons.push("a cor do tecido não é a pedida");
  return {
    ok: reasons.length === 0,
    reasons,
    meanDiff,
    changedShare,
    blobShare,
    frameDeltaE,
    fabricAnomalyShare,
    fabricBlobShare,
    colorDeltaE,
    fabricHex,
  };
}

/**
 * Fotos de uma cor pelo GPT, com conferência. A cor só usa o GPT se os 4 ângulos
 * passarem (assim o tom é o mesmo em todas as fotos); senão, a cor inteira fica
 * com a versão recolorida por computador. Devolve a cor medida na frente (para o
 * 3D) ou null.
 */
async function gptPhotos(color, engine, report) {
  const dir = await mkdtemp(path.join(tmpdir(), "cuxoes-cores-"));
  try {
    const shots = [];
    for (const view of VIEWS) {
      const sourceFile = path.join(DEMO, `poltrona-azul-${view}.jpg`);
      const original = await readFile(sourceFile);
      const output = path.join(dir, `${color.slug}-${view}.jpg`);
      try {
        await engine.recolor(sourceFile, color.name.toLowerCase(), color.hex, output);
        const generated = await readFile(output);
        shots.push({ view, original, generated, check: await fidelityCheck(original, generated, { targetHex: color.hex }) });
      } catch (e) {
        shots.push({ view, original, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
      }
    }
    const allOk = shots.every((shot) => shot.check?.ok);
    for (const shot of shots) {
      const target = path.join(OUT, `poltrona-${color.slug}-${shot.view}.jpg`);
      if (allOk) {
        const { width, height } = await sharp(shot.original).metadata();
        await writeFile(target, await sharp(shot.generated).resize(width, height, { fit: "fill" }).jpeg({ quality: 84, mozjpeg: true }).toBuffer());
      } else {
        const { image } = await recolor(shot.original, color.hex);
        await writeFile(target, await image.jpeg({ quality: 84, mozjpeg: true }).toBuffer());
      }
      const entry = {
        cor: color.slug,
        vista: shot.view,
        fonte: allOk ? "gpt" : "computador",
        ...(shot.check ?? {}),
        ...(shot.error ? { erro: shot.error } : {}),
        ...(!allOk && shot.check?.ok ? { observacao: "passou, mas outro ângulo desta cor não passou: a cor inteira fica pelo computador" } : {}),
      };
      report.push(entry);
      const why = shot.error ?? (shot.check.ok ? (allOk ? "conferida" : entry.observacao) : shot.check.reasons.join("; "));
      console.log(`${color.name} · ${shot.view}: ${entry.fonte} (${why})`);
    }
    return allOk ? (shots.find((shot) => shot.view === "frente")?.check.fabricHex ?? null) : null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(args) {
  await mkdir(OUT, { recursive: true });
  const useGpt = args.includes("--gpt");
  let engine = null;
  if (useGpt) {
    if (!process.env.OPENAI_API_KEY) {
      console.error("Modo --gpt precisa da variável OPENAI_API_KEY. Sem ela, rode sem --gpt (recolor por computador).");
      process.exit(1);
    }
    const { openaiRecolorEngine } = await import("./ai-pipeline.mjs");
    engine = openaiRecolorEngine();
  }

  // Fotos de catálogo: cada cor nos 4 ângulos. A cor do 3D segue a cor das fotos.
  const report = [];
  const colors3d = Object.fromEntries(EXAMPLE_COLORS.map((c) => [c.slug, c.hex]));
  for (const color of EXAMPLE_COLORS.filter((c) => c.slug !== "azul")) {
    if (engine) {
      const measured = await gptPhotos(color, engine, report);
      if (measured) colors3d[color.slug] = measured;
    } else {
      for (const view of VIEWS) {
        const source = await readFile(path.join(DEMO, `poltrona-azul-${view}.jpg`));
        const { image } = await recolor(source, color.hex);
        const file = path.join(OUT, `poltrona-${color.slug}-${view}.jpg`);
        await writeFile(file, await image.jpeg({ quality: 84, mozjpeg: true }).toBuffer());
      }
      console.log(`fotos: ${color.name}`);
    }
  }
  if (engine) {
    await writeFile(path.join(OUT, "relatorio-gpt.json"), JSON.stringify({ cores3d: colors3d, fotos: report }, null, 2));
    const fromGpt = report.filter((r) => r.fonte === "gpt").length;
    console.log(`GPT aprovado em ${fromGpt} de ${report.length} fotos (as outras ficaram recoloridas por computador).`);
  }

  // Modelo 3D com as cores no mesmo arquivo (KHR_materials_variants).
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path.join(DEMO, "poltrona-azul.glb"));
  const root = doc.getRoot();
  const [material] = root.listMaterials();
  const baseTexture = material.getBaseColorTexture();
  const baseImage = Buffer.from(baseTexture.getImage());
  const { mean } = await recolor(baseImage, EXAMPLE_COLORS[0].hex);

  const ext = doc.createExtension(KHRMaterialsVariants);
  const variants = Object.fromEntries(EXAMPLE_COLORS.map((c) => [c.slug, ext.createVariant(c.slug)]));
  const materials = { azul: material };
  for (const color of EXAMPLE_COLORS.filter((c) => c.slug !== "azul")) {
    const { image } = await recolor(baseImage, colors3d[color.slug], { reference: mean });
    const texture = doc
      .createTexture(`tecido-${color.slug}`)
      .setMimeType("image/jpeg")
      .setImage(new Uint8Array(await image.resize(1024, 1024).jpeg({ quality: 82, mozjpeg: true }).toBuffer()));
    materials[color.slug] = material.clone().setName(`tecido-${color.slug}`).setBaseColorTexture(texture);
  }
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMaterial() !== material) continue;
      const mappingList = ext.createMappingList();
      for (const color of EXAMPLE_COLORS) {
        mappingList.addMapping(ext.createMapping().setMaterial(materials[color.slug]).addVariant(variants[color.slug]));
      }
      prim.setExtension("KHR_materials_variants", mappingList);
    }
  }
  const glb = Buffer.from(await io.writeBinary(doc));
  await writeFile(path.join(OUT, "poltrona-cores.glb"), glb);
  console.log(`modelo 3D com ${EXAMPLE_COLORS.length} cores: ${(glb.length / 1024 / 1024).toFixed(2)} MB`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));

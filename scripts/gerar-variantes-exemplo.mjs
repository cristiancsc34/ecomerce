#!/usr/bin/env node
/**
 * DADO DE EXEMPLO (só para desenvolvimento): a Poltrona Azul recolorida em
 * marrom, branco, vermelho e bege, para mostrar a troca de cor na página do
 * produto sem cadastrar cores que a loja não vende.
 *
 *   npm run demo:variantes          # fotos recoloridas por computador (grátis, na hora)
 *   npm run demo:variantes:gpt      # tom da cor pelo GPT (precisa de OPENAI_API_KEY aqui)
 *
 * As fotos que o GPT devolve ficam em ai/cache/cores-gpt (fora do git): rodar de novo reaproveita e só paga o
 * que faltou. Para pedir de novo uma cor que o GPT errou: --refazer=vermelho (ou várias, separadas por vírgula).
 * Com --fotos-do-gpt, a loja usa a própria foto do GPT (escolha do dono em 04/11/2026), só depois de uma pessoa
 * comparar as 16 com as originais (ai/cache/cores-gpt).
 *
 * Gera em public/demo/exemplo/:
 * - as 4 fotos de catálogo de cada cor (só o tecido muda de cor: a madeira, o
 *   fundo e as sombras ficam como na foto original, pixel a pixel). No modo GPT,
 *   o GPT gera os 4 ângulos na cor nova, mas a foto da loja continua sendo a
 *   original: das fotos do GPT sai só o tom da cor (gptTone: que cor o tecido tem
 *   em cada nível de luz). Assim a IA não tem como mudar a peça nem acrescentar
 *   nada. Se o tom não serve (foto que não corresponde, tecido com mais de uma
 *   cor, cor diferente da pedida), a cor inteira fica com o recolor por computador;
 * - poltrona-cores.glb: o modelo 3D com as 5 cores no mesmo arquivo
 *   (extensão KHR_materials_variants; o visualizador troca pelo nome da cor).
 *   No modo GPT, a cor do 3D é a cor medida com o tom do GPT.
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
/** Fotos do GPT já pagas (fora do git): rodar de novo reaproveita e só pede o que falta. */
const GPT_CACHE = path.join(ROOT, "ai", "cache", "cores-gpt");
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

/** Matiz (0–360), saturação e valor de um pixel (0–1). */
function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return { h: 0, s: 0, v: max };
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: d / max, v: max };
}

/** Erosão ou dilatação num quadrado de lado 2r+1 (fora da imagem conta como vazio). */
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

/**
 * Área do tecido a repintar (0–1 por pixel): o tecido azul (fabricWeight) e mais
 * - as sombras escuras cercadas de tecido (o azul quase preto não tem cor para reconhecer e virava ponto escuro);
 * - a borda com tom azulado (mistura do tecido com o fundo), para não sobrar friso azul na cor nova.
 * Madeira (alaranjada) e fundo (creme) nunca entram.
 */
export function fabricMask(data, width, height) {
  const n = width * height;
  const alpha = new Float32Array(n);
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    alpha[i] = fabricWeight(data[i * 3] / 255, data[i * 3 + 1] / 255, data[i * 3 + 2] / 255);
    solid[i] = alpha[i] > 0.35 ? 1 : 0;
  }
  const closed = morph(morph(solid, width, height, 4, false), width, height, 4, true);
  const band = morph(closed, width, height, 2, false);
  for (let i = 0; i < n; i++) {
    if (solid[i]) {
      alpha[i] = 1;
      continue;
    }
    if (!band[i]) continue;
    const [r, g, b] = [data[i * 3] / 255, data[i * 3 + 1] / 255, data[i * 3 + 2] / 255];
    const { h, s, v } = hsv(r, g, b);
    if (h >= 10 && h <= 60 && s > 0.3 && v > 0.15) continue; // madeira
    const bluish = h >= 190 && h <= 260 && s > 0.06;
    const dark = luminance(r, g, b) < 0.03;
    if (bluish || (closed[i] && dark)) alpha[i] = 1;
  }
  return alpha;
}

/** Repinta o tecido: cada pixel dele vira tone(luz do pixel); o resto da foto fica igual, pixel a pixel. */
function paintFabric(data, info, tone) {
  const out = Buffer.alloc(data.length);
  const mask = fabricMask(data, info.width, info.height);
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const w = mask[i / 3];
    if (!w) {
      out[i] = data[i];
      out[i + 1] = data[i + 1];
      out[i + 2] = data[i + 2];
      continue;
    }
    const color = tone(luminance(r, g, b));
    for (let c = 0; c < 3; c++) {
      const recolored = toSrgb(Math.min(1, color[c]));
      const original = data[i + c] / 255;
      out[i + c] = Math.round((original * (1 - w) + recolored * w) * 255);
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } });
}

/**
 * Troca a cor do tecido mantendo o sombreado: cada pixel do tecido vira a cor
 * nova × (luminância do pixel ÷ luminância média do tecido), em espaço linear.
 */
export async function recolor(input, hex, { reference } = {}) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mean = reference ?? fabricLuminance(data);
  const target = hexRgb(hex).map(toLinear);
  return { image: paintFabric(data, info, (l) => target.map((t) => t * (l / mean))), mean };
}

/** Troca a cor do tecido por uma curva de tom (luz → cor linear), como a aprendida das fotos do GPT. */
export async function recolorWith(input, tone) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { image: paintFabric(data, info, tone) };
}

const toHex = (rgb) => `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

// ---------------------------------------------------------------------------
// Cor pelo GPT sem risco para o produto (regra da loja: o produto não muda e
// nenhum objeto é acrescentado). A foto final é SEMPRE a original com o tecido
// repintado: madeira, fundo, sombra e forma vêm da original, pixel a pixel. Da
// foto do GPT sai só o TOM da cor nova: que cor o tecido tem em cada nível de
// luz (sombra, dobra, brilho). O que a IA acrescentar, apagar ou mudar na foto
// dela (objeto, almofada, estampa, madeira, forma) não chega à loja.
// ---------------------------------------------------------------------------

/** Limites (calibrados com fotos recoloridas por computador, refeitas e adulteradas). */
export const TONE_LIMITS = {
  /** Maior deslocamento procurado entre a foto do GPT e a original, em px. */
  maxShift: 48,
  /**
   * Diferença média fora do tecido depois de alinhar (0–255, já descontada a
   * mudança geral de luz). Acima disso, a foto do GPT não corresponde à original
   * (outra peça, outro ângulo, peça fora do lugar) e o tom dela não serve.
   */
  maxAlignDiff: 10,
  /** ΔE a partir do qual um ponto do tecido do GPT "foge" do tom aprendido. */
  offToneDeltaE: 15,
  /** Fração do tecido do GPT que pode fugir do tom (estampa, almofada por cima, dois tons). */
  maxOffToneShare: 0.25,
  /** Ângulos que precisam dar certo, dos 4. */
  minViews: 3,
  /** Distância (ΔE) aceita entre a cor medida e a cor pedida. */
  maxColorDeltaE: 10,
};

/** RGB linear (0–1) → Lab (D65). */
function labLinear([R, G, B]) {
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

/** Erosão (todos os pontos da janela) num quadrado de lado 2r+1; fora da imagem conta como vazio. */
function erode(mask, w, h, r) {
  const pass = (src, horizontal) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 1;
        for (let d = -r; d <= r && v; d++) {
          const xx = horizontal ? x + d : x;
          const yy = horizontal ? y : y + d;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h || !src[yy * w + xx]) v = 0;
        }
        out[y * w + x] = v;
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
}

/** Média de blocos S×S: cinza (0–255) e peso do tecido de cada bloco. */
function blocks(data, W, H, S) {
  const w = Math.floor(W / S);
  const h = Math.floor(H / S);
  const rgb = new Float32Array(w * h * 3);
  for (let y = 0; y < h * S; y++) {
    const row = ((y / S) | 0) * w;
    for (let x = 0; x < w * S; x++) {
      const i = (y * W + x) * 3;
      const o = (row + ((x / S) | 0)) * 3;
      rgb[o] += data[i];
      rgb[o + 1] += data[i + 1];
      rgb[o + 2] += data[i + 2];
    }
  }
  const gray = new Float32Array(w * h);
  const fabric = new Float32Array(w * h);
  const k = S * S;
  for (let i = 0; i < w * h; i++) {
    const [r, g, b] = [rgb[i * 3] / k, rgb[i * 3 + 1] / k, rgb[i * 3 + 2] / k];
    gray[i] = (r + g + b) / 3;
    fabric[i] = fabricWeight(r / 255, g / 255, b / 255);
  }
  return { w, h, gray, fabric };
}

const grayOf = (data) => {
  const g = new Float32Array(data.length / 3);
  for (let i = 0; i < g.length; i++) g[i] = (data[i * 3] + data[i * 3 + 1] + data[i * 3 + 2]) / 3;
  return g;
};

/**
 * Melhor deslocamento (com escala sx, sy em torno do centro) em que a foto do
 * GPT bate com a original nos pontos da lista (fora do tecido). Ponto (x, y) da
 * original ↔ (cx + (x − cx)·sx + dx, cy + (y − cy)·sy + dy) na do GPT. Mede pela
 * correlação (não liga para a foto do GPT ter ficado um pouco mais clara ou escura).
 */
function searchShift(gA, gB, w, h, points, [sx, sy], range, around = [0, 0]) {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const n = points.length;
  const ax = new Float32Array(n);
  const ay = new Float32Array(n);
  const va = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const i = points[k];
    ax[k] = cx + ((i % w) - cx) * sx;
    ay[k] = cy + (((i / w) | 0) - cy) * sy;
    va[k] = gA[i];
  }
  let best = { dx: 0, dy: 0, score: -Infinity };
  for (let dy = around[1] - range; dy <= around[1] + range; dy++) {
    for (let dx = around[0] - range; dx <= around[0] + range; dx++) {
      let m = 0;
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let k = 0; k < n; k++) {
        const X = Math.round(ax[k] + dx);
        const Y = Math.round(ay[k] + dy);
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const a = va[k];
        const b = gB[Y * w + X];
        m++;
        sa += a;
        sb += b;
        saa += a * a;
        sbb += b * b;
        sab += a * b;
      }
      if (m < n * 0.6) continue;
      const cov = sab - (sa * sb) / m;
      const den = Math.sqrt(Math.max(1e-9, (saa - (sa * sa) / m) * (sbb - (sb * sb) / m)));
      const score = cov / den;
      if (score > best.score) best = { dx, dy, score };
    }
  }
  return best;
}

/**
 * Alinha a foto do GPT com a original: a IA redesenha a imagem inteira e pode
 * entregar a peça alguns pixels deslocada, um pouco maior ou menor, ou em outro
 * formato (cortando as sobras ou encolhendo com faixas). `B` é a foto do GPT já
 * esticada para W × H; `ratio` é o formato dela ÷ o da original. Devolve a
 * transformação e a diferença que sobra fora do tecido (0–255, já descontada a
 * mudança geral de luz).
 */
function alignTo(A, B, W, H, ratio, maxShift) {
  const S = 4;
  const a = blocks(A, W, H, S);
  const b = blocks(B, W, H, S);
  // Fora do tecido e longe da borda dele (2 blocos = 8 px): onde a foto do GPT tem de bater.
  const outside = Uint8Array.from(a.fabric, (f) => (f === 0 ? 1 : 0));
  const keep = erode(outside, a.w, a.h, 2);
  const coarsePoints = [];
  for (let i = 0; i < keep.length; i += 3) if (keep[i]) coarsePoints.push(i);
  const finePoints = [];
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      if (keep[Math.min(a.h - 1, (y / S) | 0) * a.w + Math.min(a.w - 1, (x / S) | 0)]) finePoints.push(y * W + x);
    }
  }
  // Formatos possíveis: esticada (1, 1); cortada ou com faixas, em cima/embaixo ou dos lados.
  const shapes = [[1, 1]];
  if (Math.abs(ratio - 1) > 0.01) shapes.push([1, ratio], [1 / ratio, 1]);
  const candidates = [];
  for (const [fx, fy] of shapes) {
    for (const s of [0.98, 1, 1.02]) {
      const scale = [fx * s, fy * s];
      candidates.push({ scale, ...searchShift(a.gray, b.gray, a.w, a.h, coarsePoints, scale, Math.ceil(maxShift / S)) });
    }
  }
  candidates.sort((p, q) => q.score - p.score);
  const gA = grayOf(A);
  const gB = grayOf(B);
  let best = null;
  for (const c of candidates.slice(0, 2)) {
    const fine = searchShift(gA, gB, W, H, finePoints, c.scale, S, [c.dx * S, c.dy * S]);
    if (!best || fine.score > best.score) best = { scale: c.scale, ...fine };
  }
  // Diferença que sobra, com ganho e brilho ajustados (B ≈ k·A + c).
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const [sx, sy] = best.scale;
  const at = (x, y) => {
    const X = Math.round(cx + (x - cx) * sx + best.dx);
    const Y = Math.round(cy + (y - cy) * sy + best.dy);
    return X < 0 || Y < 0 || X >= W || Y >= H ? -1 : Y * W + X;
  };
  let m = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sab = 0;
  const pa = [];
  const pb = [];
  for (const i of finePoints) {
    const j = at(i % W, (i / W) | 0);
    if (j < 0) continue;
    pa.push(gA[i]);
    pb.push(gB[j]);
    m++;
    sa += gA[i];
    sb += gB[j];
    saa += gA[i] * gA[i];
    sab += gA[i] * gB[j];
  }
  const ma = sa / (m || 1);
  const mb = sb / (m || 1);
  const vaa = saa - m * ma * ma;
  const k = vaa > 0 ? (sab - m * ma * mb) / vaa : 1;
  let diff = 0;
  for (let i = 0; i < m; i++) diff += Math.abs(pb[i] - (mb + k * (pa[i] - ma)));
  return { scale: best.scale, dx: best.dx, dy: best.dy, at, diff: m ? diff / m : Infinity };
}

/**
 * Pares (luz na original → cor na foto do GPT) no miolo do tecido, numa grade de
 * 2 px, sem os 6 px da borda (onde o alinhamento erra mais).
 */
function tonePairs(A, B, W, H, at) {
  const S = 2;
  const w = Math.floor(W / S);
  const h = Math.floor(H / S);
  const fabric = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * S * W + x * S) * 3;
      fabric[y * w + x] = fabricWeight(A[i] / 255, A[i + 1] / 255, A[i + 2] / 255) > 0.5 ? 1 : 0;
    }
  }
  const core = erode(fabric, w, h, 3);
  const l = [];
  const c = [];
  const original = [0, 0, 0];
  for (let k = 0; k < core.length; k++) {
    if (!core[k]) continue;
    const x = (k % w) * S;
    const y = ((k / w) | 0) * S;
    const j = at(x, y);
    if (j < 0) continue;
    const i = (y * W + x) * 3;
    const [r, g, b] = [A[i] / 255, A[i + 1] / 255, A[i + 2] / 255];
    l.push(luminance(r, g, b));
    c.push(toLinear(B[j * 3] / 255), toLinear(B[j * 3 + 1] / 255), toLinear(B[j * 3 + 2] / 255));
    original[0] += toLinear(r);
    original[1] += toLinear(g);
    original[2] += toLinear(b);
  }
  return { l: Float64Array.from(l), c: Float32Array.from(c), original };
}

/** Regressão isotônica (crescente), pesos iguais. */
function isotonic(values) {
  const blocksV = [];
  for (const v of values) {
    blocksV.push([v, 1]);
    while (blocksV.length > 1 && blocksV[blocksV.length - 2][0] > blocksV[blocksV.length - 1][0]) {
      const [v2, n2] = blocksV.pop();
      const [v1, n1] = blocksV.pop();
      blocksV.push([(v1 * n1 + v2 * n2) / (n1 + n2), n1 + n2]);
    }
  }
  return blocksV.flatMap(([v, n]) => Array(n).fill(v));
}

/**
 * Curva de tom: para cada nível de luz da original, a cor (linear) do tecido na
 * foto do GPT. 32 faixas de luz, mediana de cada canal (resiste a estampa ou
 * almofada por cima), sempre crescente (mais luz, cor mais clara).
 */
function learnTone(sets) {
  const l = sets.flatMap((s) => Array.from(s.l));
  const c = new Float32Array(l.length * 3);
  let offset = 0;
  for (const s of sets) {
    c.set(s.c, offset * 3);
    offset += s.l.length;
  }
  const order = Array.from(l.keys()).sort((p, q) => l[p] - l[q]);
  const BINS = 32;
  const knots = [];
  for (let k = 0; k < BINS; k++) {
    const slice = order.slice(Math.floor((k * order.length) / BINS), Math.floor(((k + 1) * order.length) / BINS));
    if (!slice.length) continue;
    knots.push({ l: median(slice.map((i) => l[i])), c: [0, 1, 2].map((ch) => median(slice.map((i) => c[i * 3 + ch]))) });
  }
  const fixed = [0, 1, 2].map((ch) => isotonic(knots.map((k) => k.c[ch])));
  return knots.map((k, i) => ({ l: k.l, c: [fixed[0][i], fixed[1][i], fixed[2][i]] }));
}

/**
 * Cor (linear) do tom para uma luz: entre as faixas, interpola. Mais escuro que a faixa mais escura, fica na cor
 * dela (o GPT clareia a sombra funda de um tecido claro; ir ao preto deixava pontos escuros). Mais claro que a
 * faixa mais clara, cresce com a luz.
 */
export function toneAt(knots, l) {
  const first = knots[0];
  const last = knots[knots.length - 1];
  if (l <= first.l) return [...first.c];
  if (l >= last.l) return last.c.map((v) => Math.min(1, last.l > 0 ? (v * l) / last.l : v));
  let lo = 0;
  let hi = knots.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (knots[mid].l <= l) lo = mid;
    else hi = mid;
  }
  const a = knots[lo];
  const b = knots[hi];
  const t = b.l > a.l ? (l - a.l) / (b.l - a.l) : 1;
  return a.c.map((v, ch) => v + t * (b.c[ch] - v));
}

/** Fração dos pontos do tecido do GPT que fogem do tom (amostra de até 20 mil pontos). */
function offToneShare(set, knots, limit) {
  const n = set.l.length;
  if (!n) return 1;
  const step = Math.max(1, Math.floor(n / 20000));
  let off = 0;
  let count = 0;
  for (let i = 0; i < n; i += step) {
    const got = [set.c[i * 3], set.c[i * 3 + 1], set.c[i * 3 + 2]];
    if (deltaE(labLinear(got), labLinear(toneAt(knots, set.l[i]))) > limit) off++;
    count++;
  }
  return off / count;
}

/**
 * Tom da cor nova tirado das fotos do GPT (uma por ângulo). Cada foto é alinhada
 * com a original; um ângulo não serve quando a foto do GPT não corresponde à
 * original ou quando o tecido dela não é uma cor só (estampa, dois tons, algo
 * por cima). Com pelo menos `minViews` ângulos bons, o tom sai de todos juntos
 * (assim a cor é a mesma nos 4 ângulos) e a cor medida tem de ser a pedida.
 *
 * @param {{ original: Buffer; generated?: Buffer; view?: string }[]} shots
 * @param {{ targetHex: string; limits?: Partial<typeof TONE_LIMITS> }} options
 */
export async function gptTone(shots, { targetHex, limits = {} }) {
  const L = { ...TONE_LIMITS, ...limits };
  const views = [];
  const good = [];
  const original = [0, 0, 0];
  for (const shot of shots) {
    if (!shot.generated) {
      views.push({ view: shot.view ?? null, used: false, reason: shot.error ? `sem foto do GPT (${shot.error})` : "a OpenAI não devolveu este ângulo" });
      continue;
    }
    const { data: A, info } = await sharp(shot.original).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;
    let meta;
    let B;
    try {
      meta = await sharp(shot.generated).metadata();
      B = await sharp(shot.generated).removeAlpha().resize(W, H, { fit: "fill" }).raw().toBuffer();
    } catch {
      views.push({ view: shot.view ?? null, used: false, reason: "a foto do GPT não abriu (arquivo inválido)" });
      continue;
    }
    const align = alignTo(A, B, W, H, meta.width / meta.height / (W / H), L.maxShift);
    const view = {
      view: shot.view ?? null,
      dx: align.dx,
      dy: align.dy,
      scale: align.scale.map((v) => Number(v.toFixed(3))),
      alignDiff: align.diff,
      offToneShare: null,
      used: false,
      reason: null,
    };
    views.push(view);
    if (align.diff > L.maxAlignDiff) {
      view.reason = "a foto do GPT não corresponde à original (outra peça, outro ângulo ou peça fora do lugar)";
      continue;
    }
    const set = tonePairs(A, B, W, H, align.at);
    view.offToneShare = set.l.length ? offToneShare(set, learnTone([set]), L.offToneDeltaE) : 1;
    if (view.offToneShare > L.maxOffToneShare) {
      view.reason = "o GPT não trocou só a cor do tecido (estampa, dois tons ou algo por cima)";
      continue;
    }
    view.used = true;
    good.push(set);
    for (let ch = 0; ch < 3; ch++) original[ch] += set.original[ch];
  }

  const reasons = [];
  if (good.length < L.minViews) {
    reasons.push(`o GPT acertou ${good.length} de ${shots.length} ângulos (precisa de ${L.minViews})`);
    return { ok: false, reasons, views, tone: null, fabricHex: null, colorDeltaE: null };
  }
  const tone = learnTone(good);
  // Cor medida: o tom aplicado à luz do tecido da original (é a cor que vai para a loja).
  const sum = [0, 0, 0];
  let n = 0;
  for (const set of good) {
    for (let i = 0; i < set.l.length; i += 4) {
      const c = toneAt(tone, set.l[i]);
      for (let ch = 0; ch < 3; ch++) sum[ch] += c[ch];
      n++;
    }
  }
  const fabricLinear = sum.map((v) => v / n);
  const fabricHex = toHex(fabricLinear.map(toSrgb));
  const count = good.reduce((t, s) => t + s.l.length, 0);
  const got = labLinear(fabricLinear);
  const colorDeltaE = deltaE(got, labLinear(hexRgb(targetHex).map(toLinear)));
  const fromOriginal = deltaE(got, labLinear(original.map((v) => v / count)));
  if (colorDeltaE > L.maxColorDeltaE || colorDeltaE >= fromOriginal) reasons.push("a cor do tecido não é a pedida");
  return { ok: reasons.length === 0, reasons, views, tone: reasons.length ? null : tone, fabricHex, colorDeltaE };
}

/**
 * Fotos de uma cor pelo GPT. O GPT gera os 4 ângulos; deles sai só o tom da cor
 * (gptTone) e as fotos da loja são as originais com o tecido repintado nesse tom.
 * Se o tom não serve, a cor inteira fica com o recolor por computador. Devolve a
 * cor medida (para o 3D) ou null.
 */
async function gptPhotos(color, engine, report, { redo = false, gptPhotosAsIs = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "cuxoes-cores-"));
  try {
    const shots = [];
    for (const view of VIEWS) {
      const sourceFile = path.join(DEMO, `poltrona-azul-${view}.jpg`);
      const original = await readFile(sourceFile);
      // Foto do GPT já paga numa rodada anterior: reaproveita (rodar de novo só paga o que falta).
      const cached = path.join(GPT_CACHE, `${color.slug}-${view}.jpg`);
      const saved = redo ? null : await readFile(cached).catch(() => null);
      if (saved) {
        shots.push({ view, original, generated: saved });
        continue;
      }
      const output = path.join(dir, `${color.slug}-${view}.jpg`);
      try {
        await engine.recolor(sourceFile, color.name.toLowerCase(), color.hex, output);
        const generated = await readFile(output);
        await mkdir(GPT_CACHE, { recursive: true });
        await writeFile(cached, generated);
        shots.push({ view, original, generated });
      } catch (e) {
        const error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
        console.log(`${color.name} · ${view}: sem foto do GPT (${error})`);
        shots.push({ view, original, error });
      }
    }
    const result = await gptTone(shots, { targetHex: color.hex });
    const source = !result.ok ? "computador" : gptPhotosAsIs ? "gpt" : "tom-do-gpt";
    for (const shot of shots) {
      let image;
      if (source === "gpt") {
        // A própria foto do GPT (só com --fotos-do-gpt, depois de uma pessoa conferir as 16 com as originais).
        const { width, height } = await sharp(shot.original).metadata();
        image = sharp(shot.generated).removeAlpha().resize(width, height, { fit: "fill" });
      } else {
        ({ image } = source === "tom-do-gpt" ? await recolorWith(shot.original, (l) => toneAt(result.tone, l)) : await recolor(shot.original, color.hex));
      }
      await writeFile(path.join(OUT, `poltrona-${color.slug}-${shot.view}.jpg`), await image.jpeg({ quality: 84, mozjpeg: true }).toBuffer());
      const v = result.views.find((x) => x.view === shot.view);
      report.fotos.push({
        cor: color.slug,
        vista: shot.view,
        fonte: source,
        ...(v?.alignDiff !== undefined
          ? {
              deslocamentoPx: [v.dx, v.dy],
              escala: v.scale,
              diferencaForaDoTecido: Number(v.alignDiff.toFixed(2)),
              foraDoTom: v.offToneShare === null ? null : Number(v.offToneShare.toFixed(3)),
            }
          : {}),
        ...(v ? { usadoNoTom: v.used, ...(v.reason ? { motivo: v.reason } : {}) } : {}),
        ...(shot.error ? { erro: shot.error } : {}),
      });
    }
    report.cores.push({
      cor: color.slug,
      fonte: source,
      pedida: color.hex,
      medida: result.fabricHex,
      deltaE: result.colorDeltaE === null ? null : Number(result.colorDeltaE.toFixed(1)),
      motivos: result.reasons,
    });
    const how = result.ok
      ? `${source === "gpt" ? "foto do GPT" : "tom do GPT"} (${result.views.filter((v) => v.used).length} de ${VIEWS.length} ângulos; medida ${result.fabricHex}, ΔE ${result.colorDeltaE.toFixed(1)})`
      : `computador (${result.reasons.join("; ")})`;
    console.log(`${color.name}: ${how}`);
    return result.ok ? result.fabricHex : null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(args) {
  await mkdir(OUT, { recursive: true });
  const useGpt = args.includes("--gpt");
  // --refazer=vermelho,bege: pede de novo ao GPT só essas cores (as outras reaproveitam as fotos já pagas).
  // --fotos-do-gpt: usa a própria foto do GPT (passando no alinhamento e na cor), em vez da original repintada no tom
  // dele. Só depois de uma pessoa comparar as 16 fotos com as originais: a conferência automática não garante que a
  // peça não mudou.
  const gptPhotosAsIs = args.includes("--fotos-do-gpt");
  const redo = new Set((args.find((a) => a.startsWith("--refazer="))?.slice(10) ?? "").split(",").filter(Boolean));
  let engine = null;
  if (useGpt) {
    if (process.env.OPENAI_API_KEY) {
      const { openaiRecolorEngine } = await import("./ai-pipeline.mjs");
      engine = openaiRecolorEngine();
      console.log("GPT com a OPENAI_API_KEY daqui.");
    } else {
      console.error("Modo --gpt precisa de OPENAI_API_KEY. Sem ela, rode sem --gpt (recolor por computador).");
      process.exit(1);
    }
  }

  // Fotos de catálogo: cada cor nos 4 ângulos. A cor do 3D segue a cor das fotos.
  const report = { cores: [], fotos: [] };
  const colors3d = Object.fromEntries(EXAMPLE_COLORS.map((c) => [c.slug, c.hex]));
  for (const color of EXAMPLE_COLORS.filter((c) => c.slug !== "azul")) {
    if (engine) {
      const measured = await gptPhotos(color, engine, report, { redo: redo.has(color.slug), gptPhotosAsIs }).catch((e) => {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
      });
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
    await writeFile(path.join(OUT, "relatorio-gpt.json"), JSON.stringify({ cores3d: colors3d, ...report }, null, 2));
    const fromGpt = report.cores.filter((c) => c.fonte !== "computador").length;
    console.log(`GPT usado em ${fromGpt} de ${report.cores.length} cores (as outras ficaram só pelo computador).`);
    if (!fromGpt) process.exitCode = 2;
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

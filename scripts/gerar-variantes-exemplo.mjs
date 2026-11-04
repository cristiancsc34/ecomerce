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
 *   gerada é conferida com a original fora do tecido; se a IA mexeu na peça ou
 *   no fundo, a foto é descartada e fica a versão recolorida por computador;
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

/**
 * Confere uma foto gerada pela IA com a original: fora do tecido (madeira, fundo,
 * sombra) as duas têm de ser praticamente iguais. Compara as duas desfocadas de
 * leve (a IA redesenha a imagem inteira, pixel a pixel nunca bate) e devolve a
 * diferença média fora do tecido (0–255), quanto da área "mudou de verdade" e a
 * cor média do tecido na foto gerada.
 */
export async function fidelityCheck(original, generated, { maxMeanDiff = 12, maxChangedShare = 0.04 } = {}) {
  const a = await sharp(original).removeAlpha().blur(2).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = a.info;
  const b = await sharp(generated).removeAlpha().resize(width, height, { fit: "fill" }).blur(2).raw().toBuffer();
  const raw = await sharp(original).removeAlpha().raw().toBuffer();
  let sum = 0;
  let count = 0;
  let changed = 0;
  const fabric = [0, 0, 0];
  let fabricCount = 0;
  for (let i = 0; i < raw.length; i += 3) {
    const w = fabricWeight(raw[i] / 255, raw[i + 1] / 255, raw[i + 2] / 255);
    if (w > 0.5) {
      for (let c = 0; c < 3; c++) fabric[c] += toLinear(b[i + c] / 255);
      fabricCount++;
      continue;
    }
    if (w > 0) continue; // borda do tecido: não conta
    const d = (Math.abs(a.data[i] - b[i]) + Math.abs(a.data[i + 1] - b[i + 1]) + Math.abs(a.data[i + 2] - b[i + 2])) / 3;
    sum += d;
    count++;
    if (d > 40) changed++;
  }
  const meanDiff = count ? sum / count : 0;
  const changedShare = count ? changed / count : 0;
  const fabricHex = fabricCount ? toHex(fabric.map((v) => toSrgb(v / fabricCount))) : null;
  return { ok: meanDiff <= maxMeanDiff && changedShare <= maxChangedShare, meanDiff, changedShare, fabricHex };
}

/** Fotos de uma cor pelo GPT, com conferência; sem passar, fica a versão por computador. */
async function gptPhotos(color, engine, report) {
  const dir = await mkdtemp(path.join(tmpdir(), "cuxoes-cores-"));
  const measured = [];
  try {
    for (const view of VIEWS) {
      const sourceFile = path.join(DEMO, `poltrona-azul-${view}.jpg`);
      const original = await readFile(sourceFile);
      const output = path.join(dir, `${color.slug}-${view}.jpg`);
      const target = path.join(OUT, `poltrona-${color.slug}-${view}.jpg`);
      let entry;
      try {
        await engine.recolor(sourceFile, color.name.toLowerCase(), color.hex, output);
        const generated = await readFile(output);
        const check = await fidelityCheck(original, generated);
        entry = { cor: color.slug, vista: view, fonte: check.ok ? "gpt" : "computador", ...check };
        if (check.ok) {
          const { width, height } = await sharp(original).metadata();
          await writeFile(target, await sharp(generated).resize(width, height, { fit: "fill" }).jpeg({ quality: 84, mozjpeg: true }).toBuffer());
          if (check.fabricHex) measured.push(check.fabricHex);
        }
      } catch (e) {
        entry = { cor: color.slug, vista: view, fonte: "computador", erro: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
      }
      if (entry.fonte === "computador") {
        const { image } = await recolor(original, color.hex);
        await writeFile(target, await image.jpeg({ quality: 84, mozjpeg: true }).toBuffer());
      }
      report.push(entry);
      console.log(`${color.name} · ${view}: ${entry.fonte}${entry.erro ? ` (${entry.erro})` : entry.meanDiff !== undefined ? ` (diferença fora do tecido ${entry.meanDiff.toFixed(1)}, área mudada ${(entry.changedShare * 100).toFixed(1)}%)` : ""}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return measured[0] ?? null; // a frente manda na cor do 3D
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

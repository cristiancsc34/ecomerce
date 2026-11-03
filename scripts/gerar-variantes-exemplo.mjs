#!/usr/bin/env node
/**
 * DADO DE EXEMPLO (só para desenvolvimento): a Poltrona Azul recolorida em
 * marrom, branco, vermelho e bege, para mostrar a troca de cor na página do
 * produto sem cadastrar cores que a loja não vende.
 *
 *   npm run demo:variantes
 *
 * Gera em public/demo/exemplo/:
 * - as 4 fotos de catálogo de cada cor (só o tecido muda de cor: a madeira, o
 *   fundo e as sombras ficam como na foto original);
 * - poltrona-cores.glb: o modelo 3D com as 5 cores no mesmo arquivo
 *   (extensão KHR_materials_variants; o visualizador troca pelo nome da cor).
 *
 * Só aparece na loja com CATALOG_DEV_EXAMPLES=1, fora da Vercel e no modo
 * demonstração (lib/catalog/dev-examples.ts). Não são fotos reais: para vender
 * uma cor de verdade, cadastre a variação no painel com as fotos do produto.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
function fabricWeight(r, g, b) {
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
async function recolor(input, hex, { reference } = {}) {
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

async function main() {
  await mkdir(OUT, { recursive: true });

  // Fotos de catálogo: cada cor nos 4 ângulos.
  for (const color of EXAMPLE_COLORS.filter((c) => c.slug !== "azul")) {
    for (const view of VIEWS) {
      const source = await readFile(path.join(DEMO, `poltrona-azul-${view}.jpg`));
      const { image } = await recolor(source, color.hex);
      const file = path.join(OUT, `poltrona-${color.slug}-${view}.jpg`);
      await writeFile(file, await image.jpeg({ quality: 84, mozjpeg: true }).toBuffer());
    }
    console.log(`fotos: ${color.name}`);
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
    const { image } = await recolor(baseImage, color.hex, { reference: mean });
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

await main();

#!/usr/bin/env node
/**
 * Gera as ilustrações de demonstração (SVG) e o modelo 3D ilustrativo (GLB)
 * usados no modo demonstração. Saída em public/demo/.
 *
 *   node scripts/generate-demo-assets.mjs
 *
 * São ilustrações vetoriais simples, sem fotos de terceiros. Substitua pelas
 * fotos reais dos produtos assim que existirem (pelo painel administrativo).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "demo");
mkdirSync(out, { recursive: true });

const C = {
  skyMist: "#C4E0F5",
  airBlue: "#408AC2",
  deepFjord: "#132940",
  cloud: "#F6FAFC",
  paleBlue: "#E8F2FA",
  linen: "#E8DBC9",
  coral: "#F5C7AD",
  ink: "#1F2B38",
  muted: "#5E707F",
  line: "#DCE5EC",
  white: "#FFFFFF",
};

const products = [
  { slug: "nuvem-essencial", band: C.skyMist, accent: C.airBlue, layers: [C.white, C.paleBlue, C.skyMist], height: 120 },
  { slug: "brisa-premium", band: C.airBlue, accent: C.deepFjord, layers: [C.white, C.skyMist, C.paleBlue, C.airBlue], height: 140 },
  { slug: "sereno-hibrido", band: C.deepFjord, accent: C.linen, layers: [C.white, C.linen, C.skyMist, C.deepFjord], height: 150 },
];

const W = 1200;
const H = 900;

function svg(title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t">
<title id="t">${title}</title>
${body}
<text x="${W - 24}" y="${H - 24}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="20" fill="${C.muted}" opacity="0.85">Ilustração · não é foto do produto</text>
</svg>
`;
}

function background(id, from = C.cloud, to = C.paleBlue) {
  return `<defs>
  <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${from}"/>
    <stop offset="1" stop-color="${to}"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#${id})"/>`;
}

/** Colchão em perspectiva de três quartos. */
function mattress34(p, { x = 210, y = 330, w = 620, d = 260, h = p.height } = {}) {
  const dx = d * 0.62;
  const dy = d * 0.42;
  const top = `M${x},${y} L${x + w},${y} L${x + w + dx},${y + dy} L${x + dx},${y + dy} Z`;
  const front = `M${x + dx},${y + dy} L${x + w + dx},${y + dy} L${x + w + dx},${y + dy + h} L${x + dx},${y + dy + h} Z`;
  const side = `M${x},${y} L${x + dx},${y + dy} L${x + dx},${y + dy + h} L${x},${y + h} Z`;
  const quilt = [];
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    quilt.push(`<line x1="${x + w * t}" y1="${y}" x2="${x + w * t + dx}" y2="${y + dy}" stroke="${C.line}" stroke-width="2" stroke-dasharray="6 8"/>`);
  }
  for (let j = 1; j < 4; j++) {
    const t = j / 4;
    quilt.push(`<line x1="${x + dx * t}" y1="${y + dy * t}" x2="${x + w + dx * t}" y2="${y + dy * t}" stroke="${C.line}" stroke-width="2" stroke-dasharray="6 8"/>`);
  }
  const bandH = Math.round(h * 0.22);
  const bandY = y + dy + h * 0.5 - bandH / 2;
  return `<ellipse cx="${x + (w + dx) / 2 + 20}" cy="${y + dy + h + 34}" rx="${(w + dx) / 2 + 40}" ry="28" fill="${C.deepFjord}" opacity="0.08"/>
<path d="${side}" fill="${C.paleBlue}" stroke="${C.line}" stroke-width="2"/>
<path d="${front}" fill="${C.white}" stroke="${C.line}" stroke-width="2"/>
<rect x="${x + dx}" y="${bandY}" width="${w}" height="${bandH}" fill="${p.band}"/>
<path d="M${x},${y + h * 0.5 - bandH / 2 - dy * 0} L${x + dx},${bandY} L${x + dx},${bandY + bandH} L${x},${y + h * 0.5 + bandH / 2} Z" fill="${p.band}" opacity="0.8"/>
<path d="${top}" fill="${C.white}" stroke="${C.line}" stroke-width="2"/>
${quilt.join("\n")}
<rect x="${x + dx + w - 120}" y="${y + dy + h - 44}" width="84" height="22" rx="11" fill="${p.accent}" opacity="0.9"/>`;
}

function frente(p) {
  return svg(`Ilustração do colchão ${p.slug} em vista de três quartos`, `${background(`bg-${p.slug}-f`)}
<circle cx="980" cy="170" r="120" fill="${C.skyMist}" opacity="0.5"/>
${mattress34(p)}`);
}

function lateral(p) {
  const x = 140;
  const w = 920;
  const h = p.height * 1.6;
  const y = 450 - h / 2;
  const n = p.layers.length;
  const layers = p.layers
    .map((color, i) => {
      const lh = h / n;
      return `<rect x="${x}" y="${y + i * lh}" width="${w}" height="${lh}" fill="${color}" stroke="${C.line}" stroke-width="2"/>`;
    })
    .join("\n");
  return svg(`Ilustração da lateral do colchão ${p.slug}, mostrando altura e camadas`, `${background(`bg-${p.slug}-l`)}
<ellipse cx="${x + w / 2}" cy="${y + h + 30}" rx="${w / 2 + 30}" ry="22" fill="${C.deepFjord}" opacity="0.08"/>
<g>
<clipPath id="clip-${p.slug}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28"/></clipPath>
<g clip-path="url(#clip-${p.slug})">${layers}</g>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="none" stroke="${C.deepFjord}" stroke-opacity="0.25" stroke-width="3"/>
</g>
<g stroke="${C.deepFjord}" stroke-width="3" fill="none">
<line x1="${x + w + 50}" y1="${y}" x2="${x + w + 50}" y2="${y + h}"/>
<line x1="${x + w + 36}" y1="${y}" x2="${x + w + 64}" y2="${y}"/>
<line x1="${x + w + 36}" y1="${y + h}" x2="${x + w + 64}" y2="${y + h}"/>
</g>
<text x="${x + w + 50}" y="${y - 18}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="600" fill="${C.deepFjord}">altura</text>`);
}

function detalhe(p) {
  const cells = [];
  const size = 150;
  for (let row = -1; row < 8; row++) {
    for (let col = -1; col < 10; col++) {
      const cx = col * size + (row % 2 ? size / 2 : 0);
      const cy = row * size * 0.7;
      cells.push(
        `<path d="M${cx},${cy - size * 0.35} L${cx + size / 2},${cy} L${cx},${cy + size * 0.35} L${cx - size / 2},${cy} Z" fill="${C.white}" stroke="${C.line}" stroke-width="3"/>`,
        `<path d="M${cx},${cy - size * 0.35} L${cx + size / 2},${cy} L${cx},${cy + size * 0.35} L${cx - size / 2},${cy} Z" fill="none" stroke="${p.accent}" stroke-opacity="0.45" stroke-width="2" stroke-dasharray="5 7" transform="translate(0 0) scale(1)"/>`,
        `<circle cx="${cx}" cy="${cy}" r="6" fill="${p.band}"/>`,
      );
    }
  }
  return svg(`Ilustração de detalhe do tecido acolchoado do colchão ${p.slug}`, `<rect width="${W}" height="${H}" fill="${C.cloud}"/>
${cells.join("\n")}
<rect x="0" y="${H - 170}" width="${W}" height="170" fill="${p.band}" opacity="0.9"/>
<line x1="0" y1="${H - 170}" x2="${W}" y2="${H - 170}" stroke="${C.white}" stroke-width="4" stroke-dasharray="14 10"/>`);
}

function room(p, { withBand = true } = {}) {
  const mat = withBand ? p : { ...p, band: C.paleBlue, accent: C.airBlue };
  return `${background(`bg-${p.slug}-room`, C.paleBlue, C.cloud)}
<rect x="0" y="600" width="${W}" height="300" fill="${C.linen}" opacity="0.55"/>
<rect x="780" y="110" width="300" height="320" rx="16" fill="${C.white}" stroke="${C.line}" stroke-width="4"/>
<rect x="800" y="130" width="260" height="280" rx="8" fill="${C.skyMist}" opacity="0.65"/>
<line x1="930" y1="130" x2="930" y2="410" stroke="${C.white}" stroke-width="6"/>
<path d="M800,410 L640,640 L1040,640 L1060,410 Z" fill="${C.white}" opacity="0.35"/>
<rect x="150" y="300" width="70" height="330" rx="10" fill="${C.deepFjord}" opacity="0.85"/>
<rect x="150" y="560" width="760" height="90" rx="14" fill="${C.deepFjord}" opacity="0.85"/>
${mattress34(mat, { x: 180, y: 430, w: 600, d: 150, h: Math.round(p.height * 0.6) })}
<ellipse cx="300" cy="455" rx="90" ry="34" fill="${C.white}" stroke="${C.line}" stroke-width="3"/>
<ellipse cx="470" cy="455" rx="90" ry="34" fill="${C.white}" stroke="${C.line}" stroke-width="3"/>
<path d="M560,470 Q700,440 870,500 L870,540 Q700,500 560,530 Z" fill="${C.coral}" opacity="0.75"/>
<rect x="990" y="560" width="90" height="90" rx="10" fill="${C.linen}"/>
<path d="M1035,560 C1000,500 1010,450 1035,420 C1060,450 1070,500 1035,560 Z" fill="${C.airBlue}" opacity="0.6"/>
<path d="M1035,560 C1060,510 1095,490 1110,470 C1100,520 1080,545 1035,560 Z" fill="${C.airBlue}" opacity="0.45"/>`;
}

function ambiente(p) {
  return svg(`Ilustração do colchão ${p.slug} em um quarto claro`, room(p));
}

function hero() {
  return svg(
    "Ilustração de um quarto calmo com cama arrumada, travesseiros e luz suave entrando pela janela",
    room({ slug: "hero", band: C.skyMist, accent: C.airBlue, height: 140 }),
  );
}

for (const p of products) {
  writeFileSync(join(out, `${p.slug}-frente.svg`), frente(p));
  writeFileSync(join(out, `${p.slug}-lateral.svg`), lateral(p));
  writeFileSync(join(out, `${p.slug}-detalhe.svg`), detalhe(p));
  writeFileSync(join(out, `${p.slug}-ambiente.svg`), ambiente(p));
}
writeFileSync(join(out, "hero-quarto.svg"), hero());

// ---------------------------------------------------------------------------
// GLB: colchão como caixa com faixa lateral (glTF 2.0 binário, sem dependências)
// ---------------------------------------------------------------------------

function box(cx, cy, cz, sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    { n: [1, 0, 0], v: [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]] },
    { n: [0, 1, 0], v: [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]] },
    { n: [0, 0, 1], v: [[hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [-hx, -hy, hz]] },
    { n: [0, 0, -1], v: [[-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz]] },
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  faces.forEach((f, i) => {
    for (const [x, y, z] of f.v) {
      positions.push(cx + x, cy + y, cz + z);
      normals.push(...f.n);
    }
    const o = i * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return { positions, normals, indices };
}

function buildGlb(parts) {
  const chunks = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const materials = [];
  const nodes = [];

  function pushView(typed, target) {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const padded = Math.ceil(bytes.length / 4) * 4;
    const buf = new Uint8Array(padded);
    buf.set(bytes);
    chunks.push(buf);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    offset += padded;
    return bufferViews.length - 1;
  }

  parts.forEach((part, i) => {
    const { positions, normals, indices } = part.geometry;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < positions.length; k += 3) {
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], positions[k + a]);
        max[a] = Math.max(max[a], positions[k + a]);
      }
    }
    const pv = pushView(new Float32Array(positions), 34962);
    accessors.push({ bufferView: pv, componentType: 5126, count: positions.length / 3, type: "VEC3", min, max });
    const pa = accessors.length - 1;
    const nv = pushView(new Float32Array(normals), 34962);
    accessors.push({ bufferView: nv, componentType: 5126, count: normals.length / 3, type: "VEC3" });
    const na = accessors.length - 1;
    const iv = pushView(new Uint16Array(indices), 34963);
    accessors.push({ bufferView: iv, componentType: 5123, count: indices.length, type: "SCALAR" });
    const ia = accessors.length - 1;
    materials.push({
      name: part.name,
      pbrMetallicRoughness: { baseColorFactor: part.color, metallicFactor: 0, roughnessFactor: part.roughness },
    });
    meshes.push({ name: part.name, primitives: [{ attributes: { POSITION: pa, NORMAL: na }, indices: ia, material: i }] });
    nodes.push({ name: part.name, mesh: i });
  });

  const json = {
    asset: { version: "2.0", generator: "cuxoes demo generator" },
    scene: 0,
    scenes: [{ name: "Colchão ilustrativo", nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = Math.ceil(jsonBytes.length / 4) * 4;
  const jsonChunk = new Uint8Array(jsonPadded).fill(0x20);
  jsonChunk.set(jsonBytes);
  const bin = new Uint8Array(offset);
  let pos = 0;
  for (const c of chunks) {
    bin.set(c, pos);
    pos += c.length;
  }

  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const glb = new Uint8Array(total);
  const dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546c67, true); // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonChunk.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // "JSON"
  glb.set(jsonChunk, 20);
  const binStart = 20 + jsonChunk.length;
  dv.setUint32(binStart, bin.length, true);
  dv.setUint32(binStart + 4, 0x004e4942, true); // "BIN\0"
  glb.set(bin, binStart + 8);
  return glb;
}

function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return [...ch, 1];
}

// Medidas em metros de um colchão casal ilustrativo (1,38 × 1,88 × 0,30).
const glb = buildGlb([
  { name: "Corpo", geometry: box(0, 0.15, 0, 1.38, 0.3, 1.88), color: hexToLinear(C.cloud), roughness: 0.9 },
  { name: "Faixa lateral", geometry: box(0, 0.15, 0, 1.386, 0.07, 1.886), color: hexToLinear(C.deepFjord), roughness: 0.8 },
  { name: "Tampo acolchoado", geometry: box(0, 0.302, 0, 1.3, 0.004, 1.8), color: hexToLinear(C.paleBlue), roughness: 1 },
]);
writeFileSync(join(out, "sereno-hibrido.glb"), glb);

console.log(`Assets de demonstração gerados em ${out}`);

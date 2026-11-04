/**
 * Arquivos da realidade aumentada em TAMANHO REAL, gerados no Node (sem navegador):
 *
 * 1. mede a caixa do modelo (.glb) e escolhe a escala uniforme que mais o aproxima
 *    das medidas do catálogo (largura × profundidade × altura);
 * 2. confere: cada medida tem que bater com o catálogo com tolerância de 2 cm. Se não
 *    bater (ou faltar medida no catálogo), NÃO gera nada — a loja não promete um
 *    tamanho real que não foi conferido;
 * 3. gera o .glb em escala real e o .usdz da mesma peça (AR Quick Look do iPhone) e
 *    confere de novo a caixa do arquivo gerado.
 *
 * Por que um gerador próprio e não o USDZExporter do three.js: o exporter precisa de
 * DOM/canvas para as texturas e o estúdio roda no servidor (Vercel e processador
 * local). Aqui o .usda é escrito no mesmo formato do exporter (o que o próprio
 * <model-viewer> já gera hoje no iPhone): malha com UsdPreviewSurface, texturas
 * JPEG/PNG e pacote ZIP sem compressão com dados alinhados em 64 bytes.
 *
 * Usado pelo estúdio (scripts/ai-pipeline.mjs), pelo botão do painel e pelo script
 * scripts/gerar-usdz.mjs. Medidas em centímetros; o arquivo fica em metros (glTF/USD).
 */
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

export const USDZ_MIME = "model/vnd.usdz+zip";
/** Tolerância da conferência de escala, por medida. */
export const SCALE_TOLERANCE_CM = 2;
/** Limite do bucket (o mesmo do .glb). */
const MAX_BYTES = 4 * 1024 * 1024;
const KEYS = ["widthCm", "depthCm", "heightCm"];
const LABELS = { widthCm: "largura", depthCm: "profundidade", heightCm: "altura" };

const newIo = () => new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sceneOf = (doc) => doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
const round1 = (n) => Math.round(n * 10) / 10;
const cm = (n) => `${round1(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`;

// ---------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------

/** Caixa do modelo em cm: x = largura, z = profundidade (frente em +Z), y = altura. */
export function measureDocumentCm(doc) {
  const scene = sceneOf(doc);
  if (!scene) return null;
  const { min, max } = getBounds(scene);
  if (![...min, ...max].every(Number.isFinite)) return null;
  return { widthCm: (max[0] - min[0]) * 100, depthCm: (max[2] - min[2]) * 100, heightCm: (max[1] - min[1]) * 100 };
}

/**
 * Medidas do catálogo (products.dimensions) na ordem do AR. `lengthCm` é a
 * profundidade/comprimento da peça. Devolve o que falta quando incompleto.
 */
export function catalogBoxCm(dimensions) {
  const box = {
    widthCm: Number(dimensions?.widthCm),
    depthCm: Number(dimensions?.lengthCm),
    heightCm: Number(dimensions?.heightCm),
  };
  const missing = KEYS.filter((k) => !(box[k] > 0)).map((k) => LABELS[k]);
  return missing.length ? { box: null, missing } : { box, missing: [] };
}

/**
 * Escala uniforme que deixa o maior erro entre as três medidas o menor possível
 * (minimax). Proporções do modelo não mudam: só o tamanho.
 */
export function fitScale(measured, expected, toleranceCm = SCALE_TOLERANCE_CM) {
  const maxError = (s) => Math.max(...KEYS.map((k) => Math.abs(s * measured[k] - expected[k])));
  const candidates = [];
  for (const a of KEYS) {
    candidates.push(expected[a] / measured[a]);
    for (const b of KEYS) {
      if (a === b) continue;
      candidates.push((expected[a] + expected[b]) / (measured[a] + measured[b]));
      if (measured[a] !== measured[b]) candidates.push((expected[a] - expected[b]) / (measured[a] - measured[b]));
    }
  }
  let scale = expected.heightCm / measured.heightCm;
  for (const s of candidates) if (s > 0 && Number.isFinite(s) && maxError(s) < maxError(scale)) scale = s;
  const scaledCm = Object.fromEntries(KEYS.map((k) => [k, measured[k] * scale]));
  const deltasCm = Object.fromEntries(KEYS.map((k) => [k, scaledCm[k] - expected[k]]));
  const ok = KEYS.every((k) => Math.abs(deltasCm[k]) <= toleranceCm + 1e-6);
  return { scale, scaledCm, deltasCm, ok };
}

/** Confere uma caixa medida com o catálogo (depois de gerar o arquivo). */
export function checkBox(measured, expected, toleranceCm = SCALE_TOLERANCE_CM) {
  const deltasCm = Object.fromEntries(KEYS.map((k) => [k, measured[k] - expected[k]]));
  return { ok: KEYS.every((k) => Math.abs(deltasCm[k]) <= toleranceCm + 1e-6), deltasCm };
}

export const formatBox = (box) => `${cm(box.widthCm)} × ${cm(box.depthCm)} × ${cm(box.heightCm)}`.replace(/ cm × /g, " × ");

function mismatchMessage(measured, expected, deltasCm) {
  const worst = KEYS.filter((k) => Math.abs(deltasCm[k]) > SCALE_TOLERANCE_CM)
    .map((k) => `${LABELS[k]} ${cm(measured[k])} no modelo × ${cm(expected[k])} no catálogo`)
    .join("; ");
  return `As proporções do modelo 3D não batem com as medidas do catálogo (tolerância de ${SCALE_TOLERANCE_CM} cm): ${worst}. Confira as medidas ou gere o 3D de novo.`;
}

// ---------------------------------------------------------------------------
// .glb em escala real
// ---------------------------------------------------------------------------

/** Aplica a escala num nó novo acima da cena (a base continua no chão, y = 0). */
async function scaleDocument(doc, scale) {
  const scene = sceneOf(doc);
  const node = doc.createNode("escala-real").setScale([scale, scale, scale]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    node.addChild(child);
  }
  scene.addChild(node);
  return doc;
}

// ---------------------------------------------------------------------------
// .usdz (USD em texto + texturas, ZIP sem compressão alinhado em 64 bytes)
// ---------------------------------------------------------------------------

const fmt = (digits) => {
  const f = 10 ** digits;
  return (v) => {
    const r = Math.round(v * f) / f;
    return Object.is(r, -0) ? "0" : String(r);
  };
};
const f5 = fmt(5);
const f4 = fmt(4);
const vec3 = (a, b, c, f = f5) => `(${f(a)},${f(b)},${f(c)})`;

/** Matriz normal (inversa transposta da 3×3 da matriz de mundo, coluna-maior). */
function normalMatrix(m) {
  const [a, b, c, , d, e, f, , g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!det) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // Inversa (coluna-maior) e depois transposta.
  const inv = [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
  return [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]];
}

const WRAP = { 10497: "repeat", 33071: "clamp", 33648: "mirror" };

async function encodeTexture(texture, maxSize) {
  const image = texture.getImage();
  if (!image) return null;
  const png = texture.getMimeType() === "image/png";
  const pipeline = sharp(Buffer.from(image)).resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true });
  // O AR Quick Look abre JPEG e PNG. PNG só quando a textura original é PNG (pode ter transparência).
  const bytes = png ? await pipeline.png({ compressionLevel: 9 }).toBuffer() : await pipeline.jpeg({ quality: 85 }).toBuffer();
  return { bytes, ext: png ? "png" : "jpg" };
}

/** Escreve o .usda e reúne as texturas. Devolve também a caixa dos pontos escritos (em cm). */
async function buildUsd(doc, maxTextureSize) {
  const scene = sceneOf(doc);
  const textures = new Map(); // Texture → { file, bytes }
  const materials = new Map(); // Material → índice
  const meshes = [];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];

  const nodes = [];
  scene.traverse((node) => nodes.push(node));
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const n = normalMatrix(m);
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue; // só triângulos
      const position = prim.getAttribute("POSITION");
      if (!position) continue;
      const normal = prim.getAttribute("NORMAL");
      const uv0 = prim.getAttribute("TEXCOORD_0");
      const uv1 = prim.getAttribute("TEXCOORD_1");
      const count = position.getCount();
      const points = new Array(count);
      const normals = normal ? new Array(count) : null;
      const st = uv0 ? new Array(count) : null;
      const st1 = uv1 ? new Array(count) : null;
      const p = [0, 0, 0];
      const q = [0, 0, 0];
      const t = [0, 0];
      const mlo = [Infinity, Infinity, Infinity];
      const mhi = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < count; v++) {
        position.getElement(v, p);
        const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
        const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
        const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
        points[v] = vec3(x, y, z);
        if (x < mlo[0]) mlo[0] = x;
        if (y < mlo[1]) mlo[1] = y;
        if (z < mlo[2]) mlo[2] = z;
        if (x > mhi[0]) mhi[0] = x;
        if (y > mhi[1]) mhi[1] = y;
        if (z > mhi[2]) mhi[2] = z;
        if (normals) {
          normal.getElement(v, q);
          const nx = n[0] * q[0] + n[3] * q[1] + n[6] * q[2];
          const ny = n[1] * q[0] + n[4] * q[1] + n[7] * q[2];
          const nz = n[2] * q[0] + n[5] * q[1] + n[8] * q[2];
          const len = Math.hypot(nx, ny, nz) || 1;
          normals[v] = vec3(nx / len, ny / len, nz / len, f4);
        }
        // glTF: origem da textura no alto; USD: embaixo.
        if (st) {
          uv0.getElement(v, t);
          st[v] = `(${f5(t[0])},${f5(1 - t[1])})`;
        }
        if (st1) {
          uv1.getElement(v, t);
          st1[v] = `(${f5(t[0])},${f5(1 - t[1])})`;
        }
      }
      const indices = prim.getIndices();
      const faceIndices = indices ? Array.from(indices.getArray()) : Array.from({ length: count }, (_, i) => i);
      if (faceIndices.length % 3) continue;

      const material = prim.getMaterial();
      if (material && !materials.has(material)) materials.set(material, materials.size);
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], mlo[k]);
        hi[k] = Math.max(hi[k], mhi[k]);
      }
      meshes.push({ points, normals, st, st1, faceIndices, lo: mlo, hi: mhi, material: material ? materials.get(material) : null });
    }
  }
  if (!meshes.length) throw new Error("O modelo 3D não tem malha para gerar o arquivo do iPhone.");

  async function textureFile(info, texture) {
    if (!textures.has(texture)) {
      const encoded = await encodeTexture(texture, maxTextureSize);
      if (!encoded) return null;
      textures.set(texture, { file: `textures/textura_${textures.size}.${encoded.ext}`, bytes: encoded.bytes });
    }
    return textures.get(texture).file;
  }

  const materialPrims = [];
  for (const [material, index] of materials) {
    const path = `/Root/Materials/Material_${index}`;
    const shaders = [];
    const inputs = [];
    let readers = 0;
    async function textureShader(name, texture, info, { scale, colorSpace, outputs, bias }) {
      const file = await textureFile(info, texture);
      if (!file) return null;
      const varname = info?.getTexCoord?.() === 1 ? "st1" : "st";
      const reader = `Leitor_${readers++}`;
      shaders.push(`            def Shader "${reader}"
            {
                uniform token info:id = "UsdPrimvarReader_float2"
                string inputs:varname = "${varname}"
                float2 outputs:result
            }`);
      shaders.push(`            def Shader "${name}"
            {
                uniform token info:id = "UsdUVTexture"
                asset inputs:file = @${file}@
                float2 inputs:st.connect = <${path}/${reader}.outputs:result>
                ${scale ? `float4 inputs:scale = (${scale.map((v) => f5(v)).join(", ")})` : ""}
                ${bias ? `float4 inputs:bias = (${bias.join(", ")})` : ""}
                token inputs:sourceColorSpace = "${colorSpace}"
                token inputs:wrapS = "${WRAP[info?.getWrapS?.()] ?? "repeat"}"
                token inputs:wrapT = "${WRAP[info?.getWrapT?.()] ?? "repeat"}"
                ${outputs.map((o) => `${o === "rgb" ? "float3" : "float"} outputs:${o}`).join("\n                ")}
            }`);
      return `${path}/${name}`;
    }

    const base = material.getBaseColorFactor();
    const alphaMode = material.getAlphaMode();
    const baseTexture = material.getBaseColorTexture();
    if (baseTexture) {
      const shader = await textureShader("Cor", baseTexture, material.getBaseColorTextureInfo(), {
        scale: [base[0], base[1], base[2], base[3]],
        colorSpace: "sRGB",
        outputs: alphaMode === "OPAQUE" ? ["rgb"] : ["rgb", "a"],
      });
      inputs.push(`color3f inputs:diffuseColor.connect = <${shader}.outputs:rgb>`);
      if (alphaMode !== "OPAQUE") inputs.push(`float inputs:opacity.connect = <${shader}.outputs:a>`);
    } else {
      inputs.push(`color3f inputs:diffuseColor = ${vec3(base[0], base[1], base[2])}`);
      if (alphaMode !== "OPAQUE") inputs.push(`float inputs:opacity = ${f5(base[3])}`);
    }
    if (alphaMode === "MASK") inputs.push(`float inputs:opacityThreshold = ${f5(material.getAlphaCutoff())}`);

    const metallic = material.getMetallicFactor();
    const roughness = material.getRoughnessFactor();
    const mrTexture = material.getMetallicRoughnessTexture();
    if (mrTexture) {
      // glTF: rugosidade no canal G e metal no B (a mesma textura atende os dois).
      const shader = await textureShader("MetalRugosidade", mrTexture, material.getMetallicRoughnessTextureInfo(), {
        scale: [1, roughness, metallic, 1],
        colorSpace: "raw",
        outputs: ["g", "b"],
      });
      inputs.push(`float inputs:roughness.connect = <${shader}.outputs:g>`);
      inputs.push(`float inputs:metallic.connect = <${shader}.outputs:b>`);
    } else {
      inputs.push(`float inputs:roughness = ${f5(roughness)}`, `float inputs:metallic = ${f5(metallic)}`);
    }

    const normalTexture = material.getNormalTexture();
    if (normalTexture) {
      const shader = await textureShader("Normal", normalTexture, material.getNormalTextureInfo(), {
        scale: [2, 2, 2, 1],
        bias: [-1, -1, -1, 0],
        colorSpace: "raw",
        outputs: ["rgb"],
      });
      inputs.push(`normal3f inputs:normal.connect = <${shader}.outputs:rgb>`);
    }

    const occlusionTexture = material.getOcclusionTexture();
    if (occlusionTexture) {
      const shader = await textureShader("Oclusao", occlusionTexture, material.getOcclusionTextureInfo(), {
        colorSpace: "raw",
        outputs: ["r"],
      });
      inputs.push(`float inputs:occlusion.connect = <${shader}.outputs:r>`);
    }

    const emissive = material.getEmissiveFactor();
    const emissiveTexture = material.getEmissiveTexture();
    if (emissiveTexture) {
      const shader = await textureShader("Emissao", emissiveTexture, material.getEmissiveTextureInfo(), {
        scale: [emissive[0], emissive[1], emissive[2], 1],
        colorSpace: "sRGB",
        outputs: ["rgb"],
      });
      inputs.push(`color3f inputs:emissiveColor.connect = <${shader}.outputs:rgb>`);
    } else if (emissive.some((v) => v > 0)) {
      inputs.push(`color3f inputs:emissiveColor = ${vec3(emissive[0], emissive[1], emissive[2])}`);
    }

    materialPrims.push(`        def Material "Material_${index}"
        {
            token outputs:surface.connect = <${path}/Superficie.outputs:surface>

            def Shader "Superficie"
            {
                uniform token info:id = "UsdPreviewSurface"
                ${inputs.join("\n                ")}
                int inputs:useSpecularWorkflow = 0
                token outputs:surface
            }
${shaders.join("\n")}
        }`);
  }

  const meshPrims = meshes.map((mesh, i) => {
    const props = [
      `float3[] extent = [${vec3(mesh.lo[0], mesh.lo[1], mesh.lo[2])}, ${vec3(mesh.hi[0], mesh.hi[1], mesh.hi[2])}]`,
      `int[] faceVertexCounts = [${new Array(mesh.faceIndices.length / 3).fill(3).join(",")}]`,
      `int[] faceVertexIndices = [${mesh.faceIndices.join(",")}]`,
      `point3f[] points = [${mesh.points.join(",")}]`,
      mesh.normals ? `normal3f[] normals = [${mesh.normals.join(",")}] (\n                    interpolation = "vertex"\n                )` : null,
      mesh.st ? `texCoord2f[] primvars:st = [${mesh.st.join(",")}] (\n                    interpolation = "vertex"\n                )` : null,
      mesh.st1 ? `texCoord2f[] primvars:st1 = [${mesh.st1.join(",")}] (\n                    interpolation = "vertex"\n                )` : null,
      `uniform token subdivisionScheme = "none"`,
      mesh.material !== null ? `rel material:binding = </Root/Materials/Material_${mesh.material}>` : null,
    ].filter(Boolean);
    return `            def Mesh "Malha_${i}" (
                prepend apiSchemas = ["MaterialBindingAPI"]
            )
            {
                ${props.join("\n                ")}
            }`;
  });

  const usda = `#usda 1.0
(
    customLayerData = {
        string creator = "Cuxões (estúdio de IA)"
    }
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root"
{
    def Scope "Scenes" (
        kind = "sceneLibrary"
    )
    {
        def Xform "Scene" (
            customData = {
                bool preliminary_collidesWithEnvironment = 0
                string sceneName = "Scene"
            }
            sceneName = "Scene"
        )
        {
            token preliminary:anchoring:type = "plane"
            token preliminary:planeAnchoring:alignment = "horizontal"

${meshPrims.join("\n\n")}
        }
    }

    def Scope "Materials"
    {
${materialPrims.join("\n\n")}
    }
}
`;
  const boundsCm = { widthCm: (hi[0] - lo[0]) * 100, depthCm: (hi[2] - lo[2]) * 100, heightCm: (hi[1] - lo[1]) * 100 };
  return { usda, textures: [...textures.values()], boundsCm };
}

// ZIP "stored" (sem compressão), como o formato USDZ exige, com cada arquivo alinhado em 64 bytes.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStored(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, bytes } of files) {
    const nameBytes = Buffer.from(name, "utf8");
    let pad = (64 - ((offset + 30 + nameBytes.length) % 64)) % 64;
    if (pad > 0 && pad < 4) pad += 64; // um campo extra tem pelo menos 4 bytes
    const extra = Buffer.alloc(pad);
    if (pad) {
      extra.writeUInt16LE(0x1986, 0); // id livre: só preenchimento para alinhar
      extra.writeUInt16LE(pad - 4, 2);
    }
    const crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8); // sem compressão
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0x21, 12); // 1980-01-01
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(pad, 28);
    chunks.push(header, nameBytes, extra, bytes);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(bytes.length, 20);
    entry.writeUInt32LE(bytes.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + pad + bytes.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBytes, end]);
}

/** .glb → .usdz (mesma geometria, materiais e texturas até 1024 px). */
export async function glbToUsdz(glbBytes, { maxTextureSize = 1024 } = {}) {
  const doc = await newIo().readBinary(new Uint8Array(glbBytes));
  for (const size of [maxTextureSize, 512]) {
    const { usda, textures, boundsCm } = await buildUsd(doc, size);
    const usdz = zipStored([
      { name: "modelo.usda", bytes: Buffer.from(usda, "utf8") },
      ...textures.map((t) => ({ name: t.file, bytes: t.bytes })),
    ]);
    if (usdz.length <= MAX_BYTES) return { usdz, boundsCm, textureSize: size };
  }
  throw new Error("O arquivo do iPhone (.usdz) passou de 4 MB mesmo com as texturas reduzidas.");
}

// ---------------------------------------------------------------------------
// Etapa completa: medir, escalar, conferir e gerar
// ---------------------------------------------------------------------------

/** .usdz do modelo como está (sem conferir a escala), ou null se não der para gerar. */
async function approximateUsdz(glbBytes) {
  try {
    return (await glbToUsdz(glbBytes)).usdz;
  } catch {
    return null;
  }
}

/**
 * Sem medidas ou fora da tolerância, `usdz` traz o arquivo do iPhone no tamanho
 * do próprio modelo (aproximado, o cliente ajusta na câmera): é o mesmo que o
 * model-viewer geraria na hora, só que pronto, para a câmera abrir no mesmo toque.
 *
 * @typedef {{ widthCm: number; depthCm: number; heightCm: number }} BoxCm
 * @returns {Promise<
 *   | { status: "ok"; glb: Buffer; usdz: Buffer; boundsCm: BoxCm; catalogCm: BoxCm; scale: number; message: string }
 *   | { status: "sem-medidas" | "fora-da-escala"; message: string; usdz: Buffer | null; modelCm?: BoxCm; catalogCm?: BoxCm; missing?: string[] }
 *   | { status: "invalido"; message: string; catalogCm?: BoxCm }
 * >}
 */
export async function prepareArFiles(glbBytes, dimensions) {
  const { box: catalogCm, missing } = catalogBoxCm(dimensions);
  if (!catalogCm) {
    const list = missing.length > 1 ? `${missing.slice(0, -1).join(", ")} e ${missing.at(-1)}` : missing[0];
    return {
      status: "sem-medidas",
      missing,
      usdz: await approximateUsdz(glbBytes),
      message: `${missing.length > 1 ? "Faltam" : "Falta"} ${list} no catálogo. Sem as medidas, o arquivo do iPhone em tamanho real não é gerado e o AR mostra o tamanho aproximado.`,
    };
  }
  let doc;
  try {
    doc = await newIo().readBinary(new Uint8Array(glbBytes));
  } catch {
    return { status: "invalido", catalogCm, message: "Não foi possível ler o modelo 3D para conferir o tamanho." };
  }
  const modelCm = measureDocumentCm(doc);
  if (!modelCm || KEYS.some((k) => !(modelCm[k] > 0))) {
    return { status: "invalido", catalogCm, message: "Não foi possível medir o modelo 3D." };
  }
  const fit = fitScale(modelCm, catalogCm);
  if (!fit.ok) {
    return {
      status: "fora-da-escala",
      modelCm: fit.scaledCm,
      catalogCm,
      usdz: await approximateUsdz(glbBytes),
      message: mismatchMessage(fit.scaledCm, catalogCm, fit.deltasCm),
    };
  }

  await scaleDocument(doc, fit.scale);
  const glb = Buffer.from(await newIo().writeBinary(doc));
  if (glb.length > MAX_BYTES) return { status: "invalido", catalogCm, message: "O modelo 3D em escala real passou de 4 MB." };

  // Confere de novo nos arquivos gerados (não só na conta).
  const glbCheck = checkBox(measureDocumentCm(await newIo().readBinary(new Uint8Array(glb))), catalogCm);
  const { usdz, boundsCm } = await glbToUsdz(glb);
  const usdzCheck = checkBox(boundsCm, catalogCm);
  if (!glbCheck.ok || !usdzCheck.ok) {
    return {
      status: "fora-da-escala",
      modelCm: boundsCm,
      catalogCm,
      usdz: await approximateUsdz(glbBytes),
      message: mismatchMessage(boundsCm, catalogCm, usdzCheck.deltasCm),
    };
  }
  return {
    status: "ok",
    glb,
    usdz,
    scale: fit.scale,
    boundsCm: Object.fromEntries(KEYS.map((k) => [k, round1(boundsCm[k])])),
    catalogCm,
    message: `Tamanho real conferido: ${formatBox(boundsCm)} (catálogo: ${formatBox(catalogCm)}).`,
  };
}

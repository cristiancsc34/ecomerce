import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogBoxCm, fitScale, prepareArFiles, zipStored } from "@/scripts/ar-files.mjs";
import { arFiles } from "@/lib/catalog/product-helpers";
import { makeMedia } from "./factories";

/** Modelo real da loja (gerado pelo Tripo, 1 m de altura): 77,5 × 90,3 × 100 cm. */
const GLB = readFileSync(new URL("../../public/demo/poltrona-azul.glb", import.meta.url));

type Entry = { name: string; dataOffset: number; method: number; size: number; bytes: Buffer };

/** Lê os arquivos de um ZIP pelos cabeçalhos locais (como o iPhone lê o .usdz). */
function readZip(zip: Buffer): Entry[] {
  const entries: Entry[] = [];
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8);
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.toString("utf8", offset + 30, offset + 30 + nameLength);
    const dataOffset = offset + 30 + nameLength + extraLength;
    entries.push({ name, dataOffset, method, size, bytes: zip.subarray(dataOffset, dataOffset + size) });
    offset = dataOffset + size;
  }
  return entries;
}

/** Caixa da peça escrita no .usda do pacote (cm). */
async function readUsdzBounds(usdz: Buffer) {
  const usda = readZip(usdz)[0].bytes.toString("utf8");
  const points = [...usda.matchAll(/point3f\[\] points = \[(.*?)\]/g)].flatMap(([, list]) =>
    [...list.matchAll(/\(([^)]+)\)/g)].map(([, xyz]) => xyz.split(",").map(Number)),
  );
  const min = [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i])));
  const max = [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])));
  return { widthCm: (max[0] - min[0]) * 100, depthCm: (max[2] - min[2]) * 100, heightCm: (max[1] - min[1]) * 100 };
}

describe("AR em tamanho real: medidas do catálogo", () => {
  it("pede largura, profundidade e altura", () => {
    expect(catalogBoxCm({ widthCm: 78, lengthCm: 90, heightCm: 100 })).toEqual({
      box: { widthCm: 78, depthCm: 90, heightCm: 100 },
      missing: [],
    });
    expect(catalogBoxCm({ heightCm: 100 }).missing).toEqual(["largura", "profundidade"]);
    expect(catalogBoxCm(undefined).missing).toEqual(["largura", "profundidade", "altura"]);
  });

  it("escala uniforme: proporções certas passam, erradas não", () => {
    const model = { widthCm: 77.5, depthCm: 90.3, heightCm: 100 };
    const ok = fitScale(model, { widthCm: 155, depthCm: 180.6, heightCm: 200 });
    expect(ok.ok).toBe(true);
    expect(ok.scale).toBeCloseTo(2, 5);
    // 3 cm a mais só na largura: não há escala que deixe as três dentro de 2 cm.
    expect(fitScale(model, { widthCm: 83.5, depthCm: 90.3, heightCm: 100 }).ok).toBe(false);
    // Até 2 cm de diferença numa medida passa.
    expect(fitScale(model, { widthCm: 79.5, depthCm: 90.3, heightCm: 100 }).ok).toBe(true);
  });
});

describe("AR em tamanho real: arquivos gerados", () => {
  it("sem medidas no catálogo: não promete tamanho real e explica; o .usdz sai no tamanho do modelo", async () => {
    const r = await prepareArFiles(GLB, { heightCm: 100 });
    expect(r.status).toBe("sem-medidas");
    expect(r.message).toBe(
      "Faltam largura e profundidade no catálogo. Sem as medidas, o arquivo do iPhone em tamanho real não é gerado e o AR mostra o tamanho aproximado.",
    );
    if (r.status !== "sem-medidas") throw new Error(r.status);
    // Só para o iPhone abrir a câmera no mesmo toque: o modelo como está (1 m), sem .glb ajustado.
    expect("glb" in r).toBe(false);
    expect((await readUsdzBounds(r.usdz!)).heightCm).toBeCloseTo(100, 0);
  });

  it("medidas que não batem com o modelo (fora de 2 cm): avisa e não publica o tamanho real", async () => {
    const r = await prepareArFiles(GLB, { widthCm: 80, lengthCm: 70, heightCm: 100 });
    expect(r.status).toBe("fora-da-escala");
    expect(r.message).toMatch(/não batem com as medidas do catálogo \(tolerância de 2 cm\)/);
    if (r.status !== "fora-da-escala") throw new Error(r.status);
    expect("glb" in r).toBe(false);
    expect("boundsCm" in r).toBe(false);
    expect((await readUsdzBounds(r.usdz!)).heightCm).toBeCloseTo(100, 0);
  });

  it("arquivo que não é um modelo legível: avisa sem quebrar o estúdio", async () => {
    const r = await prepareArFiles(Buffer.from("glTF não é isto"), { widthCm: 78, lengthCm: 90, heightCm: 100 });
    expect(r.status).toBe("invalido");
  });

  it("gera .glb e .usdz em tamanho real, conferidos com o catálogo", async () => {
    const r = await prepareArFiles(GLB, { widthCm: 39, lengthCm: 45, heightCm: 50 });
    if (r.status !== "ok") throw new Error(r.message);
    // Modelo de 1 m reduzido para a peça de 50 cm.
    expect(r.scale).toBeCloseTo(0.5, 1);
    for (const [k, expected] of [["widthCm", 39], ["depthCm", 45], ["heightCm", 50]] as const) {
      expect(Math.abs(r.boundsCm[k] - expected)).toBeLessThanOrEqual(2);
    }
    expect(r.message).toMatch(/^Tamanho real conferido: .* \(catálogo: 39 × 45 × 50 cm\)\.$/);
    expect(r.glb.subarray(0, 4).toString("latin1")).toBe("glTF");
    expect(r.usdz.length).toBeLessThanOrEqual(4 * 1024 * 1024);

    // USDZ: ZIP sem compressão, .usda primeiro, cada arquivo alinhado em 64 bytes.
    const entries = readZip(r.usdz);
    expect(entries[0].name).toBe("modelo.usda");
    expect(entries.map((e) => e.name).slice(1).every((n) => /^textures\/textura_\d+\.(jpg|png)$/.test(n))).toBe(true);
    for (const e of entries) {
      expect(e.method, e.name).toBe(0);
      expect(e.dataOffset % 64, e.name).toBe(0);
    }
    const usda = entries[0].bytes.toString("utf8");
    expect(usda.startsWith("#usda 1.0")).toBe(true);
    expect(usda).toContain("metersPerUnit = 1");
    expect(usda).toContain('upAxis = "Y"');
    expect(usda).toContain('defaultPrim = "Root"');
    expect(usda).toContain('uniform token info:id = "UsdPreviewSurface"');
    expect(usda).toContain("rel material:binding = </Root/Materials/Material_0>");
    // Toda textura citada está dentro do pacote.
    for (const [, file] of usda.matchAll(/asset inputs:file = @([^@]+)@/g)) {
      expect(entries.some((e) => e.name === file), file).toBe(true);
    }
    // A caixa escrita no .usda é a da peça em metros (base no chão).
    const points = [...usda.matchAll(/point3f\[\] points = \[(.*?)\]/g)].flatMap(([, list]) =>
      [...list.matchAll(/\(([^)]+)\)/g)].map(([, xyz]) => xyz.split(",").map(Number)),
    );
    const min = [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i])));
    const max = [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])));
    expect(min[1]).toBeCloseTo(0, 3);
    expect(Math.abs((max[1] - min[1]) * 100 - 50)).toBeLessThanOrEqual(2);
  });

  it("ZIP: alinha em 64 bytes mesmo com nomes de tamanhos diferentes", () => {
    const zip = zipStored([
      { name: "a.usda", bytes: Buffer.from("#usda 1.0\n") },
      { name: "textures/b.png", bytes: Buffer.alloc(77, 1) },
      { name: "textures/textura-com-nome-longo.jpg", bytes: Buffer.alloc(3, 2) },
    ]);
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(["a.usda", "textures/b.png", "textures/textura-com-nome-longo.jpg"]);
    for (const e of entries) expect(e.dataOffset % 64).toBe(0);
    expect(entries[1].bytes.equals(Buffer.alloc(77, 1))).toBe(true);
  });
});

describe("AR em tamanho real: o que a loja mostra", () => {
  const model = makeMedia({
    type: "model_3d",
    usdzUrl: "https://x.supabase.co/storage/v1/object/public/product-media/products/p/m.usdz",
    realScale: true,
    boundsCm: { widthCm: 77.6, depthCm: 90.4, heightCm: 100.1 },
  });

  it("modelo conferido e medidas iguais às do catálogo: tamanho real com o .usdz", () => {
    expect(arFiles({ dimensions: { widthCm: 78, lengthCm: 90, heightCm: 100 } }, model)).toEqual({
      usdzUrl: model.usdzUrl,
      realScale: true,
    });
  });

  it("medidas do catálogo mudaram depois da conferência: volta a ser aproximado (o .usdz continua, para abrir no mesmo toque)", () => {
    expect(arFiles({ dimensions: { widthCm: 85, lengthCm: 90, heightCm: 100 } }, model)).toEqual({ usdzUrl: model.usdzUrl, realScale: false });
    expect(arFiles({ dimensions: {} }, model)).toEqual({ usdzUrl: model.usdzUrl, realScale: false });
  });

  it("sem conferência: nunca diz tamanho real", () => {
    expect(arFiles({ dimensions: { widthCm: 78, lengthCm: 90, heightCm: 100 } }, { ...model, realScale: false })).toEqual({
      usdzUrl: model.usdzUrl,
      realScale: false,
    });
    expect(arFiles({ dimensions: { widthCm: 78, lengthCm: 90, heightCm: 100 } }, { ...model, realScale: false, usdzUrl: null })).toEqual({
      usdzUrl: null,
      realScale: false,
    });
    expect(arFiles({ dimensions: {} }, null)).toEqual({ usdzUrl: null, realScale: false });
  });
});

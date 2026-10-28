import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { confirmedFacts, unconfirmedNumbers } from "@/lib/ai/copy";
import { Document, NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import sharp from "sharp";
import { CATALOG_STYLES, CATALOG_VIEWS, catalogPrompt, catalogStyle, detectEngines, optimizeGlb, scenePrompt } from "../../scripts/ai-worker.mjs";
import { makeProduct } from "./factories";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("fotos de catálogo: instrução para a IA", () => {
  it("cita todas as fotos de referência e proíbe mudar o produto", () => {
    const prompt = catalogPrompt("tres-quartos", 3);
    expect(prompt).toContain("image 1, image 2, image 3");
    expect(prompt).toContain("three-quarter front view");
    expect(prompt).toMatch(/Do not add, remove, repair, restyle or redesign anything/);
    expect(prompt).toMatch(/transparent background/);
  });

  it("tem os 4 ângulos padrão, sempre na mesma ordem", () => {
    expect(Object.keys(CATALOG_VIEWS)).toEqual(["frente", "tres-quartos", "lateral", "traseira"]);
    for (const view of Object.keys(CATALOG_VIEWS)) expect(catalogPrompt(view, 1)).not.toContain("undefined");
  });

  it("estilo padrão é o fundo creme; neutro e ambiente vazio são opções", () => {
    expect(CATALOG_STYLES).toEqual(["creme", "neutro", "ambiente-vazio"]);
    expect(catalogStyle(env({}))).toBe("creme");
    expect(catalogStyle(env({ CATALOG_STYLE: "ambiente-vazio" }))).toBe("ambiente-vazio");
    expect(catalogStyle(env({ CATALOG_STYLE: "qualquer" }))).toBe("creme");
  });

  it("ambiente vazio: só o produto, sem inventar outros objetos", () => {
    const prompt = scenePrompt();
    expect(prompt).toMatch(/Keep the product exactly as in image 1/);
    expect(prompt).toMatch(/no other furniture, objects, plants, rugs, people, text or logos/);
    expect(prompt).toMatch(/Not a collage/);
  });

  it("só habilita as fotos de catálogo com a chave e o motor de limpeza instalados", () => {
    const root = mkdtempSync(path.join(tmpdir(), "motores-"));
    expect(detectEngines(root, env({ OPENAI_API_KEY: "x" }))).toEqual({});
    mkdirSync(path.join(root, "ai", "models", "birefnet"), { recursive: true });
    writeFileSync(path.join(root, "ai", "models", "birefnet", "model.onnx"), "");
    const withKey = detectEngines(root, env({ OPENAI_API_KEY: "x" }));
    const withoutKey = detectEngines(root, env({}));
    // Sem o Python do estúdio nesta máquina de teste, nada é habilitado — e nunca sem a chave.
    expect(withoutKey.catalog_photos).toBeUndefined();
    if (withKey.background_removal) expect(withKey.catalog_photos).toMatch(/OpenAI/);
  });
});

describe("textos com IA: números não confirmados", () => {
  const copy = {
    nameSuggestions: ["Poltrona Onda"],
    shortDescription: "Poltrona confortável com estofado azul.",
    description: "Estrutura em tom de madeira clara. Garantia de 5 anos e densidade D33.",
    seoTitle: "Poltrona Onda azul",
    seoDescription: "Poltrona com estofado azul-marinho e estrutura em tom de madeira clara para a sala.",
  };

  it("aponta números que não vieram dos dados confirmados", () => {
    const facts = confirmedFacts(makeProduct({ dimensions: { heightCm: 100 } }));
    expect(unconfirmedNumbers(copy, facts)).toEqual(["5", "33"]);
  });

  it("aceita números confirmados pela equipe", () => {
    const facts = confirmedFacts(makeProduct({ dimensions: { heightCm: 100 } }));
    expect(unconfirmedNumbers({ ...copy, description: "Tem 100 cm de altura." }, facts)).toEqual([]);
  });
});

describe("3D (Tripo)", () => {
  it("com a chave do Tripo, o processador oferece o 3D pela API", () => {
    const root = mkdtempSync(path.join(tmpdir(), "motores-3d-"));
    expect(detectEngines(root, env({ TRIPO_API_KEY: "x" })).model_3d).toMatch(/^Tripo .+ \(API\)$/);
    expect(detectEngines(root, env({})).model_3d).toBeUndefined();
  });

  it("gira o modelo para abrir de frente (Tripo exporta com a frente em +X)", async () => {
    const doc = new Document();
    doc.createBuffer();
    const scene = doc.createScene("cena");
    scene.addChild(doc.createNode("cadeira"));
    doc.getRoot().setDefaultScene(scene);
    const bytes = Buffer.from(await new NodeIO().writeBinary(doc));

    const { bytes: out } = await optimizeGlb(bytes, { frontAxis: "+x" });
    const result = await new NodeIO().readBinary(new Uint8Array(out));
    const [pivot] = result.getRoot().getDefaultScene()!.listChildren();
    expect(pivot.getName()).toBe("frente-do-produto");
    const [x, y, z, w] = pivot.getRotation();
    expect([x, z]).toEqual([0, 0]);
    expect(y).toBeCloseTo(-Math.SQRT1_2);
    expect(w).toBeCloseTo(Math.SQRT1_2);
    expect(pivot.listChildren().map((n) => n.getName())).toEqual(["cadeira"]);
  });

  it("deixa o modelo pronto para a realidade aumentada: base no chão e texturas JPEG", async () => {
    // Cubo de 1 m centrado na origem (como o Tripo entrega), com textura WebP.
    const doc = new Document();
    const buffer = doc.createBuffer();
    const corners = [-0.5, 0.5].flatMap((x) => [-0.5, 0.5].flatMap((y) => [-0.5, 0.5].flatMap((z) => [x + 2, y, z])));
    const position = doc.createAccessor().setType("VEC3").setArray(new Float32Array(corners)).setBuffer(buffer);
    const pixels = Buffer.from([46, 110, 158, 255, 255, 255, 255, 255, 255, 46, 110, 158]); // 2×2, duas cores
    const webp = await sharp(pixels, { raw: { width: 2, height: 2, channels: 3 } }).webp().toBuffer();
    doc.createExtension(EXTTextureWebP).setRequired(true);
    const texture = doc.createTexture("cor").setImage(new Uint8Array(webp)).setMimeType("image/webp");
    const material = doc.createMaterial("tecido").setBaseColorTexture(texture);
    const mesh = doc.createMesh("poltrona").addPrimitive(doc.createPrimitive().setAttribute("POSITION", position).setMaterial(material));
    const scene = doc.createScene("cena");
    scene.addChild(doc.createNode("poltrona").setMesh(mesh));
    doc.getRoot().setDefaultScene(scene);
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const bytes = Buffer.from(await io.writeBinary(doc));

    const { bytes: out } = await optimizeGlb(bytes);
    const result = await io.readBinary(new Uint8Array(out));
    const { min, max } = getBounds(result.getRoot().getDefaultScene()!);
    expect(min.map((v) => +v.toFixed(6))).toEqual([-0.5, 0, -0.5]);
    expect(max.map((v) => +v.toFixed(6))).toEqual([0.5, 1, 0.5]);
    expect(result.getRoot().listTextures().map((t) => t.getMimeType())).toEqual(["image/jpeg"]);
    expect(result.getRoot().listExtensionsUsed().map((e) => e.extensionName)).not.toContain("EXT_texture_webp");
  });
});

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { confirmedFacts, unconfirmedNumbers } from "@/lib/ai/copy";
import { CATALOG_STYLES, CATALOG_VIEWS, catalogPrompt, catalogStyle, detectEngines, scenePrompt } from "../../scripts/ai-worker.mjs";
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

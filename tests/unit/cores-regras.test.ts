import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AiJobView } from "@/lib/admin/ai-types";
import { CATALOG_VIEW_LABELS, colorBlocker, colorNameTaken, colorSources, catalogAiMedia, parseColorInput, viewOfAlt } from "@/lib/admin/colors";
import { studioPipeline } from "@/lib/admin/pipeline";
import { CATALOG_VIEWS } from "@/scripts/ai-pipeline.mjs";
import { measureRecolor } from "@/scripts/cores.mjs";
import { makeMedia, makeVariant } from "./factories";

const photo = (view: string) => readFileSync(new URL(`../../public/demo/poltrona-azul-${view}.jpg`, import.meta.url));
const example = (color: string, view: string) => readFileSync(new URL(`../../public/demo/exemplo/poltrona-${color}-${view}.jpg`, import.meta.url));

describe("cores: entrada da cor", () => {
  it("aceita #RRGGBB, sem #, minúsculas e R, G, B; recusa o resto", () => {
    expect(parseColorInput("#6b4a35")).toBe("#6B4A35");
    expect(parseColorInput("6B4A35")).toBe("#6B4A35");
    expect(parseColorInput(" 107, 74, 53 ")).toBe("#6B4A35");
    expect(parseColorInput("rgb(107 74 53)")).toBe("#6B4A35");
    expect(parseColorInput("rgb(205,183,151)")).toBe("#CDB797");
    for (const bad of ["", "marrom", "#6B4A3", "#6B4A35FF", "256, 0, 0", "1, 2", "#GGGGGG"]) expect(parseColorInput(bad), bad).toBeNull();
  });
});

describe("cores: fotos de base", () => {
  it("os ângulos do Estúdio são os mesmos do processador", () => {
    expect(CATALOG_VIEW_LABELS).toEqual(CATALOG_VIEWS);
    expect(viewOfAlt("Poltrona Azul, vista três-quartos (imagem de catálogo feita a partir das fotos reais)")).toBe("tres-quartos");
    expect(viewOfAlt("Foto do produto")).toBeNull();
  });

  it("usa só fotos de catálogo aprovadas, uma por ângulo (a mais recente), na ordem frente, ¾, lateral e traseira", () => {
    const alt = (view: string) => `Poltrona, ${view} (imagem de catálogo feita a partir das fotos reais)`;
    const media = [
      makeMedia({ id: "lat", altText: alt("vista lateral"), aiGenerated: true, sortOrder: 3, isPrimary: false }),
      makeMedia({ id: "frente-velha", altText: alt("vista frontal"), aiGenerated: true, sortOrder: 1, isPrimary: false }),
      makeMedia({ id: "frente-nova", altText: alt("vista frontal"), aiGenerated: true, sortOrder: 7, isPrimary: false }),
      makeMedia({ id: "pendente", altText: alt("vista traseira"), aiGenerated: true, pendingReview: true, sortOrder: 8 }),
      makeMedia({ id: "real", altText: "Foto real de frente", aiGenerated: false, sortOrder: 0 }),
      makeMedia({ id: "cor", altText: alt("vista frontal"), aiGenerated: true, colorJobId: "job", sortOrder: 9 }),
      makeMedia({ id: "da-variacao", altText: alt("vista traseira"), aiGenerated: true, variantId: "v1", sortOrder: 10 }),
    ];
    expect(colorSources(media).map((s) => [s.media.id, s.view])).toEqual([
      ["frente-nova", "frente"],
      ["lat", "lateral"],
    ]);
    // A lista de catálogo do Estúdio não mostra as fotos de cor.
    expect(catalogAiMedia(media).map((m) => m.id)).not.toContain("cor");
  });

  it("não mistura cor com tamanho e não repete o nome (como no link ?cor=)", () => {
    expect(colorBlocker([makeVariant({ colorHex: null })])).toMatch(/variações sem cor/);
    expect(colorBlocker([makeVariant({ colorHex: "#2F3E62" })])).toBeNull();
    expect(colorBlocker([])).toBeNull();
    const variants = [makeVariant({ name: "Azul-marinho", colorHex: "#2F3E62" })];
    expect(colorNameTaken(variants, "azul marinho")).toBe(true);
    expect(colorNameTaken(variants, "Marrom")).toBe(false);
  });
});

describe("cores: medição da cor (aviso para quem confere)", () => {
  it("nas fotos de exemplo geradas pelo GPT, mede a cor perto da pedida e não avisa nada", async () => {
    const cases = [
      ["marrom", "#6B4A35"],
      ["branco", "#ECE7DE"],
      ["vermelho", "#9C2A2A"],
      ["bege", "#CDB797"],
    ] as const;
    for (const [color, hex] of cases) {
      for (const view of ["frente", "traseira"]) {
        const r = await measureRecolor(photo(view), example(color, view), { targetHex: hex });
        expect(r.warnings, `${color} ${view}`).toEqual([]);
        expect(r.colorDeltaE!, `${color} ${view}`).toBeLessThan(12);
        expect(r.changedShare).toBeGreaterThan(0.05);
        // A cor original medida é o azul do tecido.
        const [red, , blue] = [1, 3, 5].map((i) => parseInt(r.originalHex!.slice(i, i + 2), 16));
        expect(blue).toBeGreaterThan(red);
      }
    }
  }, 60_000);

  it("avisa quando o GPT não trocou a cor, trocou para outra ou refez a cena", async () => {
    const same = await measureRecolor(photo("frente"), photo("frente"), { targetHex: "#6B4A35" });
    expect(same.warnings).toContain("A foto quase não mudou de cor.");
    const wrong = await measureRecolor(photo("frente"), example("marrom", "frente"), { targetHex: "#9C2A2A" });
    expect(wrong.warnings).toContain("A cor medida no tecido está longe da pedida.");
    const otherView = await measureRecolor(photo("frente"), example("marrom", "lateral"), { targetHex: "#6B4A35" });
    expect(otherView.warnings.length).toBeGreaterThan(0);
  }, 60_000);
});

describe("cores: etapa na lista do Estúdio", () => {
  const job = (status: AiJobView["status"]): AiJobView => ({
    id: `cor-${status}`,
    kind: "color_variant",
    status,
    inputUrl: "/x.jpg",
    outputUrl: null,
    outputMediaId: null,
    sourceMediaId: null,
    hasCutout: false,
    engine: null,
    error: status === "failed" ? "OpenAI: limite" : null,
    seconds: null,
    droppedBackgroundObject: false,
    ar: null,
    color: { name: "Marrom", hex: "#6B4A35", sourceMediaIds: ["a"], photos: [] },
    createdAt: "2026-11-05T10:00:00Z",
    startedAt: status === "queued" ? null : "2026-11-05T10:00:10Z",
    finishedAt: null,
  });
  const steps = (jobs: AiJobView[], colors = { published: 0, toReview: 0 }, capabilities = ["catalog_photos", "color_variant"]) =>
    studioPipeline({
      jobs,
      now: null,
      workerOnline: true,
      capabilities,
      uploading: false,
      catalogMedia: [],
      copy: { enabled: true, hasCopy: false, writing: false, draftReady: false },
      model3d: { required: false, auto: false },
      colors,
    }).steps.find((s) => s.id === "cores")!;

  it("é opcional, mostra o andamento, a conferência, o erro e as cores publicadas", () => {
    expect(steps([])).toMatchObject({ state: "todo", optional: true });
    expect(steps([job("running")])).toMatchObject({ state: "working", detail: "Criando as fotos na cor “Marrom”" });
    expect(steps([job("queued")]).state).toBe("queued");
    expect(steps([job("succeeded")], { published: 0, toReview: 1 })).toMatchObject({ state: "review", detail: "Confira as fotos e publique 1 cor." });
    expect(steps([job("failed")])).toMatchObject({ state: "failed", detail: "OpenAI: limite" });
    expect(steps([], { published: 3, toReview: 0 })).toMatchObject({ state: "done", detail: "3 cores na loja." });
    expect(steps([], undefined, ["catalog_photos"]).state).toBe("off");
  });
});

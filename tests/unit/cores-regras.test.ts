import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AiJobView } from "@/lib/admin/ai-types";
import {
  CATALOG_VIEW_LABELS,
  colorBlocker,
  colorNameTaken,
  colorSources,
  catalogAiMedia,
  missingColorsMigration,
  parseColorInput,
  selectWithColorsFallback,
  viewOfAlt,
} from "@/lib/admin/colors";
import { serverAddedVariants } from "@/lib/admin/form-values";
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
    expect(steps([], { published: 3, toReview: 0 })).toMatchObject({ state: "done", detail: "3 cores cadastradas." });
    expect(steps([], undefined, ["catalog_photos"]).state).toBe("off");
  });
});

describe("cores: formulário aberto enquanto a cor é publicada", () => {
  it("as variações novas do servidor entram no formulário; as que a pessoa tirou não voltam", () => {
    const server = [{ id: "azul" }, { id: "marrom" }, { id: "vermelho" }];
    // Antes: o formulário conhecia só "azul" e "vermelho"; a pessoa tirou "vermelho".
    expect(serverAddedVariants(server, new Set(["azul", "vermelho"]), new Set(["azul"]))).toEqual([{ id: "marrom" }]);
    expect(serverAddedVariants(server, new Set(["azul", "marrom", "vermelho"]), new Set(["azul"]))).toEqual([]);
  });
});

describe("cores: banco ainda sem a migração (modo seguro)", () => {
  // Mensagens reais do Supabase de produção antes da migração (05–07/11/2026).
  const realErrors = [
    { code: "42703", message: "column product_media_1.color_job_id does not exist", details: null, hint: null },
    { code: "42703", message: "column ai_jobs.params does not exist", details: null, hint: null },
    { code: "22P02", message: 'invalid input value for enum ai_job_kind: "color_variant"', details: null, hint: null },
  ];

  it("reconhece a falta da migração e nada mais", () => {
    for (const e of realErrors) expect(missingColorsMigration(e), e.message).toBe(true);
    for (const e of [null, undefined, { message: "permission denied for table products" }, { message: 'column products.name does not exist' }]) {
      expect(missingColorsMigration(e)).toBe(false);
    }
  });

  it("repete a consulta sem as colunas das Cores só quando o banco não as tem", async () => {
    const asked: string[] = [];
    const fake = (missing: boolean) => (columns: string) => {
      asked.push(columns);
      return Promise.resolve(
        missing && columns.includes("color_job_id") ? { data: null, error: realErrors[0] } : { data: [{ id: 1 }], error: null },
      );
    };
    const old = await selectWithColorsFallback(fake(true), "id,color_job_id", "id");
    expect(old).toEqual({ result: { data: [{ id: 1 }], error: null }, legacy: true });
    expect(asked).toEqual(["id,color_job_id", "id"]);
    asked.length = 0;
    const current = await selectWithColorsFallback(fake(false), "id,color_job_id", "id");
    expect(current.legacy).toBe(false);
    expect(asked).toEqual(["id,color_job_id"]);
    // Outro erro não é escondido.
    const other = await selectWithColorsFallback(() => Promise.resolve({ data: null, error: { message: "permission denied" } }), "a", "b");
    expect(other).toMatchObject({ legacy: false, result: { error: { message: "permission denied" } } });
  });

  it("a etapa Cores fica desligada, com o motivo, até o banco receber a atualização", () => {
    const step = studioPipeline({
      jobs: [],
      now: null,
      workerOnline: true,
      capabilities: ["catalog_photos"],
      uploading: false,
      catalogMedia: [],
      copy: { enabled: true, hasCopy: false, writing: false, draftReady: false },
      model3d: { required: false, auto: false },
      colors: { published: 0, toReview: 0, ready: false },
    }).steps.find((s) => s.id === "cores")!;
    expect(step).toMatchObject({ state: "off", detail: "Aguardando a atualização do banco para ativar as Cores." });
  });
});

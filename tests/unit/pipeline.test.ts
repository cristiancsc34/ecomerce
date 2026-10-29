import { describe, expect, it } from "vitest";
import type { AiJobView } from "@/lib/admin/ai-types";
import { duration, studioPipeline, type PipelineInput } from "@/lib/admin/pipeline";

const NOW = Date.parse("2026-10-28T20:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

function job(kind: AiJobView["kind"], status: AiJobView["status"], extra: Partial<AiJobView> = {}): AiJobView {
  return {
    id: `${kind}-${Math.random()}`,
    kind,
    status,
    inputUrl: "/x.jpg",
    outputUrl: status === "succeeded" ? "/y.jpg" : null,
    outputMediaId: null,
    sourceMediaId: null,
    hasCutout: status === "succeeded",
    engine: null,
    error: null,
    seconds: null,
    droppedBackgroundObject: false,
    createdAt: ago(120),
    startedAt: status === "queued" ? null : ago(10),
    finishedAt: status === "succeeded" || status === "failed" ? ago(5) : null,
    ...extra,
  };
}

const base = (over: Partial<PipelineInput> = {}): PipelineInput => ({
  jobs: [],
  now: NOW,
  workerOnline: true,
  capabilities: ["background_removal", "catalog_photos", "model_3d"],
  uploading: false,
  catalogMedia: [],
  copy: { enabled: true, hasCopy: false, writing: false, draftReady: false },
  model3d: { required: false, auto: false },
  ...over,
});

const states = (input: PipelineInput) => Object.fromEntries(studioPipeline(input).steps.map((s) => [s.id, s.state]));

describe("etapas do estúdio", () => {
  it("sem fotos: começa pedindo as fotos do celular", () => {
    const p = studioPipeline(base());
    expect(p.current?.id).toBe("fotos");
    expect(p.remainingSeconds).toBe(0);
  });

  it("limpando a foto 1 de 3: etapa atual é a limpeza e o tempo soma limpeza + fotos de catálogo", () => {
    const jobs = [
      job("background_removal", "running", { startedAt: ago(10) }),
      job("background_removal", "queued"),
      job("background_removal", "queued"),
    ];
    const p = studioPipeline(base({ jobs }));
    expect(p.current?.id).toBe("limpeza");
    expect(p.current?.detail).toBe("Foto 1 de 3");
    expect(states(base({ jobs }))).toMatchObject({ fotos: "done", limpeza: "working", catalogo: "todo", modelo3d: "todo" });
    // 30 s (foto 1) + 40 + 40 (fila) + 90 (fotos de catálogo; os textos, ~8 s, correm junto)
    expect(p.remainingSeconds).toBe(30 + 40 + 40 + 90);
  });

  it("3D opcional não entra na conta nem vira a etapa atual", () => {
    const jobs = [0, 1, 2].map(() => job("background_removal", "succeeded"));
    const catalogMedia = [0, 1, 2, 3].map(() => ({ pendingReview: true }));
    const input = base({
      jobs: [...jobs, job("catalog_photos", "succeeded")],
      catalogMedia,
      copy: { enabled: true, hasCopy: false, writing: false, draftReady: true },
    });
    const p = studioPipeline(input);
    expect(states(input)).toMatchObject({ limpeza: "done", catalogo: "done", textos: "review", modelo3d: "todo", conferir: "review" });
    expect(p.steps.find((s) => s.id === "modelo3d")?.optional).toBe(true);
    expect(p.current?.id).toBe("textos");
    expect(p.steps.find((s) => s.id === "conferir")?.detail).toContain("aprovar 4 fotos de catálogo e aplicar os textos");
    expect(p.remainingSeconds).toBe(0);
  });

  it("3D obrigatório na categoria: entra na conta e explica como desmarcar", () => {
    const jobs = [0, 1, 2].map(() => job("background_removal", "succeeded"));
    const p = studioPipeline(base({ jobs, model3d: { required: true, auto: false } }));
    const step = p.steps.find((s) => s.id === "modelo3d")!;
    expect(step.optional).toBe(false);
    expect(step.detail).toContain("Exige modelo 3D para publicar");
    expect(p.remainingSeconds).toBe(90 + 135);
  });

  it("IA não configurada: as etapas esperam e dizem por quê", () => {
    const input = base({ jobs: [0, 1, 2].map(() => job("background_removal", "queued")), workerOnline: false, capabilities: [] });
    const p = studioPipeline(input);
    expect(p.current?.state).toBe("waiting");
    expect(p.current?.detail).toBe("Esperando a IA ser configurada");
  });

  it("menos de 3 fotos: avisa quantas faltam para seguir sozinho", () => {
    const p = studioPipeline(base({ jobs: [job("background_removal", "succeeded")] }));
    expect(p.steps[0]).toMatchObject({ state: "review", detail: "1 foto enviada: envie mais 2 para seguir sozinho." });
  });

  it("tudo feito: sem etapa atual", () => {
    const jobs = [...[0, 1, 2].map(() => job("background_removal", "succeeded")), job("catalog_photos", "succeeded")];
    const p = studioPipeline(
      base({ jobs, catalogMedia: [{ pendingReview: false }], copy: { enabled: true, hasCopy: true, writing: false, draftReady: false } }),
    );
    expect(p.current).toBeNull();
  });

  it("antes da hidratação usa o tempo típico (mesmo texto no servidor e no navegador)", () => {
    const jobs = [job("background_removal", "running", { startedAt: ago(30) })];
    expect(studioPipeline(base({ jobs, now: null })).steps[1].etaSeconds).toBe(40);
  });

  it("formata a duração", () => {
    expect([duration(8), duration(90), duration(120), duration(135)]).toEqual(["8 s", "1 min 30 s", "2 min", "2 min 15 s"]);
  });
});

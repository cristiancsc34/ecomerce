import { isPending, type AiJobView } from "./ai-types";

/**
 * Tempos (docs/ESTUDIO-IA.md): limpeza 35–45 s por foto (medido no processador local), 3D ~2 min 15 s e textos ~8 s
 * (medidos). Fotos de catálogo: ~40 s por imagem medidos; as 4 agora saem ao mesmo tempo (estimativa: ~50 s).
 */
export const TYPICAL_SECONDS = { background_removal: 40, catalog_photos: 50, model_3d: 135, copy: 8 } as const;

/** Frente, lateral e traseira: com menos fotos o painel não segue sozinho (a IA teria de adivinhar lados). */
export const MIN_PHOTOS_AUTO = 3;

export type StepId = "fotos" | "limpeza" | "catalogo" | "textos" | "modelo3d" | "conferir";
/**
 * done: feito · working: gerando agora · queued: na fila · waiting: IA ainda não configurada ·
 * todo: ainda não começou · review: precisa da pessoa · failed: deu erro · off: indisponível.
 */
export type StepState = "done" | "working" | "queued" | "waiting" | "todo" | "review" | "failed" | "off";

export type PipelineStep = {
  id: StepId;
  label: string;
  state: StepState;
  detail: string;
  /** Quanto falta (ou quanto costuma levar, se ainda não começou). */
  etaSeconds: number | null;
  optional: boolean;
};

export type PipelineInput = {
  jobs: AiJobView[];
  /** Relógio do navegador; null antes da hidratação (usa o tempo típico). */
  now: number | null;
  workerOnline: boolean;
  capabilities: string[];
  uploading: boolean;
  /** Imagens de catálogo geradas por IA que ainda existem no produto. */
  catalogMedia: { pendingReview: boolean }[];
  copy: { enabled: boolean; hasCopy: boolean; writing: boolean; draftReady: boolean };
  model3d: { required: boolean; auto: boolean };
};

export type Pipeline = { steps: PipelineStep[]; current: PipelineStep | null; remainingSeconds: number };

export function duration(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  const s = seconds % 60;
  return s ? `${Math.floor(seconds / 60)} min ${s} s` : `${seconds / 60} min`;
}

export function elapsedSeconds(job: Pick<AiJobView, "createdAt" | "startedAt" | "finishedAt">, now: number) {
  const start = job.startedAt ?? job.createdAt;
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : now;
  return Math.max(0, Math.round((end - new Date(start).getTime()) / 1000));
}

function remaining(job: AiJobView, now: number | null) {
  const typical = TYPICAL_SECONDS[job.kind];
  if (job.status === "queued" || now === null) return typical;
  // Passou do tempo típico: ainda gerando, conta como "quase".
  return Math.max(5, typical - elapsedSeconds(job, now));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * A IA está ligada, mas sem a limpeza de fundo (falta a chave da fal.ai): a etapa é pulada e as fotos de catálogo
 * saem direto das fotos do celular (que já são a referência delas).
 */
export function cleanupSkipped(workerOnline: boolean, capabilities: string[]) {
  return workerOnline && !capabilities.includes("background_removal");
}

/** Em que etapa o produto está no estúdio, o que falta e quanto tempo deve levar. */
export function studioPipeline(input: PipelineInput): Pipeline {
  const { jobs, now, workerOnline, capabilities, uploading, catalogMedia, copy, model3d } = input;
  const skipCleanup = cleanupSkipped(workerOnline, capabilities);
  const pendingState = (job: AiJobView): StepState => (job.status === "running" ? "working" : workerOnline ? "queued" : "waiting");
  const waitingDetail = "Esperando a IA ser configurada";

  // 1. Fotos do celular
  const clean = jobs.filter((j) => j.kind === "background_removal");
  const fotos: PipelineStep = { id: "fotos", label: "Fotos do celular", state: "todo", detail: "", etaSeconds: null, optional: false };
  if (uploading) Object.assign(fotos, { state: "working", detail: "Enviando as fotos…" });
  else if (!clean.length) fotos.detail = "Envie 3 ou 4 fotos: frente, lateral e traseira.";
  else if (clean.length < MIN_PHOTOS_AUTO) {
    Object.assign(fotos, {
      state: "review",
      detail: `${plural(clean.length, "foto enviada", "fotos enviadas")}: envie mais ${MIN_PHOTOS_AUTO - clean.length} para seguir sozinho.`,
    });
  } else Object.assign(fotos, { state: "done", detail: plural(clean.length, "foto enviada", "fotos enviadas") });

  // 2. Limpeza do fundo
  const cleanPending = clean.filter(isPending);
  const cleanOk = clean.filter((j) => j.status === "succeeded");
  const limpeza: PipelineStep = { id: "limpeza", label: "Limpeza do fundo", state: "todo", detail: "Começa sozinha quando as fotos chegam.", etaSeconds: TYPICAL_SECONDS.background_removal, optional: false };
  if (skipCleanup) {
    Object.assign(limpeza, {
      state: "off",
      detail: "Pulada: falta a chave da fal.ai (FAL_KEY). As fotos de catálogo saem direto das fotos do celular.",
      etaSeconds: null,
    });
  } else if (cleanPending.length) {
    const running = cleanPending.find((j) => j.status === "running");
    Object.assign(limpeza, {
      state: pendingState(cleanPending[0]),
      detail: running
        ? `Foto ${clean.indexOf(running) + 1} de ${clean.length}`
        : workerOnline
          ? `${plural(cleanPending.length, "foto", "fotos")} na fila`
          : waitingDetail,
      etaSeconds: cleanPending.reduce((sum, j) => sum + remaining(j, now), 0),
    });
  } else if (clean.length && !cleanOk.length) {
    Object.assign(limpeza, { state: "failed", detail: "Não foi possível limpar as fotos. Envie de novo.", etaSeconds: null });
  } else if (cleanOk.length) {
    Object.assign(limpeza, { state: "done", detail: plural(cleanOk.length, "foto limpa", "fotos limpas"), etaSeconds: null });
  }
  // Fotos prontas para as próximas etapas: limpas, ou só enviadas quando a limpeza está desligada.
  const cleanDone = skipCleanup ? clean.length > 0 : clean.length > 0 && !cleanPending.length && cleanOk.length > 0;
  const readyCount = skipCleanup ? clean.length : cleanOk.length;
  const afterPhotos = skipCleanup ? "Depois das fotos." : "Depois da limpeza.";

  // 3. Fotos de catálogo (padrão da loja)
  const catalogJob = jobs.filter((j) => j.kind === "catalog_photos").at(-1) ?? null;
  const catalogo: PipelineStep = { id: "catalogo", label: "Fotos de catálogo", state: "todo", detail: afterPhotos, etaSeconds: TYPICAL_SECONDS.catalog_photos, optional: false };
  if (catalogJob && isPending(catalogJob)) {
    Object.assign(catalogo, {
      state: pendingState(catalogJob),
      detail: catalogJob.status === "running" ? "Criando frente, três-quartos, lateral e traseira" : workerOnline ? "Na fila" : waitingDetail,
      etaSeconds: remaining(catalogJob, now),
    });
  } else if (catalogMedia.length) {
    Object.assign(catalogo, { state: "done", detail: plural(catalogMedia.length, "foto pronta", "fotos prontas"), etaSeconds: null });
  } else if (catalogJob?.status === "failed") {
    Object.assign(catalogo, { state: "failed", detail: catalogJob.error ?? "Não foi possível criar as fotos. Tente de novo.", etaSeconds: null });
  } else if (workerOnline && !capabilities.includes("catalog_photos")) {
    Object.assign(catalogo, { state: "off", detail: "Falta a chave da OpenAI (OPENAI_API_KEY) na Vercel.", etaSeconds: null });
  } else if (cleanDone) {
    catalogo.detail = readyCount >= MIN_PHOTOS_AUTO ? "Começa sozinho." : "Com poucas fotos, toque em “Gerar fotos de catálogo”.";
  }
  const catalogDone = catalogo.state === "done";

  // 4. Nome e descrição (sugestão do ChatGPT; a pessoa revisa e aplica)
  const textos: PipelineStep = { id: "textos", label: "Nome e descrição", state: "todo", detail: afterPhotos, etaSeconds: TYPICAL_SECONDS.copy, optional: false };
  if (!copy.enabled) Object.assign(textos, { state: "off", detail: "Falta a chave da OpenAI (OPENAI_API_KEY) na Vercel.", etaSeconds: null });
  else if (copy.hasCopy) Object.assign(textos, { state: "done", detail: "Descrição no produto.", etaSeconds: null });
  else if (copy.writing) Object.assign(textos, { state: "working", detail: "O ChatGPT está escrevendo." });
  else if (copy.draftReady) Object.assign(textos, { state: "review", detail: "Sugestão pronta: revise e toque em “Aplicar ao produto”.", etaSeconds: null });
  else if (cleanDone) textos.detail = "Começa sozinho.";

  // 5. Modelo 3D (opcional enquanto a categoria não exigir)
  const modelJob = jobs.filter((j) => j.kind === "model_3d").at(-1) ?? null;
  const has3d = jobs.some((j) => j.kind === "model_3d" && j.status === "succeeded" && j.outputUrl);
  const modelo3d: PipelineStep = {
    id: "modelo3d",
    label: "Modelo 3D",
    state: "todo",
    detail: model3d.required
      ? "Obrigatório nesta categoria. Sem créditos agora? Desmarque “Exige modelo 3D para publicar” em Categorias."
      : model3d.auto
        ? "Começa sozinho depois das fotos de catálogo."
        : "Toque em “Gerar modelo 3D” quando tiver créditos do Tripo.",
    etaSeconds: TYPICAL_SECONDS.model_3d,
    optional: !model3d.required,
  };
  if (modelJob && isPending(modelJob)) {
    Object.assign(modelo3d, {
      state: pendingState(modelJob),
      detail: modelJob.status === "running" ? "Montando o 3D a partir das fotos" : workerOnline ? "Na fila" : waitingDetail,
      etaSeconds: remaining(modelJob, now),
    });
  } else if (has3d) Object.assign(modelo3d, { state: "done", detail: "Modelo 3D pronto.", etaSeconds: null });
  else if (modelJob?.status === "failed") {
    Object.assign(modelo3d, { state: "failed", detail: modelJob.error ?? "Não foi possível gerar o 3D.", etaSeconds: null });
  } else if (workerOnline && !capabilities.includes("model_3d")) {
    Object.assign(modelo3d, { state: "off", detail: "Falta a chave do Tripo (TRIPO_API_KEY) na Vercel.", etaSeconds: null });
  }

  // 6. Conferir e aprovar (a pessoa)
  const toApprove = catalogMedia.filter((m) => m.pendingReview).length;
  const todo = [toApprove ? `aprovar ${plural(toApprove, "foto de catálogo", "fotos de catálogo")}` : null, copy.draftReady ? "aplicar os textos" : null].filter(Boolean);
  const autoBusy = [limpeza, catalogo, textos].some((s) => ["working", "queued", "waiting"].includes(s.state));
  const conferir: PipelineStep = { id: "conferir", label: "Conferir e aprovar (você)", state: "todo", detail: "Quando as etapas acima terminarem.", etaSeconds: null, optional: false };
  if (todo.length) Object.assign(conferir, { state: "review", detail: `Falta ${todo.join(" e ")}. Depois, publique em “Pronto para vender”.` });
  else if (catalogDone && copy.hasCopy && !autoBusy) Object.assign(conferir, { state: "done", detail: "Tudo conferido. Publique em “Pronto para vender”." });

  const steps = [fotos, limpeza, catalogo, textos, modelo3d, conferir];
  const settled = (s: PipelineStep) => s.state === "done" || s.state === "off" || (s.optional && s.state === "todo");
  const current = steps.find((s) => !settled(s)) ?? null;

  // Até ficar pronto para conferir: limpeza, depois fotos de catálogo e textos ao mesmo tempo, e o 3D se for entrar.
  const pendingEta = (s: PipelineStep) => (["working", "queued", "waiting", "todo"].includes(s.state) ? (s.etaSeconds ?? 0) : 0);
  const remainingSeconds =
    (clean.length || uploading ? pendingEta(limpeza) : 0) +
    Math.max(pendingEta(catalogo), pendingEta(textos)) +
    (model3d.required || model3d.auto || (modelJob && isPending(modelJob)) ? pendingEta(modelo3d) : 0);

  return { steps, current, remainingSeconds: clean.length || uploading ? remainingSeconds : 0 };
}

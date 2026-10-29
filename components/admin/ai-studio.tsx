"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  aiResultsSeenAction,
  aiStudioSnapshotAction,
  applyCopyAction,
  approveAiMediaAction,
  discardAiJobAction,
  requestCatalogPhotosAction,
  requestModel3dAction,
  suggestCopyAction,
  uploadAiPhotoAction,
} from "@/lib/admin/actions/ai";
import type { CopySuggestion } from "@/lib/ai/copy";
import { deleteMediaAction } from "@/lib/admin/actions/media";
import { isPending, type AiJobKind, type AiJobView, type AiStudioSnapshot } from "@/lib/admin/ai-types";
import {
  cleanupSkipped,
  duration,
  elapsedSeconds as elapsed,
  MIN_PHOTOS_AUTO,
  studioPipeline,
  TYPICAL_SECONDS,
  type Pipeline,
  type StepState,
} from "@/lib/admin/pipeline";
import type { ProductMedia } from "@/lib/catalog/types";
import { useHydrated } from "@/lib/use-hydrated";
import { useStoredFlag } from "@/lib/use-stored-flag";
import { Badge } from "@/components/ui/badge";
import { Button, Spinner } from "@/components/ui/button";
import { AlertIcon, CheckIcon, ClockIcon, CubeIcon, ImageIcon, SparkIcon } from "@/components/ui/icons";
import { controlClasses, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ConfirmButton } from "./confirm-dialog";

const POLL_MS = 2000;
/** Fotos de celular passam fácil de 4 MB: reduzimos no navegador antes de enviar. */
const MAX_SIDE = 2560;

async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 3.5 * 1024 * 1024) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, { type: "image/jpeg" });
}

const KIND_ORDER: AiJobKind[] = ["background_removal", "catalog_photos", "model_3d"];
const KIND_LABEL: Record<AiJobKind, string> = {
  background_removal: "limpeza do fundo",
  catalog_photos: "fotos de catálogo",
  model_3d: "modelo 3D",
};

const WORKING_LABEL: Record<AiJobKind, string> = {
  background_removal: "Limpando o fundo",
  catalog_photos: "Criando as fotos de catálogo",
  model_3d: "Gerando o modelo 3D",
};

function StatusBadge({ job }: { job: AiJobView }) {
  if (job.status === "queued") return <Badge tone="neutral">Na fila</Badge>;
  if (job.status === "running") {
    return (
      <Badge tone="info">
        <Spinner className="h-3.5 w-3.5" /> Gerando
      </Badge>
    );
  }
  if (job.status === "failed") return <Badge tone="danger">Falhou</Badge>;
  // Início e fim já vêm do banco: o mesmo texto no servidor e no navegador.
  return (
    <Badge tone="success">
      <CheckIcon className="h-3.5 w-3.5" /> Pronto em {duration(elapsed(job, 0))}
    </Badge>
  );
}

/** Barra de progresso: com `value`, enche; sem, vai e volta (esperando a vez). */
function ProgressTrack({ value, label }: { value?: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-sky-mist/60"
    >
      {value === undefined ? (
        <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-air-blue/70 motion-safe:animate-vai-e-volta" />
      ) : (
        <div
          className="h-full rounded-full bg-[linear-gradient(110deg,var(--color-air-blue)_40%,var(--color-sky-mist)_50%,var(--color-air-blue)_60%)] bg-[length:200%_100%] transition-[width] duration-[2000ms] ease-linear motion-safe:animate-brilho"
          style={{ width: `${value}%` }}
        />
      )}
    </div>
  );
}

/**
 * O que está acontecendo com uma tarefa da IA, com tempo decorrido e o tempo
 * que costuma levar. A barra anda pelo relógio (a IA não informa a
 * porcentagem) e para em 95% até a tarefa terminar de verdade.
 */
function JobProgress({ job, now, hydrated, workerOnline }: { job: AiJobView; now: number; hydrated: boolean; workerOnline: boolean }) {
  if (!isPending(job)) return null;
  const typical = TYPICAL_SECONDS[job.kind];
  if (job.status === "queued") {
    return (
      <div className="mt-3">
        <p className="text-xs font-semibold text-muted">
          {workerOnline ? "Na fila: começa assim que a tarefa anterior terminar." : "Na fila, esperando a IA ser configurada."}
        </p>
        {workerOnline ? <ProgressTrack label="Na fila" /> : null}
      </div>
    );
  }
  // O relógio só entra depois da hidratação: servidor e navegador desenham o mesmo texto.
  const seconds = hydrated ? elapsed(job, now) : 0;
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-semibold">
        <span className="flex items-center gap-1.5 text-air-blue-ink">
          <Spinner className="h-3.5 w-3.5" /> {WORKING_LABEL[job.kind]}…
        </span>
        <span className="tabular-nums text-muted">
          {hydrated ? `${duration(seconds)} · costuma levar ~${duration(typical)}` : `costuma levar ~${duration(typical)}`}
        </span>
      </div>
      <ProgressTrack value={Math.min(95, Math.round((seconds / typical) * 100))} label={WORKING_LABEL[job.kind]} />
      {!workerOnline ? (
        <p className="mt-1.5 text-xs text-danger">A IA parou de responder.</p>
      ) : seconds > typical * 1.5 ? (
        <p className="mt-1.5 text-xs text-muted">Está levando mais que o normal; a IA continua trabalhando.</p>
      ) : null}
    </div>
  );
}

/** Espaço da imagem que ainda vai chegar: brilho correndo enquanto a IA trabalha. */
function WorkingTile({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs font-semibold ${
        active
          ? "bg-[linear-gradient(110deg,var(--color-pale-blue)_35%,var(--color-white)_50%,var(--color-pale-blue)_65%)] bg-[length:200%_100%] text-air-blue-ink motion-safe:animate-brilho"
          : "text-muted"
      }`}
    >
      {active ? <Spinner className="h-6 w-6" /> : null}
      {label}
    </div>
  );
}

const STEP_ANCHOR: Record<string, string> = {
  fotos: "#estudio-fotos",
  limpeza: "#estudio-fotos",
  catalogo: "#estudio-catalogo",
  textos: "#estudio-textos",
  modelo3d: "#estudio-3d",
  conferir: "#estudio-catalogo",
};

const STATE_TEXT: Record<StepState, string> = {
  done: "feito",
  working: "gerando agora",
  queued: "na fila",
  waiting: "esperando a IA",
  todo: "ainda não começou",
  review: "precisa de você",
  failed: "deu erro",
  off: "indisponível",
};

function StepIcon({ state, index }: { state: StepState; index: number }) {
  const box = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full";
  if (state === "done") {
    return (
      <span className={`${box} bg-success text-white`}>
        <CheckIcon className="h-4 w-4" />
      </span>
    );
  }
  if (state === "working") {
    return (
      <span className={`${box} bg-pale-blue text-air-blue-ink ring-2 ring-air-blue`}>
        <Spinner className="h-4 w-4" />
      </span>
    );
  }
  if (state === "queued" || state === "waiting") {
    return (
      <span className={`${box} bg-pale-blue text-muted`}>
        <ClockIcon className="h-4 w-4" />
      </span>
    );
  }
  if (state === "review") {
    return (
      <span className={`${box} bg-warm-coral text-ink`}>
        <AlertIcon className="h-4 w-4" />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className={`${box} bg-[#FDECEA] text-danger`}>
        <AlertIcon className="h-4 w-4" />
      </span>
    );
  }
  return <span className={`${box} border-2 border-line text-xs font-bold text-muted`}>{state === "off" ? "–" : index}</span>;
}

/**
 * "Em que etapa está?": lista com ✓ no que terminou, a etapa atual em destaque,
 * quanto cada uma costuma levar e quanto falta para ficar pronto para conferir.
 */
function StudioSteps({
  pipeline,
  canEdit,
  auto,
  onAutoChange,
  auto3d,
  onAuto3dChange,
}: {
  pipeline: Pipeline;
  canEdit: boolean;
  auto: boolean;
  onAutoChange: (value: boolean) => void;
  auto3d: boolean;
  onAuto3dChange: (value: boolean) => void;
}) {
  const { steps, current, remainingSeconds } = pipeline;
  const headline = current
    ? `Agora: ${current.label}${current.detail ? ` · ${current.detail}` : ""}`
    : "Tudo pronto: fotos, textos e conferência feitos.";
  return (
    <section aria-labelledby="etapas-titulo" className="mt-4 rounded-2xl border border-line bg-cloud p-4" data-testid="etapas-estudio">
      <h3 id="etapas-titulo" className="font-bold">
        Etapas deste produto
      </h3>
      <p className="mt-1 text-sm font-semibold text-air-blue-ink">{headline}</p>
      {remainingSeconds > 0 ? (
        <p className="mt-0.5 text-sm text-muted">
          Pronto para você conferir em <strong className="tabular-nums text-ink">~{duration(remainingSeconds)}</strong>
        </p>
      ) : null}

      <ol className="mt-3 space-y-1.5">
        {steps.map((step, i) => {
          const isCurrent = step === current;
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              data-step={step.id}
              data-state={step.state}
              className={`flex items-start gap-3 rounded-xl px-2.5 py-2 ${isCurrent ? "bg-white shadow-[var(--shadow-soft)] ring-1 ring-air-blue/40" : ""}`}
            >
              <StepIcon state={step.state} index={i + 1} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                  <a href={STEP_ANCHOR[step.id]} className={step.state === "done" ? "text-muted" : "text-ink"}>
                    {step.label}
                  </a>
                  <span className="sr-only">({STATE_TEXT[step.state]})</span>
                  {step.optional ? <Badge tone="neutral">opcional</Badge> : null}
                </p>
                {step.detail ? <p className={`text-xs ${step.state === "failed" ? "text-danger" : "text-muted"}`}>{step.detail}</p> : null}
              </div>
              {step.etaSeconds && step.state !== "done" ? (
                <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted">~{duration(step.etaSeconds)}</span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {canEdit ? (
        <div className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={auto} onChange={(e) => onAutoChange(e.target.checked)} />
            <span>
              <span className="font-semibold">Seguir as etapas sozinho</span>
              <span className="block text-xs text-muted">
                Com {MIN_PHOTOS_AUTO} fotos enviadas, já pede as fotos de catálogo e o nome e a descrição. Você só confere e aprova.
              </span>
            </span>
          </label>
          <label className={`flex items-start gap-2 ${auto ? "" : "opacity-55"}`}>
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={auto3d}
              disabled={!auto}
              onChange={(e) => onAuto3dChange(e.target.checked)}
            />
            <span>
              <span className="font-semibold">Incluir o 3D no automático</span>
              <span className="block text-xs text-muted">Usa créditos do Tripo (~US$ 0,30 por modelo). Deixe desmarcado enquanto não tiver créditos.</span>
            </span>
          </label>
          <p className="text-xs text-muted">
            Pode sair da página: o que já está na fila continua sendo gerado. As próximas etapas são pedidas quando você voltar aqui.
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function AiStudio({
  productId,
  productName,
  canEdit,
  requires3d,
  hasGalleryPhoto,
  aiMedia,
  copyEnabled,
  hasCopy,
  initial,
}: {
  productId: string;
  productName: string;
  canEdit: boolean;
  requires3d: boolean;
  /** O produto já tem foto na galeria da loja (aprovada ou enviada à mão). */
  hasGalleryPhoto: boolean;
  /** Imagens de catálogo geradas por IA (aprovadas ou aguardando). */
  aiMedia: ProductMedia[];
  /** A chave da OpenAI está configurada no servidor (textos com IA). */
  copyEnabled: boolean;
  /** O produto já tem descrição (textos aplicados ou escritos à mão). */
  hasCopy: boolean;
  initial: AiStudioSnapshot;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [snapshot, setSnapshot] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [baseJobId, setBaseJobId] = useState<string | null>(null);
  const [requesting3d, setRequesting3d] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const finished = useRef(new Set(initial.jobs.filter((j) => !isPending(j)).map((j) => j.id)));
  const [copyStatus, setCopyStatus] = useState<"idle" | "writing" | "draft">("idle");
  const [auto, setAuto] = useStoredFlag("cuxoes:estudio-automatico", true);
  const [auto3d, setAuto3d] = useStoredFlag("cuxoes:estudio-3d-automatico", false);
  /** Etapas que este navegador já pediu sozinho (não pede duas vezes). */
  const autoRequested = useRef(new Set<string>());

  const cleanJobs = snapshot.jobs.filter((j) => j.kind === "background_removal");
  const modelJobs = snapshot.jobs.filter((j) => j.kind === "model_3d");
  const latestModel = modelJobs.at(-1) ?? null;
  const readyPhotos = cleanJobs.filter((j) => j.status === "succeeded" && j.hasCutout);
  const chosenBase = readyPhotos.find((j) => j.id === baseJobId) ?? readyPhotos[0] ?? null;
  const has3d = modelJobs.some((j) => j.status === "succeeded" && j.outputUrl);
  const skipCleanup = cleanupSkipped(snapshot.worker.online, snapshot.worker.capabilities);
  // Tarefas que ninguém sabe fazer agora (ex.: limpeza desligada) não prendem a tela esperando.
  const anyPending = snapshot.jobs.some(
    (j) => isPending(j) && (j.status === "running" || !snapshot.worker.online || snapshot.worker.capabilities.includes(j.kind)),
  );
  const can3d = snapshot.worker.capabilities.includes("model_3d");
  const canCatalog = snapshot.worker.capabilities.includes("catalog_photos");
  const catalogJob = snapshot.jobs.filter((j) => j.kind === "catalog_photos").at(-1) ?? null;
  const [requestingCatalog, setRequestingCatalog] = useState(false);

  async function generateCatalog() {
    setRequestingCatalog(true);
    setMessage(null);
    const result = await requestCatalogPhotosAction(productId);
    setRequestingCatalog(false);
    if (!result.ok) setMessage({ tone: "danger", text: result.error });
    await refresh();
  }

  async function refresh() {
    const result = await aiStudioSnapshotAction(productId);
    if (!result.ok) return;
    setSnapshot(result.data);
    const newlyDone = result.data.jobs.filter((j) => !isPending(j) && !finished.current.has(j.id));
    if (newlyDone.length) {
      for (const j of newlyDone) finished.current.add(j.id);
      if (newlyDone.some((j) => j.status === "succeeded")) {
        await aiResultsSeenAction();
        router.refresh();
      }
    }
  }

  // Acompanha a fila enquanto houver algo processando (ou a IA ainda não estiver pronta). Cada consulta também
  // mantém a fila andando na nuvem.
  useEffect(() => {
    if (!anyPending && snapshot.worker.online) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
    // refresh só depende do productId, estável durante a vida do componente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyPending, snapshot.worker.online, productId]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setMessage(null);
    const list = [...files];
    let failed = 0;
    for (const [i, original] of list.entries()) {
      setUploading(`Enviando foto ${i + 1} de ${list.length}…`);
      const form = new FormData();
      form.set("file", await shrinkPhoto(original));
      const result = await uploadAiPhotoAction(productId, form);
      if (!result.ok) {
        failed += 1;
        setMessage({ tone: "danger", text: `${original.name}: ${result.error}` });
      }
      await refresh();
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    if (!failed) {
      setMessage({ tone: "success", text: list.length > 1 ? `${list.length} fotos na fila de limpeza.` : "Foto na fila de limpeza." });
    }
  }

  const catalogReady = catalogJob?.status === "succeeded";

  async function generate3d() {
    if (!chosenBase && !catalogReady) return;
    setRequesting3d(true);
    setMessage(null);
    const result = await requestModel3dAction(productId, catalogReady ? null : (chosenBase?.id ?? null));
    setRequesting3d(false);
    if (!result.ok) setMessage({ tone: "danger", text: result.error });
    await refresh();
  }

  // As fotos de catálogo e os textos usam as fotos do celular como foram tiradas: começam junto com a limpeza.
  const readyCount = cleanJobs.filter((j) => j.status !== "failed").length;
  const photosReady = readyCount > 0;
  const pipeline = studioPipeline({
    jobs: snapshot.jobs,
    // O relógio só entra depois da hidratação: servidor e navegador desenham o mesmo texto.
    now: hydrated ? now : null,
    workerOnline: snapshot.worker.online,
    capabilities: snapshot.worker.capabilities,
    uploading: Boolean(uploading),
    catalogMedia: aiMedia,
    copy: { enabled: copyEnabled, hasCopy, writing: copyStatus === "writing", draftReady: copyStatus === "draft" },
    model3d: { required: requires3d, auto: auto && auto3d },
  });

  // Seguir as etapas sozinho: fotos enviadas → fotos de catálogo e textos (junto com a limpeza) → 3D, se marcado.
  // Só com a IA pronta para a etapa (nuvem ou processador), e uma vez só por etapa nesta tela.
  const autoReady = hydrated && auto && canEdit && !uploading && snapshot.worker.online;
  const wantsCatalog =
    autoReady && canCatalog && photosReady && readyCount >= MIN_PHOTOS_AUTO && !catalogJob && !aiMedia.length;
  const wants3d = autoReady && auto3d && can3d && catalogReady && !latestModel && !has3d;
  useEffect(() => {
    const next = wantsCatalog ? "catalogo" : wants3d ? "3d" : null;
    if (!next || autoRequested.current.has(next)) return;
    autoRequested.current.add(next);
    void (async () => {
      const result = next === "catalogo" ? await requestCatalogPhotosAction(productId) : await requestModel3dAction(productId, null);
      setMessage(
        result.ok
          ? { tone: "success", text: next === "catalogo" ? "Seguindo sozinho: fotos de catálogo pedidas." : "Seguindo sozinho: modelo 3D pedido." }
          : { tone: "danger", text: result.error },
      );
      await refresh();
    })();
    // refresh só depende do productId, estável durante a vida do componente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsCatalog, wants3d, productId]);

  return (
    <section aria-labelledby="estudio-titulo" className="rounded-2xl border border-line bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="estudio-titulo" className="flex items-center gap-2 text-lg font-bold">
            <SparkIcon className="h-5 w-5 text-air-blue-ink" /> Estúdio de fotos e 3D
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Envie as fotos tiradas no celular (fundo qualquer). O sistema limpa o fundo, recria as fotos de catálogo no padrão
            da loja (mesmos ângulos, fundo creme) e gera o modelo 3D.
          </p>
        </div>
        <ul aria-label="O que este produto precisa" className="flex flex-wrap gap-2 text-sm">
          <li>
            <Badge tone={hasGalleryPhoto ? "success" : "neutral"}>
              {hasGalleryPhoto ? <CheckIcon className="h-3.5 w-3.5" /> : null} Fotos · obrigatório
            </Badge>
          </li>
          <li>
            <Badge tone={has3d ? "success" : "neutral"}>
              {has3d ? <CheckIcon className="h-3.5 w-3.5" /> : null} 3D · {requires3d ? "obrigatório" : "opcional"}
            </Badge>
          </li>
        </ul>
      </div>

      <div className="mt-4 text-sm" data-testid="estado-processador">
        {snapshot.worker.cloud ? (
          <p className="text-success">
            ● IA na nuvem ligada: {KIND_ORDER.filter((k) => snapshot.worker.capabilities.includes(k)).map((k) => KIND_LABEL[k]).join(" · ")}
          </p>
        ) : snapshot.worker.online ? (
          <p className="text-success">● Processador de IA ligado no computador: {Object.values(snapshot.worker.engines).join(" · ")}</p>
        ) : (
          <p className="text-muted">○ IA ainda não configurada: as fotos ficam guardadas na fila até lá.</p>
        )}
        {snapshot.worker.missing.length ? (
          <p className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">
            Falta cadastrar na Vercel (Settings → Environment Variables):{" "}
            {snapshot.worker.missing.map((key, i) => (
              <span key={key}>
                {i ? ", " : null}
                <code>{key}</code>
              </span>
            ))}
            .
          </p>
        ) : null}
      </div>

      {!snapshot.worker.online && anyPending ? (
        <Notice tone="warning" className="mt-3" title="A IA ainda não está configurada: nada está sendo gerado agora">
          As fotos ficam guardadas na fila e começam sozinhas assim que as chaves da IA forem cadastradas na Vercel. Pode sair
          desta página: nada se perde.
        </Notice>
      ) : null}

      <StudioSteps
        pipeline={pipeline}
        canEdit={canEdit}
        auto={auto}
        onAutoChange={setAuto}
        auto3d={auto3d}
        onAuto3dChange={setAuto3d}
      />

      <div role="status" aria-live="polite" className="mt-2 min-h-6 text-sm font-medium">
        {uploading ? (
          <span className="flex items-center gap-2 text-air-blue-ink">
            <Spinner /> {uploading}
          </span>
        ) : null}
        {!uploading && message ? <span className={message.tone === "success" ? "text-success" : "text-danger"}>{message.text}</span> : null}
      </div>

      {/* 1. Fotos */}
      <h3 id="estudio-fotos" className="mt-4 scroll-mt-32 font-bold">
        1. Fotos do produto
      </h3>
      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            id="estudio-fotos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => void onFiles(e.target.files)}
            disabled={!hydrated || Boolean(uploading)}
          />
          <label
            htmlFor="estudio-fotos"
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-deep-fjord px-5 text-[0.9375rem] font-semibold text-white hover:bg-[#1d3a58] focus-within:outline-3 ${
              !hydrated || uploading ? "pointer-events-none opacity-55" : ""
            }`}
          >
            <ImageIcon className="h-5 w-5" /> Enviar fotos do celular
          </label>
          <span className="text-sm text-muted">3 a 4 fotos: frente, lateral, traseira. Objeto inteiro, boa luz.</span>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Só administradores enviam fotos para produtos publicados ou arquivados.</p>
      )}

      {cleanJobs.length ? (
        <ol className="mt-4 grid gap-4 lg:grid-cols-2" aria-label="Fotos no estúdio">
          {cleanJobs.map((job, i) => (
            <li key={job.id} className="rounded-2xl border border-line bg-cloud p-3" data-testid="foto-estudio" data-status={job.status}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Foto {i + 1}</span>
                {skipCleanup && job.status === "queued" ? <Badge tone="neutral">Enviada</Badge> : <StatusBadge job={job} />}
              </div>
              {/* Antes (retrato, como o celular tira) e depois (4:3, como a galeria) com a mesma altura. */}
              <div className="mt-2 grid grid-cols-[9fr_16fr] gap-2">
                <figure>
                  <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-pale-blue">
                    <Image src={job.inputUrl} alt={`Foto ${i + 1} enviada, com o fundo original`} fill sizes="240px" className="object-cover" />
                  </div>
                  <figcaption className="mt-1 text-xs text-muted">Antes: como foi tirada</figcaption>
                </figure>
                <figure>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-pale-blue">
                    {job.outputUrl ? (
                      <Image src={job.outputUrl} alt={`Foto ${i + 1} de ${productName} com fundo limpo`} fill sizes="320px" className="object-cover" />
                    ) : job.status === "failed" ? (
                      <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted">
                        Não foi possível limpar esta foto.
                      </div>
                    ) : skipCleanup && job.status === "queued" ? (
                      <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted">
                        Limpeza desligada. A foto já serve para as fotos de catálogo.
                      </div>
                    ) : (
                      <WorkingTile
                        active={job.status === "running"}
                        label={job.status === "running" ? "Limpando o fundo…" : snapshot.worker.online ? "Na fila" : "Esperando a IA"}
                      />
                    )}
                  </div>
                  <figcaption className="mt-1 text-xs text-muted">
                    Depois: fundo limpo (referência; a loja usa as fotos de catálogo)
                    {job.droppedBackgroundObject ? " (móvel ao fundo removido)" : ""}
                  </figcaption>
                </figure>
              </div>
              {skipCleanup && job.status === "queued" ? null : (
                <JobProgress job={job} now={now} hydrated={hydrated} workerOnline={snapshot.worker.online} />
              )}
              {job.error ? <p className="mt-2 text-sm text-danger">{job.error}</p> : null}
              {canEdit ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  {job.status === "succeeded" && job.hasCutout ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="base-3d"
                        className="h-4 w-4"
                        checked={chosenBase?.id === job.id}
                        onChange={() => setBaseJobId(job.id)}
                      />
                      Usar esta foto no 3D
                    </label>
                  ) : (
                    <span />
                  )}
                  {job.status !== "running" ? (
                    <ConfirmButton
                      label="Descartar"
                      triggerVariant="ghost"
                      title={`Descartar a foto ${i + 1}?`}
                      description="Remove a foto enviada e a versão com fundo limpo. As fotos de catálogo já geradas continuam."
                      confirmLabel="Descartar"
                      onConfirm={async () => {
                        const r = await discardAiJobAction(job.id);
                        if (!r.ok) setMessage({ tone: "danger", text: r.error });
                        await refresh();
                        router.refresh();
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {/* 2. Fotos de catálogo */}
      <h3 id="estudio-catalogo" className="mt-6 flex scroll-mt-32 items-center gap-2 font-bold">
        <SparkIcon className="h-5 w-5 text-air-blue-ink" /> 2. Fotos de catálogo (padrão da loja)
      </h3>
      <p className="mt-1 max-w-prose text-sm text-muted">
        A IA recria a cena com os mesmos ângulos (frente, ¾, lateral e traseira), luz e fundo para todos os produtos, usando as
        fotos reais como referência. O produto não muda. Nada vai para a loja sem alguém conferir com as fotos reais e aprovar.
      </p>
      {!canCatalog && snapshot.worker.online ? (
        <div className="mt-2">
          <Notice tone="warning" title="Gerador de fotos de catálogo ainda não ligado">
            Falta a chave da OpenAI (<code>OPENAI_API_KEY</code>) na Vercel. Enquanto isso, as fotos limpas acima ficam como
            referência.
          </Notice>
        </div>
      ) : null}
      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={generateCatalog}
            loading={requestingCatalog}
            loadingLabel="Pedindo…"
            disabled={!hydrated || !readyCount || (snapshot.worker.online && !canCatalog) || Boolean(catalogJob && isPending(catalogJob))}
          >
            <SparkIcon className="h-5 w-5" /> {aiMedia.length ? "Gerar fotos de catálogo de novo" : "Gerar fotos de catálogo"}
          </Button>
          {catalogJob && !isPending(catalogJob) ? <StatusBadge job={catalogJob} /> : null}
        </div>
      ) : null}
      {catalogJob && isPending(catalogJob) ? (
        <div className="mt-4 rounded-2xl border border-line bg-cloud p-3" data-testid="fotos-catalogo-gerando">
          <ol className="grid grid-cols-2 gap-2" aria-label="Fotos de catálogo sendo criadas">
            {["Frente", "Três-quartos", "Lateral", "Traseira"].map((view) => (
              <li key={view} className="aspect-[4/3] overflow-hidden rounded-xl bg-pale-blue">
                <WorkingTile active={catalogJob.status === "running"} label={view} />
              </li>
            ))}
          </ol>
          <JobProgress job={catalogJob} now={now} hydrated={hydrated} workerOnline={snapshot.worker.online} />
        </div>
      ) : null}
      {catalogJob?.error ? <p className="mt-2 text-sm text-danger">{catalogJob.error}</p> : null}
      {aiMedia.length ? (
        <CatalogReview
          media={aiMedia}
          references={cleanJobs.map((j) => j.inputUrl)}
          canEdit={canEdit}
          onChange={(text, ok) => {
            setMessage({ tone: ok ? "success" : "danger", text });
            router.refresh();
          }}
        />
      ) : null}

      {/* 3. 3D */}
      <h3 id="estudio-3d" className="mt-6 flex scroll-mt-32 items-center gap-2 font-bold">
        <CubeIcon className="h-5 w-5 text-air-blue-ink" /> 3. Modelo 3D {requires3d ? null : <Badge tone="neutral">opcional</Badge>}
      </h3>
      {!can3d && snapshot.worker.online ? (
        <div className="mt-2">
          <Notice tone="warning" title="Gerador 3D ainda não ligado">
            Falta a chave do Tripo (<code>TRIPO_API_KEY</code>) na Vercel. Enquanto isso, dá para enviar um arquivo .glb na
            seção de mídia abaixo.
          </Notice>
        </div>
      ) : null}
      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={generate3d}
            loading={requesting3d}
            loadingLabel="Pedindo…"
            disabled={
              !hydrated || (!chosenBase && !catalogReady) || (snapshot.worker.online && !can3d) || Boolean(latestModel && isPending(latestModel))
            }
          >
            <CubeIcon className="h-5 w-5" /> {has3d ? "Gerar o 3D de novo" : "Gerar modelo 3D"}
          </Button>
          <span className="text-sm text-muted">
            {catalogReady
              ? "Base: as fotos de catálogo (frente, lado e costas). Leva de 2 a 3 minutos."
              : chosenBase
                ? `Base: foto ${cleanJobs.indexOf(chosenBase) + 1}. Leva de 2 a 3 minutos.`
                : skipCleanup
                  ? "Primeiro gere as fotos de catálogo."
                  : "Primeiro envie e limpe pelo menos uma foto."}
          </span>
        </div>
      ) : null}
      {latestModel ? (
        <div className="mt-4 rounded-2xl border border-line bg-cloud p-3" data-testid="modelo-3d" data-status={latestModel.status}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Modelo 3D</span>
            <StatusBadge job={latestModel} />
          </div>
          {isPending(latestModel) ? (
            <div className="mt-2 aspect-[4/3] overflow-hidden rounded-xl bg-pale-blue">
              <div
                className={`flex h-full flex-col items-center justify-center gap-3 text-sm font-semibold ${
                  latestModel.status === "running"
                    ? "bg-[linear-gradient(110deg,var(--color-pale-blue)_35%,var(--color-white)_50%,var(--color-pale-blue)_65%)] bg-[length:200%_100%] text-air-blue-ink motion-safe:animate-brilho"
                    : "text-muted"
                }`}
              >
                <CubeIcon className={`h-12 w-12 ${latestModel.status === "running" ? "motion-safe:animate-girar-devagar" : ""}`} />
                {latestModel.status === "running" ? "Montando o 3D a partir das fotos…" : "Na fila"}
              </div>
            </div>
          ) : null}
          <JobProgress job={latestModel} now={now} hydrated={hydrated} workerOnline={snapshot.worker.online} />
          {latestModel.error ? <p className="mt-2 text-sm text-danger">{latestModel.error}</p> : null}
          {latestModel.status === "succeeded" && latestModel.outputUrl ? (
            <ModelPreview src={latestModel.outputUrl} alt={`Modelo 3D de ${productName}`} />
          ) : null}
          {latestModel.status === "succeeded" ? (
            <p className="mt-2 text-xs text-muted">
              Gerado por IA a partir das fotos: confira proporções, cores e peças. Fica marcado como ilustrativo até alguém
              revisar (desmarque na seção de mídia).
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 4. Textos */}
      <h3 id="estudio-textos" className="mt-6 flex scroll-mt-32 items-center gap-2 font-bold">
        <SparkIcon className="h-5 w-5 text-air-blue-ink" /> 4. Nome e textos da loja (IA)
      </h3>
      <CopyAssistant
        productId={productId}
        enabled={copyEnabled && canEdit && hydrated}
        hasPhotos={readyCount > 0 || aiMedia.some((m) => !m.pendingReview)}
        autoStart={hydrated && auto && canEdit && photosReady && !hasCopy}
        onStatus={setCopyStatus}
        onApplied={(text) => {
          setMessage({ tone: "success", text });
          router.refresh();
        }}
      />
    </section>
  );
}

function CopyAssistant({
  productId,
  enabled,
  hasPhotos,
  autoStart,
  onStatus,
  onApplied,
}: {
  productId: string;
  enabled: boolean;
  hasPhotos: boolean;
  /** Seguir as etapas sozinho: pede a sugestão assim que as fotos chegarem. */
  autoStart: boolean;
  onStatus: (status: "idle" | "writing" | "draft") => void;
  onApplied: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<(CopySuggestion & { name: string | null }) | null>(null);
  const autoTried = useRef(false);

  async function suggest() {
    setBusy(true);
    setError(null);
    onStatus("writing");
    const r = await suggestCopyAction(productId);
    setBusy(false);
    if (!r.ok) {
      onStatus("idle");
      return setError(r.error);
    }
    setDraft({ ...r.data, name: null });
    onStatus("draft");
  }

  // Uma tentativa automática por tela; se falhar, o botão continua para tentar de novo.
  useEffect(() => {
    if (!autoStart || autoTried.current || draft || busy || !enabled || !hasPhotos) return;
    const timer = setTimeout(() => {
      autoTried.current = true;
      void suggest();
    }, 0);
    return () => clearTimeout(timer);
  });

  async function apply() {
    if (!draft) return;
    setBusy(true);
    const r = await applyCopyAction(productId, {
      name: draft.name,
      shortDescription: draft.shortDescription,
      description: draft.description,
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDraft(null);
    onStatus("idle");
    onApplied("Textos aplicados ao produto. Revise no formulário abaixo antes de publicar.");
  }

  const field = (key: "shortDescription" | "description" | "seoTitle" | "seoDescription", label: string, rows: number, max: number) => (
    <div>
      <Label htmlFor={`copy-${key}`}>{label}</Label>
      <textarea
        id={`copy-${key}`}
        rows={rows}
        maxLength={max}
        value={draft?.[key] ?? ""}
        onChange={(e) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d))}
        className={controlClasses}
      />
    </div>
  );

  return (
    <div className="mt-2">
      <p className="max-w-prose text-sm text-muted">
        O ChatGPT olha as fotos e os dados confirmados e sugere nome, descrições e textos para o Google. Não inventa medidas,
        materiais nem garantia: o que não foi confirmado ele descreve só pela aparência. Você revisa antes de aplicar.
      </p>
      {!enabled && hasPhotos ? <p className="mt-2 text-sm text-muted">Disponível quando a chave da OpenAI estiver configurada.</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={suggest} loading={busy && !draft} loadingLabel="Escrevendo…" disabled={!enabled || !hasPhotos || busy}>
          <SparkIcon className="h-5 w-5" /> {draft ? "Sugerir de novo" : "Sugerir textos com IA"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-danger" role="alert">{error}</p> : null}
      {busy && !draft ? (
        <div className="mt-4 space-y-2.5 rounded-2xl border border-line bg-cloud p-4" data-testid="textos-escrevendo">
          <p className="flex items-center gap-2 text-xs font-semibold text-air-blue-ink">
            <Spinner className="h-3.5 w-3.5" /> O ChatGPT está olhando as fotos e escrevendo… costuma levar ~8 s
          </p>
          {["w-2/3", "w-full", "w-11/12", "w-1/2"].map((width) => (
            <div
              key={width}
              className={`h-3 ${width} rounded-full bg-[linear-gradient(110deg,var(--color-pale-blue)_35%,var(--color-white)_50%,var(--color-pale-blue)_65%)] bg-[length:200%_100%] motion-safe:animate-brilho`}
            />
          ))}
        </div>
      ) : null}
      {draft ? (
        <div className="mt-4 space-y-4 rounded-2xl border border-line bg-cloud p-4" data-testid="sugestao-textos">
          <fieldset>
            <legend className="text-sm font-semibold">Nome (opcional)</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[null, ...draft.nameSuggestions].map((name) => (
                <label key={name ?? "manter"} className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-sm">
                  <input type="radio" name="copy-name" checked={draft.name === name} onChange={() => setDraft((d) => (d ? { ...d, name } : d))} />
                  {name ?? "Manter o nome atual"}
                </label>
              ))}
            </div>
          </fieldset>
          {field("shortDescription", "Descrição curta", 2, 240)}
          {field("description", "Descrição completa", 7, 1500)}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("seoTitle", "Título para o Google", 2, 70)}
            {field("seoDescription", "Descrição para o Google", 3, 170)}
          </div>
          {draft.unconfirmedNumbers.length ? (
            <Notice tone="warning" title="Confira os números">
              O texto cita {draft.unconfirmedNumbers.join(", ")}, que não está nos dados confirmados. Corrija ou remova antes de aplicar.
            </Notice>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={apply} loading={busy} loadingLabel="Aplicando…">
              Aplicar ao produto
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(null);
                onStatus("idle");
              }}
            >
              Descartar sugestão
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CatalogReview({
  media,
  references,
  canEdit,
  onChange,
}: {
  media: ProductMedia[];
  references: string[];
  canEdit: boolean;
  onChange: (message: string, ok: boolean) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">Fotos reais (referência para conferir)</p>
        <ul className="mt-2 flex gap-2 overflow-x-auto">
          {references.map((url, i) => (
            <li key={url} className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-pale-blue">
              <Image src={url} alt={`Foto real ${i + 1}`} fill sizes="80px" className="object-cover" />
            </li>
          ))}
        </ul>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2" aria-label="Fotos de catálogo geradas">
        {media.map((m) => (
          <li key={m.id} className="rounded-2xl border border-line bg-cloud p-3" data-testid="foto-catalogo" data-pending={m.pendingReview}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-white">
              <Image src={m.url} alt={m.altText} fill sizes="(min-width: 640px) 320px, 100vw" className="object-cover" />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              {m.pendingReview ? <Badge tone="warm">Aguardando conferência</Badge> : <Badge tone="success">Aprovada · na loja</Badge>}
              {canEdit ? (
                <div className="flex gap-1">
                  {m.pendingReview ? (
                    <ConfirmButton
                      label="Aprovar"
                      variant="primary"
                      triggerVariant="soft"
                      title="Aprovar esta imagem para a loja?"
                      description="Compare com as fotos reais. A imagem só pode ir para a loja se mostrar exatamente o mesmo produto."
                      requireCheck="Conferi com as fotos reais: cor, formato, peças e acabamento são iguais."
                      confirmLabel="Aprovar"
                      onConfirm={async () => {
                        const r = await approveAiMediaAction(m.id);
                        onChange(r.ok ? "Imagem aprovada: já pode aparecer na loja." : r.error, r.ok);
                      }}
                    />
                  ) : null}
                  <ConfirmButton
                    label="Descartar"
                    triggerVariant="ghost"
                    title="Descartar esta imagem?"
                    description="A imagem gerada é removida. As fotos reais continuam guardadas."
                    confirmLabel="Descartar"
                    onConfirm={async () => {
                      const r = await deleteMediaAction(m.id);
                      onChange(r.ok ? "Imagem descartada." : r.error, r.ok);
                    }}
                  />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ModelPreview({ src, alt }: { src: string; alt: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    import("@google/model-viewer").then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="relative mt-2 aspect-[4/3] overflow-hidden rounded-xl bg-pale-blue">
      {ready ? (
        <model-viewer
          src={src}
          alt={alt}
          camera-controls
          auto-rotate
          shadow-intensity="1"
          exposure="1.05"
          interaction-prompt="none"
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted">Carregando visualizador 3D…</div>
      )}
    </div>
  );
}

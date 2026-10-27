"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  aiResultsSeenAction,
  aiStudioSnapshotAction,
  discardAiJobAction,
  requestModel3dAction,
  uploadAiPhotoAction,
} from "@/lib/admin/actions/ai";
import { isPending, type AiJobView, type AiStudioSnapshot } from "@/lib/admin/ai-types";
import { useHydrated } from "@/lib/use-hydrated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckIcon, CubeIcon, ImageIcon, SparkIcon } from "@/components/ui/icons";
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

function elapsed(job: AiJobView, now: number) {
  const start = job.startedAt ?? job.createdAt;
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : now;
  return Math.max(0, Math.round((end - new Date(start).getTime()) / 1000));
}

function StatusBadge({ job, now }: { job: AiJobView; now: number }) {
  if (job.status === "queued") return <Badge tone="neutral">Na fila</Badge>;
  if (job.status === "running") {
    return (
      <Badge tone="info">
        {job.kind === "model_3d" ? "Gerando 3D" : "Limpando o fundo"}… {elapsed(job, now)} s
      </Badge>
    );
  }
  if (job.status === "failed") return <Badge tone="danger">Falhou</Badge>;
  return (
    <Badge tone="success">
      <CheckIcon className="h-3.5 w-3.5" /> Pronto em {elapsed(job, now)} s
    </Badge>
  );
}

export function AiStudio({
  productId,
  productName,
  canEdit,
  requires3d,
  hasVideo,
  initial,
}: {
  productId: string;
  productName: string;
  canEdit: boolean;
  requires3d: boolean;
  hasVideo: boolean;
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

  const cleanJobs = snapshot.jobs.filter((j) => j.kind === "background_removal");
  const modelJobs = snapshot.jobs.filter((j) => j.kind === "model_3d");
  const latestModel = modelJobs.at(-1) ?? null;
  const readyPhotos = cleanJobs.filter((j) => j.status === "succeeded" && j.hasCutout);
  const chosenBase = readyPhotos.find((j) => j.id === baseJobId) ?? readyPhotos[0] ?? null;
  const has3d = modelJobs.some((j) => j.status === "succeeded" && j.outputUrl);
  const anyPending = snapshot.jobs.some(isPending);
  const can3d = snapshot.worker.capabilities.includes("model_3d");

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

  // Acompanha a fila enquanto houver algo processando (ou o processador estiver desligado).
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

  async function generate3d() {
    if (!chosenBase) return;
    setRequesting3d(true);
    setMessage(null);
    const result = await requestModel3dAction(productId, chosenBase.id);
    setRequesting3d(false);
    if (!result.ok) setMessage({ tone: "danger", text: result.error });
    await refresh();
  }

  return (
    <section aria-labelledby="estudio-titulo" className="rounded-[1.25rem] border border-line bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="estudio-titulo" className="flex items-center gap-2 text-lg font-bold">
            <SparkIcon className="h-5 w-5 text-air-blue-ink" /> Estúdio de fotos e 3D
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Envie as fotos tiradas no celular (fundo qualquer). O sistema limpa o fundo, deixa no padrão da loja e gera o
            modelo 3D a partir de uma delas.
          </p>
        </div>
        <ul aria-label="O que este produto precisa" className="flex flex-wrap gap-2 text-sm">
          <li>
            <Badge tone={readyPhotos.length ? "success" : "neutral"}>
              {readyPhotos.length ? <CheckIcon className="h-3.5 w-3.5" /> : null} Fotos · obrigatório
            </Badge>
          </li>
          <li>
            <Badge tone={has3d ? "success" : "neutral"}>
              {has3d ? <CheckIcon className="h-3.5 w-3.5" /> : null} 3D · {requires3d ? "obrigatório" : "recomendado"}
            </Badge>
          </li>
          <li>
            <Badge tone={hasVideo ? "success" : "neutral"}>
              {hasVideo ? <CheckIcon className="h-3.5 w-3.5" /> : null} Vídeo · opcional
            </Badge>
          </li>
        </ul>
      </div>

      <p className="mt-4 text-sm" data-testid="estado-processador">
        {snapshot.worker.online ? (
          <span className="text-success">
            ● Processador de IA ligado: {Object.values(snapshot.worker.engines).join(" · ")}
          </span>
        ) : (
          <span className="text-muted">
            ○ Processador de IA desligado. As fotos ficam na fila até ele ser ligado (<code>npm run ai:worker</code>).
          </span>
        )}
      </p>

      <div role="status" aria-live="polite" className="mt-2 min-h-6 text-sm font-medium">
        {uploading ? <span className="text-air-blue-ink">{uploading}</span> : null}
        {!uploading && message ? <span className={message.tone === "success" ? "text-success" : "text-danger"}>{message.text}</span> : null}
      </div>

      {/* 1. Fotos */}
      <h3 className="mt-4 font-bold">1. Fotos do produto</h3>
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
                <StatusBadge job={job} now={now} />
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
                    ) : (
                      <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted">
                        {job.status === "failed" ? "Não foi possível limpar esta foto." : "A foto limpa aparece aqui."}
                      </div>
                    )}
                  </div>
                  <figcaption className="mt-1 text-xs text-muted">
                    Depois: fundo limpo
                    {job.droppedBackgroundObject ? " (móvel ao fundo removido)" : ""}
                  </figcaption>
                </figure>
              </div>
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
                      description="Remove a foto enviada e a versão com fundo limpo (inclusive da galeria do produto)."
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

      {/* 2. 3D */}
      <h3 className="mt-6 flex items-center gap-2 font-bold">
        <CubeIcon className="h-5 w-5 text-air-blue-ink" /> 2. Modelo 3D
      </h3>
      {!can3d && snapshot.worker.online ? (
        <div className="mt-2">
          <Notice tone="warning" title="Gerador 3D não habilitado neste processador">
            A limpeza de fundo está funcionando. Para gerar o 3D aqui, habilite o motor 3D (veja docs/ESTUDIO-IA.md) ou envie
            um arquivo .glb na seção de mídia abaixo.
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
            disabled={!hydrated || !chosenBase || (snapshot.worker.online && !can3d) || Boolean(latestModel && isPending(latestModel))}
          >
            <CubeIcon className="h-5 w-5" /> {has3d ? "Gerar o 3D de novo" : "Gerar modelo 3D"}
          </Button>
          <span className="text-sm text-muted">
            {chosenBase
              ? `Base: foto ${cleanJobs.indexOf(chosenBase) + 1}. Leva de 1 a 3 minutos.`
              : "Primeiro envie e limpe pelo menos uma foto."}
          </span>
        </div>
      ) : null}
      {latestModel ? (
        <div className="mt-4 rounded-2xl border border-line bg-cloud p-3" data-testid="modelo-3d" data-status={latestModel.status}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Modelo 3D</span>
            <StatusBadge job={latestModel} now={now} />
          </div>
          {latestModel.error ? <p className="mt-2 text-sm text-danger">{latestModel.error}</p> : null}
          {latestModel.status === "succeeded" && latestModel.outputUrl ? (
            <ModelPreview src={latestModel.outputUrl} alt={`Modelo 3D de ${productName}`} />
          ) : null}
          {latestModel.status === "succeeded" ? (
            <p className="mt-2 text-xs text-muted">
              Gerado por IA a partir de uma foto: confira proporções e cores. Fica marcado como ilustrativo até alguém revisar
              (desmarque na seção de mídia).
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 3. Vídeo */}
      <h3 className="mt-6 font-bold">3. Vídeo (opcional)</h3>
      <p className="mt-1 text-sm text-muted">
        {hasVideo ? "Vídeo enviado. " : ""}Envie um vídeo curto do produto (MP4 ou WebM, até 4 MB) na seção “Fotos, vídeos e 3D”.
      </p>
    </section>
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

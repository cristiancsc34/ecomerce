import type { CopyDraft } from "@/lib/ai/copy-draft";

export type AiJobKind = "background_removal" | "catalog_photos" | "model_3d";
export type AiJobStatus = "queued" | "running" | "succeeded" | "failed";

export type AiJobView = {
  id: string;
  kind: AiJobKind;
  status: AiJobStatus;
  /** Limpeza: a foto enviada. 3D: o recorte usado como base. */
  inputUrl: string;
  /** Mídia gerada (foto limpa ou .glb), quando pronta. */
  outputUrl: string | null;
  outputMediaId: string | null;
  sourceMediaId: string | null;
  /** Limpeza concluída com recorte: pode virar base do 3D. */
  hasCutout: boolean;
  engine: string | null;
  error: string | null;
  seconds: number | null;
  /** O motor tirou um móvel que estava atrás do produto. */
  droppedBackgroundObject: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type AiStudioSnapshot = {
  jobs: AiJobView[];
  /** Nome e descrição que a IA já escreveu a partir das fotos (guardado; não gasta de novo). */
  copyDraft: CopyDraft | null;
  worker: {
    /** Alguém sabe processar: a IA na nuvem (chaves na Vercel) ou um processador local ligado. */
    online: boolean;
    /** A IA na nuvem está configurada (sem computador ligado). */
    cloud: boolean;
    capabilities: string[];
    engines: Record<string, string>;
    /** Chaves da IA na nuvem que faltam cadastrar na Vercel (só os nomes). */
    missing: string[];
  };
};

export const isPending = (job: Pick<AiJobView, "status">) => job.status === "queued" || job.status === "running";

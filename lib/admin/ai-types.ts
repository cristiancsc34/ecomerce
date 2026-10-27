export type AiJobKind = "background_removal" | "model_3d";
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
  worker: { online: boolean; capabilities: string[]; engines: Record<string, string> };
};

export const isPending = (job: Pick<AiJobView, "status">) => job.status === "queued" || job.status === "running";

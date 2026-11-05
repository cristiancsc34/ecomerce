import type { CopyDraft } from "@/lib/ai/copy-draft";

export type AiJobKind = "background_removal" | "catalog_photos" | "model_3d" | "color_variant";
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
  /** 3D: resultado da conferência de tamanho real (arquivo do iPhone). */
  ar: { status: "ok" | "sem-medidas" | "fora-da-escala" | "invalido"; message: string } | null;
  /** Cores: a cor pedida e, quando pronta, cada foto gerada com a cor medida nela. */
  color: ColorJobView | null;
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

export type ColorPhotoView = {
  mediaId: string;
  /** Foto de catálogo de onde veio (o "antes"). */
  sourceMediaId: string;
  view: string | null;
  /** Cor medida no tecido da foto gerada e na original (aviso; null se quase nada mudou). */
  colorHex: string | null;
  originalHex: string | null;
  colorDeltaE: number | null;
  warnings: string[];
};

export type ColorJobView = {
  name: string;
  hex: string;
  sourceMediaIds: string[];
  photos: ColorPhotoView[];
};

export const isPending = (job: Pick<AiJobView, "status">) => job.status === "queued" || job.status === "running";

import "server-only";
import { parseCopyDraft } from "@/lib/ai/copy-draft";
import { cloudAiConfig } from "@/lib/ai-cloud/config";
import { requireStaffAction } from "@/lib/auth/staff";
import { mediaPublicUrl } from "@/lib/catalog/mappers";
import { isUuid } from "@/lib/catalog/slug";
import { createSessionClient } from "@/lib/supabase/server";
import type { AiJobView, AiStudioSnapshot, ColorJobView, ColorPhotoView } from "./ai-types";
import { selectWithColorsFallback } from "./colors";

/** Um processador é considerado ligado se deu sinal de vida há pouco. */
const WORKER_ONLINE_MS = 30_000;

type JobRow = {
  id: string;
  kind: AiJobView["kind"];
  status: AiJobView["status"];
  input_path: string;
  cutout_path: string | null;
  output_media_id: string | null;
  source_media_id: string | null;
  engine: string | null;
  error: string | null;
  details: Record<string, unknown> | null;
  params: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  output: { storage_path: string } | null;
};

const AR_STATUSES = ["ok", "sem-medidas", "fora-da-escala", "invalido"] as const;
function parseArDetails(value: unknown): AiJobView["ar"] {
  if (!value || typeof value !== "object") return null;
  const v = value as { status?: unknown; message?: unknown };
  return (AR_STATUSES as readonly unknown[]).includes(v.status) && typeof v.message === "string"
    ? { status: v.status as (typeof AR_STATUSES)[number], message: v.message }
    : null;
}

const str = (v: unknown) => (typeof v === "string" ? v : null);
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Cores: o pedido (params) e, quando pronto, o relatório por foto (details.photos). */
function parseColorJob(j: JobRow): ColorJobView | null {
  if (j.kind !== "color_variant") return null;
  const name = str(j.params?.colorName);
  const hex = str(j.params?.colorHex);
  if (!name || !hex) return null;
  const photos = (Array.isArray(j.details?.photos) ? j.details.photos : []).flatMap((p): ColorPhotoView[] => {
    if (!p || typeof p !== "object") return [];
    const v = p as Record<string, unknown>;
    const mediaId = str(v.mediaId);
    const sourceMediaId = str(v.sourceMediaId);
    if (!mediaId || !sourceMediaId) return [];
    return [
      {
        mediaId,
        sourceMediaId,
        view: str(v.view),
        colorHex: str(v.colorHex),
        originalHex: str(v.originalHex),
        colorDeltaE: typeof v.colorDeltaE === "number" ? v.colorDeltaE : null,
        warnings: strList(v.warnings),
      },
    ];
  });
  return { name, hex: hex.toUpperCase(), sourceMediaIds: strList(j.params?.sourceMediaIds), photos };
}

/** Quem processa: a IA na nuvem (pelas chaves cadastradas) e/ou processadores locais ligados. */
function workerStatus(local: { capabilities: string[]; engines: Record<string, string> }[]): AiStudioSnapshot["worker"] {
  const cloud = cloudAiConfig();
  const cloudKinds = Object.keys(cloud.engines);
  return {
    online: local.length > 0 || cloudKinds.length > 0,
    cloud: cloudKinds.length > 0,
    capabilities: [...new Set([...cloudKinds, ...local.flatMap((w) => w.capabilities)])],
    engines: Object.assign({}, ...local.map((w) => w.engines), cloud.engines),
    missing: cloud.missing,
  };
}

export async function getAiStudioSnapshot(productId: string): Promise<AiStudioSnapshot> {
  await requireStaffAction("editor", "itens");
  if (!isUuid(productId)) return { jobs: [], colorsReady: true, copyDraft: null, worker: workerStatus([]) };
  const supabase = await createSessionClient();
  const columns =
    "id,kind,status,input_path,cutout_path,output_media_id,source_media_id,engine,error,details,params,created_at,started_at,finished_at," +
    "output:product_media!ai_jobs_output_media_id_fkey(storage_path)";
  const [
    {
      result: { data: jobs },
      legacy,
    },
    { data: workers },
  ] = await Promise.all([
    // Sem a migração das Cores, ai_jobs.params não existe: lê sem ela.
    selectWithColorsFallback(
      (cols) => supabase.from("ai_jobs").select(cols).eq("product_id", productId).order("created_at"),
      columns,
      columns.replace(",params", ""),
    ),
    supabase.from("ai_workers").select("capabilities,engines,last_seen_at"),
  ]);

  const now = Date.now();
  const online = ((workers ?? []) as { capabilities: string[]; engines: Record<string, string>; last_seen_at: string }[]).filter(
    (w) => now - new Date(w.last_seen_at).getTime() < WORKER_ONLINE_MS,
  );

  const rows = (jobs ?? []) as unknown as JobRow[];
  const worker = workerStatus(online);
  if (legacy) worker.capabilities = worker.capabilities.filter((k) => k !== "color_variant");
  return {
    colorsReady: !legacy,
    copyDraft: rows.map((j) => parseCopyDraft(j.details)).filter(Boolean).at(-1) ?? null,
    jobs: rows.map((j) => ({
      id: j.id,
      kind: j.kind,
      status: j.status,
      inputUrl: mediaPublicUrl(j.input_path),
      // Foto do celular limpa: guardada à parte (não vai para a galeria). Demais: a mídia gerada.
      outputUrl: j.output
        ? mediaPublicUrl(j.output.storage_path)
        : typeof j.details?.studioPath === "string"
          ? mediaPublicUrl(j.details.studioPath)
          : null,
      outputMediaId: j.output_media_id,
      sourceMediaId: j.source_media_id,
      hasCutout: Boolean(j.cutout_path),
      engine: j.engine,
      error: j.error,
      seconds: typeof j.details?.seconds === "number" ? j.details.seconds : null,
      droppedBackgroundObject: j.details?.droppedBackgroundObject === true,
      ar: parseArDetails(j.details?.ar),
      color: parseColorJob(j),
      createdAt: j.created_at,
      startedAt: j.started_at,
      finishedAt: j.finished_at,
    })),
    worker,
  };
}

/** A IA de fotos/3D está pronta para trabalhar? (para o aviso no Início). */
export async function getAiWorkerOnline(): Promise<boolean> {
  await requireStaffAction();
  if (Object.keys(cloudAiConfig().engines).length) return true;
  const supabase = await createSessionClient();
  const { data } = await supabase.from("ai_workers").select("last_seen_at");
  const now = Date.now();
  return ((data ?? []) as { last_seen_at: string }[]).some((w) => now - new Date(w.last_seen_at).getTime() < WORKER_ONLINE_MS);
}

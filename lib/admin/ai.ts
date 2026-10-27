import "server-only";
import { requireStaffAction } from "@/lib/auth/staff";
import { mediaPublicUrl } from "@/lib/catalog/mappers";
import { isUuid } from "@/lib/catalog/slug";
import { createSessionClient } from "@/lib/supabase/server";
import type { AiJobView, AiStudioSnapshot } from "./ai-types";

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
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  output: { storage_path: string } | null;
};

export async function getAiStudioSnapshot(productId: string): Promise<AiStudioSnapshot> {
  await requireStaffAction();
  if (!isUuid(productId)) return { jobs: [], worker: { online: false, capabilities: [], engines: {} } };
  const supabase = await createSessionClient();
  const [{ data: jobs }, { data: workers }] = await Promise.all([
    supabase
      .from("ai_jobs")
      .select(
        "id,kind,status,input_path,cutout_path,output_media_id,source_media_id,engine,error,details,created_at,started_at,finished_at," +
          "output:product_media!ai_jobs_output_media_id_fkey(storage_path)",
      )
      .eq("product_id", productId)
      .order("created_at"),
    supabase.from("ai_workers").select("capabilities,engines,last_seen_at"),
  ]);

  const now = Date.now();
  const online = ((workers ?? []) as { capabilities: string[]; engines: Record<string, string>; last_seen_at: string }[]).filter(
    (w) => now - new Date(w.last_seen_at).getTime() < WORKER_ONLINE_MS,
  );

  return {
    jobs: ((jobs ?? []) as unknown as JobRow[]).map((j) => ({
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
      createdAt: j.created_at,
      startedAt: j.started_at,
      finishedAt: j.finished_at,
    })),
    worker: {
      online: online.length > 0,
      capabilities: [...new Set(online.flatMap((w) => w.capabilities))],
      engines: Object.assign({}, ...online.map((w) => w.engines)),
    },
  };
}

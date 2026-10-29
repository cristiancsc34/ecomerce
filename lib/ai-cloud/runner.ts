import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import type { AiJobKind } from "@/lib/admin/ai-types";
import { createServiceClient } from "@/lib/supabase/service";
import { falBackgroundEngine } from "@/scripts/ai-background.mjs";
import { DEFAULT_IMAGE_MODEL, DEFAULT_TRIPO_MODEL, openaiCatalogEngine, processJob, tripoEngine } from "@/scripts/ai-pipeline.mjs";
import { CLOUD_STALE_MINUTES, cloudAiConfig } from "./config";

/**
 * IA na nuvem: a própria função da Vercel que respondeu ao painel continua
 * viva (after) e processa a fila com os mesmos motores do processador local.
 * A página do produto libera até 300 s (maxDuration); a fila para antes disso.
 */
const BUDGET_MS = 255_000;

/** Só pega uma tarefa se ainda sobra este tempo (o pior caso razoável de cada etapa). */
const NEEDS_MS: Record<AiJobKind, number> = { background_removal: 45_000, catalog_photos: 170_000, model_3d: 190_000 };

const TIMEOUT_MESSAGE = "Passou do tempo limite da IA na nuvem (5 min) e foi interrompida. Tente de novo.";
const INTERRUPTED_MESSAGE = "A tarefa foi interrompida no meio. Tente de novo.";
const LOCAL_WORKER_ONLINE_MS = 30_000;

type ClaimedJob = { id: string; kind: AiJobKind; product_id: string; input_path: string };
export type CloudRun = { id: string; kind: AiJobKind; status: "succeeded" | "failed" | "timeout" };

function enginesFor(msLeft: number, env = process.env) {
  return {
    ...falBackgroundEngine(env.FAL_KEY),
    ...openaiCatalogEngine(env.OPENAI_API_KEY, env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL),
    // O 3D desiste sozinho antes de a função acabar, e registra o motivo.
    ...tripoEngine(env.TRIPO_API_KEY, env.TRIPO_MODEL || DEFAULT_TRIPO_MODEL, undefined, Math.max(60_000, msLeft - 15_000)),
  };
}

/** Marca a tarefa como falha se ela passar do prazo (antes de a Vercel encerrar a função). */
function deadline(supabase: SupabaseClient, jobId: string, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<"timeout">((resolve) => {
    timer = setTimeout(async () => {
      await supabase
        .from("ai_jobs")
        .update({ status: "failed", error: TIMEOUT_MESSAGE, finished_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("status", "running");
      resolve("timeout");
    }, ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

/**
 * Tarefas que ficaram "processando" (a função caiu no meio) viram falha com
 * aviso, em vez de voltar para a fila: repetir sozinho gastaria créditos de
 * novo. Com um processador local ligado, ele cuida das tarefas dele.
 */
async function failInterrupted(supabase: SupabaseClient) {
  const { data: workers } = await supabase.from("ai_workers").select("last_seen_at");
  const now = Date.now();
  if (((workers ?? []) as { last_seen_at: string }[]).some((w) => now - Date.parse(w.last_seen_at) < LOCAL_WORKER_ONLINE_MS)) return;
  await supabase
    .from("ai_jobs")
    .update({ status: "failed", error: INTERRUPTED_MESSAGE, finished_at: new Date().toISOString() })
    .eq("status", "running")
    .lt("started_at", new Date(now - CLOUD_STALE_MINUTES * 60_000).toISOString());
}

/** Processa a fila enquanto houver tempo. Nunca lança: os erros ficam registrados em cada tarefa. */
export async function runCloudQueue(budgetMs = BUDGET_MS): Promise<CloudRun[]> {
  const config = cloudAiConfig();
  const kinds = Object.keys(config.engines) as AiJobKind[];
  const supabase = kinds.length ? createServiceClient() : null;
  if (!supabase) return [];
  const started = Date.now();
  const done: CloudRun[] = [];
  try {
    await failInterrupted(supabase);
    for (;;) {
      const left = budgetMs - (Date.now() - started);
      const allowed = kinds.filter((kind) => NEEDS_MS[kind] <= left);
      if (!allowed.length) break;
      const { data, error } = await supabase.rpc("claim_ai_job", { p_kinds: allowed });
      if (error) throw new Error(`Falha ao consultar a fila: ${error.message}`);
      const job = ((data ?? []) as ClaimedJob[])[0];
      if (!job) break;

      const msLeft = budgetMs - (Date.now() - started);
      const stop = deadline(supabase, job.id, msLeft);
      const status = await Promise.race([processJob(supabase, job, enginesFor(msLeft), config.engines), stop.promise]);
      stop.cancel();
      done.push({ id: job.id, kind: job.kind, status: status as CloudRun["status"] });
      if (status === "timeout") break;
    }
  } catch (e) {
    console.error("IA na nuvem:", e instanceof Error ? e.message : e);
  }
  return done;
}

/** Depois de responder ao painel, a mesma função segue trabalhando na fila. */
export function kickCloudQueue() {
  if (!Object.keys(cloudAiConfig().engines).length) return;
  after(async () => {
    await runCloudQueue();
  });
}

import "server-only";
import type { AiJobKind, AiJobView } from "@/lib/admin/ai-types";
import { FAL_ENGINE_NAME } from "@/scripts/ai-background.mjs";
import { DEFAULT_IMAGE_MODEL, DEFAULT_TRIPO_MODEL } from "@/scripts/ai-pipeline.mjs";

/**
 * Chaves que a IA na nuvem usa (cadastradas na Vercel, só no servidor). A FAL_KEY
 * é opcional: sem ela, a limpeza do fundo é feita pelo ChatGPT (OPENAI_API_KEY).
 */
export const CLOUD_AI_KEYS = ["SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "TRIPO_API_KEY"] as const;

/**
 * Tarefa "processando" há mais que isso foi interrompida: a função da Vercel
 * vive no máximo 5 minutos (maxDuration da página do produto).
 */
export const CLOUD_STALE_MINUTES = 8;

export type CloudAiConfig = {
  /** O que a nuvem sabe fazer agora, com o nome do motor. */
  engines: Partial<Record<AiJobKind, string>>;
  /** Nomes das chaves que faltam (nunca os valores). */
  missing: string[];
};

/**
 * O que a IA na nuvem consegue fazer com as chaves cadastradas. Sem a chave de
 * serviço do Supabase ela não pega nada da fila. AI_CLOUD=0 desliga (para usar
 * só o processador local).
 */
export function cloudAiConfig(env: NodeJS.ProcessEnv = process.env): CloudAiConfig {
  if (env.AI_CLOUD === "0") return { engines: {}, missing: [] };
  const missing = CLOUD_AI_KEYS.filter((key) => !env[key]);
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { engines: {}, missing };
  const engines: CloudAiConfig["engines"] = {};
  const imageModel = env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  if (env.FAL_KEY) engines.background_removal = `${FAL_ENGINE_NAME} (nuvem)`;
  else if (env.OPENAI_API_KEY) engines.background_removal = `ChatGPT ${imageModel} (nuvem)`;
  if (env.OPENAI_API_KEY) engines.catalog_photos = `OpenAI ${imageModel} (nuvem)`;
  if (env.TRIPO_API_KEY) engines.model_3d = `Tripo ${env.TRIPO_MODEL || DEFAULT_TRIPO_MODEL} (nuvem)`;
  return { engines, missing };
}

/** Há algo para a nuvem fazer: tarefa na fila que ela sabe fazer, ou uma que travou no meio. */
export function needsCloudRun(
  jobs: Pick<AiJobView, "kind" | "status" | "startedAt">[],
  config: CloudAiConfig,
  now = Date.now(),
): boolean {
  return jobs.some(
    (j) =>
      Boolean(config.engines[j.kind]) &&
      (j.status === "queued" ||
        (j.status === "running" && j.startedAt !== null && now - Date.parse(j.startedAt) > CLOUD_STALE_MINUTES * 60_000)),
  );
}

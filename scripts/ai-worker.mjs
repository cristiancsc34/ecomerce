#!/usr/bin/env node
/**
 * Processador do estúdio de IA: pega os jobs criados no painel, roda os modelos
 * (scripts em ai/) e grava o resultado como mídia do produto.
 *
 *   npm run ai:setup    # uma vez: ambiente Python + modelos
 *   npm run ai:worker   # deixa rodando (lê .env.local)
 *
 * Usa a chave de serviço do Supabase: roda numa máquina da loja ou num servidor,
 * nunca no navegador. Processa um job por vez. Na Vercel, as mesmas funções
 * rodam pela IA na nuvem (lib/ai-cloud), sem este laço.
 *
 * Motores habilitados:
 *   - limpeza de fundo: quando o modelo BiRefNet está baixado (ai:setup); sem
 *     ele, pela API da fal.ai com FAL_KEY (scripts/ai-background.mjs);
 *   - fotos de catálogo (IA recria a cena a partir das fotos reais): com
 *     OPENAI_API_KEY (GPT Image, edição com várias fotos de referência);
 *     estilo em CATALOG_STYLE (padrão "creme"; ou "neutro" / "ambiente-vazio");
 *   - 3D: com TRIPO_API_KEY (API do Tripo, a partir da foto de catálogo ¾); ou
 *     AI_3D_ENGINE=triposr com o TripoSR instalado (ver docs/ESTUDIO-IA.md).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { FAL_ENGINE_NAME, falBackgroundEngine } from "./ai-background.mjs";
import { DEFAULT_IMAGE_MODEL, DEFAULT_TRIPO_MODEL, openaiCatalogEngine, processNext, requeueStale, tripoEngine } from "./ai-pipeline.mjs";

// As etapas em Node ficam em ai-pipeline.mjs; reexportadas para quem já usa este arquivo.
export * from "./ai-pipeline.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = process.env.AI_PYTHON ?? path.join(ROOT, ".venv-ai", "bin", "python");
const IDLE_MS = 2000;
const HEARTBEAT_MS = 10_000;

/** O que este computador consegue processar. */
export function detectEngines(root = ROOT, env = process.env) {
  const engines = {};
  if (existsSync(PYTHON) && existsSync(path.join(root, "ai", "models", "birefnet", "model.onnx"))) {
    engines.background_removal = "BiRefNet + Depth Anything V2 (local)";
  } else if (env.FAL_KEY) {
    engines.background_removal = `${FAL_ENGINE_NAME} (API)`;
  }
  if (env.OPENAI_API_KEY && engines.background_removal) {
    engines.catalog_photos = `OpenAI ${env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL}`;
  }
  if (env.TRIPO_API_KEY) {
    engines.model_3d = `Tripo ${env.TRIPO_MODEL || DEFAULT_TRIPO_MODEL} (API)`;
  } else if (
    env.AI_3D_ENGINE === "triposr" &&
    existsSync(PYTHON) &&
    existsSync(path.join(root, "ai", "models", "triposr", "model.ckpt")) &&
    existsSync(path.join(root, "ai", "vendor", "TripoSR"))
  ) {
    engines.model_3d = "TripoSR (local)";
  }
  return engines;
}


function runPython(script, args, timeoutMs, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [path.join(ROOT, "ai", script), ...args], { cwd: ROOT, env: { ...process.env, ...extraEnv } });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("O processamento passou do tempo limite."));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const last = (stderr.trim().split("\n").pop() || stdout.trim().split("\n").pop() || "").slice(0, 300);
        return reject(new Error(last || `O motor terminou com erro (${code}).`));
      }
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop()));
      } catch {
        reject(new Error("Resposta inesperada do motor."));
      }
    });
  });
}

/** Motores reais (scripts Python em ai/). */
export const pythonEngines = {
  async backgroundRemoval(input, dir, { fundo = "creme" } = {}) {
    const cutout = path.join(dir, "recorte.png");
    const studio = path.join(dir, "estudio.jpg");
    const meta = await runPython("remove_background.py", [input, cutout, studio], 5 * 60_000, { ESTUDIO_FUNDO: fundo });
    return { cutout, studio, meta };
  },
  // O TripoSR local usa uma foto só (ignora os ângulos do catálogo).
  async model3d(input, dir, heightCm, _views = null) {
    const glb = path.join(dir, "modelo.glb");
    const args = [input, glb];
    if (heightCm) args.push(String(heightCm));
    const meta = await runPython("image_to_3d.py", args, 20 * 60_000);
    return { glb, meta };
  },
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.");
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const engineNames = detectEngines();
  const engines = {
    ...pythonEngines,
    ...(engineNames.background_removal?.startsWith(FAL_ENGINE_NAME) ? falBackgroundEngine() : {}),
    ...(engineNames.catalog_photos ? openaiCatalogEngine() : {}),
    ...(engineNames.model_3d?.startsWith("Tripo") ? tripoEngine() : {}),
  };
  const kinds = Object.keys(engineNames);
  const workerId = `local-${hostname()}`.slice(0, 80);

  if (!kinds.length) {
    console.error("Nenhum motor instalado. Rode: npm run ai:setup");
    process.exit(1);
  }
  console.log(`Processador ${workerId}: ${kinds.map((k) => `${k} → ${engineNames[k]}`).join("; ")}`);

  const heartbeat = () =>
    supabase.from("ai_workers").upsert({ id: workerId, capabilities: kinds, engines: engineNames, last_seen_at: new Date().toISOString() });
  await heartbeat();
  const beat = setInterval(heartbeat, HEARTBEAT_MS);
  await requeueStale(supabase);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(beat);
    await supabase.from("ai_workers").delete().eq("id", workerId);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    try {
      const done = await processNext(supabase, kinds, engines, engineNames);
      if (done) {
        console.log(`${new Date().toLocaleTimeString("pt-BR")} job ${done.id} (${done.kind}): ${done.status}`);
        await heartbeat();
        continue;
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, IDLE_MS));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

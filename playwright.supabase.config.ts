import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E do PAINEL contra um Supabase real rodando localmente:
 *
 *   npm run db:start      # sobe Postgres, Auth, REST e Storage (Docker)
 *   npm run db:reset      # aplica migrações + seed
 *   npm run test:e2e:supabase
 *
 * Usa .env.local (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e
 * SUPABASE_SERVICE_ROLE_KEY do `supabase status`). O global setup cria as
 * contas de teste da equipe.
 */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = 3201;
/** Onde o ViaCEP falso anota cada consulta (o teste do checkout conta as chamadas). */
const VIACEP_LOG = path.join(tmpdir(), "viacep-falso.log");

export default defineConfig({
  testDir: "tests/e2e-supabase",
  globalSetup: "./tests/e2e-supabase/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    locale: "pt-BR",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e-supabase",
      CATALOG_SOURCE: "supabase",
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
      NEXT_TELEMETRY_DISABLED: "1",
      // Sem IA na nuvem: o teste confere a fila esperando, sem gastar APIs pagas.
      AI_CLOUD: "0",
      // Busca de CEP simulada (tests/e2e-supabase/viacep-falso.mjs): nenhum teste chama o ViaCEP de verdade.
      NODE_OPTIONS: "--import ./tests/e2e-supabase/viacep-falso.mjs",
      VIACEP_FALSO_LOG: VIACEP_LOG,
    },
  },
});

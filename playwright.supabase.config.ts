import { existsSync } from "node:fs";
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
    },
  },
});

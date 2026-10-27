import { defineConfig, devices } from "@playwright/test";

/**
 * E2E da vitrine em MODO DEMONSTRAÇÃO (sem Supabase). Roda em qualquer máquina
 * e no CI. O build vai para .next-e2e-demo para não misturar com o de dev.
 */
const PORT = 3101;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    locale: "pt-BR",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e-demo",
      CATALOG_SOURCE: "demo",
      // Vazios de propósito: sobrepõem um eventual .env.local com Supabase.
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});

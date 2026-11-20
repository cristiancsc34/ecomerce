import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Variáveis que mudam o resultado; zeradas para o teste não depender da máquina. */
const VARS = [
  "NEXT_PUBLIC_SITE_URL",
  "CATALOG_SOURCE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "VERCEL_ENV",
  "NEXT_PUBLIC_VERCEL_ENV",
  "VERCEL_URL",
  "NEXT_PUBLIC_VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "NEXT_PUBLIC_VERCEL_BRANCH_URL",
];

/** Módulo novo a cada teste: o aviso de demonstração sai uma vez por processo. */
const loadSite = async () => {
  vi.resetModules();
  return import("@/config/site");
};

beforeEach(() => {
  for (const name of VARS) vi.stubEnv(name, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("siteUrl()", () => {
  it("em desenvolvimento, sem a variável, usa localhost", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { siteUrl } = await loadSite();
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("usa NEXT_PUBLIC_SITE_URL sem a barra do fim", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.azconfort.com.br/");
    const { siteUrl } = await loadSite();
    expect(siteUrl()).toBe("https://www.azconfort.com.br");
  });

  it("em produção, sem a variável, falha com mensagem clara (nunca localhost)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { siteUrl } = await loadSite();
    expect(() => siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("na produção da Vercel, sem a variável, também falha", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "azconfort-abc123.vercel.app");
    const { siteUrl } = await loadSite();
    expect(() => siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("na prévia da Vercel, sem a variável, usa o endereço da prévia", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "azconfort-abc123.vercel.app");
    vi.stubEnv("VERCEL_BRANCH_URL", "azconfort-git-az-env-guard.vercel.app");
    const { siteUrl } = await loadSite();
    expect(siteUrl()).toBe("https://azconfort-git-az-env-guard.vercel.app");
  });

  it("na prévia da Vercel sem nenhum endereço, falha em vez de usar localhost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    const { siteUrl } = await loadSite();
    expect(() => siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});

describe("catalogSource() / isDemoMode()", () => {
  it("em desenvolvimento, sem Supabase, entra em demonstração sem alarde", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { catalogSource, isDemoMode } = await loadSite();
    expect(catalogSource()).toBe("demo");
    expect(isDemoMode()).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it("em produção, sem Supabase e sem CATALOG_SOURCE, avisa explicitamente (uma vez)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { catalogSource, isDemoMode } = await loadSite();
    expect(catalogSource()).toBe("demo");
    expect(isDemoMode()).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    const aviso = String(error.mock.calls[0][0]);
    expect(aviso).toMatch(/modo demonstração/);
    expect(aviso).toMatch(/noindex/);
    expect(aviso).toMatch(/CATALOG_SOURCE=demo/);
  });

  it("na produção da Vercel (loja no ar), sem Supabase e sem CATALOG_SOURCE, falha", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    const { catalogSource, isDemoMode, IMPLICIT_DEMO_MESSAGE } = await loadSite();
    expect(() => catalogSource()).toThrow(IMPLICIT_DEMO_MESSAGE);
    expect(() => isDemoMode()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("CATALOG_SOURCE=demo explícito continua valendo em produção, sem aviso", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CATALOG_SOURCE", "demo");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { catalogSource } = await loadSite();
    expect(catalogSource()).toBe("demo");
    expect(error).not.toHaveBeenCalled();
  });

  it("com Supabase configurado, usa o catálogo real", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "chave-publica");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { catalogSource, isDemoMode } = await loadSite();
    expect(catalogSource()).toBe("supabase");
    expect(isDemoMode()).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });

  it("no navegador não lança nem avisa (CATALOG_SOURCE só existe no servidor)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    vi.stubGlobal("window", {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { catalogSource } = await loadSite();
    expect(catalogSource()).toBe("demo");
    expect(error).not.toHaveBeenCalled();
  });
});

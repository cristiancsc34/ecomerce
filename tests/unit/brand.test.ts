import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const loadBrand = async () => {
  vi.resetModules();
  return (await import("@/config/brand")).brand;
};

afterEach(() => vi.unstubAllEnvs());

describe("marca", () => {
  it("sem NEXT_PUBLIC_BRAND_NAME, a marca padrão é AzConfort", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "");
    expect((await loadBrand()).name).toBe("AzConfort");
  });

  it("NEXT_PUBLIC_BRAND_NAME ainda troca o nome", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "  Outra Loja  ");
    expect((await loadBrand()).name).toBe("Outra Loja");
  });

  it("contatos e dados legais continuam vazios (nada inventado)", async () => {
    const brand = await loadBrand();
    expect(brand.contact).toEqual({ email: "", whatsapp: "", phone: "", hours: "" });
    expect(brand.legal).toEqual({ companyName: "", cnpj: "", address: "" });
    expect(brand.social).toEqual([]);
  });

  it("package.json e .env.example não usam mais a marca antiga", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(pkg.name).toBe("azconfort");
    const envExample = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    expect(envExample).toMatch(/^NEXT_PUBLIC_BRAND_NAME=AzConfort$/m);
    expect(envExample).not.toMatch(/Cuxões/);
  });
});

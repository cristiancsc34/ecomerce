import { describe, expect, it } from "vitest";
import { pinLoginEnabled, pinMatches } from "@/lib/admin/pin";
import { isProductTab, missingLabel, pendingAiPhotos, readiness, readinessSummary } from "@/lib/admin/readiness";
import { publishIssues } from "@/lib/validation/product";
import { makeMedia, makeProduct } from "./factories";

describe("PIN do painel", () => {
  it("aceita só o PIN exato", () => {
    expect(pinMatches("1234", "1234")).toBe(true);
    expect(pinMatches("1235", "1234")).toBe(false);
    expect(pinMatches("12345", "1234")).toBe(false);
    expect(pinMatches("123", "123")).toBe(false); // curto demais
    expect(pinMatches("12a4", "12a4")).toBe(false); // só dígitos
    expect(pinMatches("", "")).toBe(false);
  });

  it("sem PIN configurado, nada entra", () => {
    expect(pinMatches("1234", "")).toBe(false);
  });

  it("só liga com PIN, e-mail e senha da conta configurados", () => {
    const saved = { ...process.env };
    process.env.ADMIN_PIN = "1234";
    process.env.ADMIN_PIN_EMAIL = "painel@loja.test";
    delete process.env.ADMIN_PIN_PASSWORD;
    expect(pinLoginEnabled()).toBe(false);
    process.env.ADMIN_PIN_PASSWORD = "senha-forte";
    expect(pinLoginEnabled()).toBe(true);
    process.env = saved;
  });
});

describe("checklist “pronto para vender”", () => {
  it("produto completo: tudo pronto, igual às regras de publicação", () => {
    const product = makeProduct();
    expect(publishIssues(product)).toEqual([]);
    expect(readiness(product).every((i) => i.done)).toBe(true);
    expect(readinessSummary(product).next).toBeNull();
  });

  it("aponta o que falta e a aba onde resolver", () => {
    const product = makeProduct({ description: null, priceCents: null, variants: [] });
    const summary = readinessSummary(product);
    expect(summary.done).toBe(summary.total - 2);
    expect(summary.next).toMatchObject({ key: "descricao", tab: "informacoes" });
    expect(readiness(product).find((i) => i.key === "preco")).toMatchObject({ done: false, tab: "preco" });
  });

  it("modelo 3D só entra na lista quando a categoria exige", () => {
    expect(readiness(makeProduct()).some((i) => i.key === "3d")).toBe(false);
    const chair = makeProduct({
      category: { id: "00000000-0000-4000-8000-0000000000c2", slug: "cadeiras", name: "Cadeiras", requires3d: true },
    });
    expect(readiness(chair).find((i) => i.key === "3d")).toMatchObject({ done: false, tab: "fotos" });
  });

  it("conta as fotos da IA que esperam conferência", () => {
    const product = makeProduct({
      media: [makeMedia(), makeMedia({ aiGenerated: true, pendingReview: true, isPrimary: false })],
    });
    expect(pendingAiPhotos(product)).toBe(1);
  });

  it("só aceita abas conhecidas no endereço", () => {
    expect(isProductTab("preco")).toBe(true);
    expect(isProductTab("video")).toBe(false);
    expect(isProductTab(undefined)).toBe(false);
  });
});

describe("texto do que falta", () => {
  it("mantém siglas como 3D", () => {
    const chair = makeProduct({
      category: { id: "00000000-0000-4000-8000-0000000000c2", slug: "cadeiras", name: "Cadeiras", requires3d: true },
    });
    const item = readiness(chair).find((i) => i.key === "3d")!;
    expect(missingLabel(item)).toBe("Falta: modelo 3D");
  });
});

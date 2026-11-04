import { describe, expect, it } from "vitest";
import { acessoDaSenha, areaAccount, pinLoginEnabled, senhasDeAcesso } from "@/lib/admin/pin";
import { areaDoCaminho, areasDe, podeUsar, rotuloDoAcesso } from "@/lib/auth/areas";

/** Senhas de acesso por área (lib/admin/pin.ts) e as regras de área (lib/auth/areas.ts). */

const env = {
  ADMIN_PIN: "geral-2026",
  ADMIN_PIN_EMAIL: "painel@loja.test",
  ADMIN_PIN_PASSWORD: "senha-longa-da-conta-geral",
  ADMIN_SENHA_ITENS: "itens-123",
  ADMIN_SENHA_PEDIDOS: "pedidos-456",
  ADMIN_SENHA_ENTREGA: "entrega-789",
};

describe("senhas de acesso", () => {
  it("a senha geral abre tudo; a de cada área, só ela; senha errada, nada", () => {
    expect(acessoDaSenha("geral-2026", env)).toEqual({ tipo: "geral" });
    expect(acessoDaSenha("itens-123", env)).toEqual({ tipo: "area", area: "itens" });
    expect(acessoDaSenha("pedidos-456", env)).toEqual({ tipo: "area", area: "pedidos" });
    expect(acessoDaSenha("entrega-789", env)).toEqual({ tipo: "area", area: "entrega" });
    expect(acessoDaSenha("itens-12", env)).toBeNull();
    expect(acessoDaSenha("", env)).toBeNull();
    expect(acessoDaSenha("com espaço", env)).toBeNull();
  });

  it("o PIN numérico antigo continua valendo como senha geral", () => {
    expect(acessoDaSenha("1234", { ...env, ADMIN_PIN: "1234" })).toEqual({ tipo: "geral" });
  });

  it("senha repetida entre duas áreas não vale para nenhuma (evita abrir a área errada)", () => {
    const repetida = { ...env, ADMIN_SENHA_ENTREGA: "itens-123" };
    expect(acessoDaSenha("itens-123", repetida)).toBeNull();
    expect(senhasDeAcesso(repetida).map((s) => (s.acesso.tipo === "area" ? s.acesso.area : "geral"))).toEqual(["geral", "pedidos"]);
  });

  it("liga com a conta geral e pelo menos uma senha (só de área também serve)", () => {
    expect(pinLoginEnabled(env)).toBe(true);
    expect(pinLoginEnabled({ ...env, ADMIN_PIN: "" })).toBe(true);
    expect(pinLoginEnabled({ ADMIN_PIN_EMAIL: env.ADMIN_PIN_EMAIL, ADMIN_PIN_PASSWORD: env.ADMIN_PIN_PASSWORD })).toBe(false);
    expect(pinLoginEnabled({ ...env, ADMIN_PIN_PASSWORD: "" })).toBe(false);
  });

  it("cada área tem a própria conta, derivada da geral (e-mail com +área, senha que não é a geral)", () => {
    const itens = areaAccount("itens", env);
    expect(itens.email).toBe("painel+itens@loja.test");
    expect(itens.password).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(itens.password).not.toBe(env.ADMIN_PIN_PASSWORD);
    expect(areaAccount("pedidos", env).password).not.toBe(itens.password);
    expect(areaAccount("itens", env)).toEqual(itens);
    expect(areaAccount("itens", { ...env, ADMIN_PIN_EMAIL: "painel+loja@x.test" }).email).toBe("painel+loja.itens@x.test");
    expect(areaAccount("itens", { ...env, ADMIN_PIN_PASSWORD: "outra" }).password).not.toBe(itens.password);
  });
});

describe("áreas do painel", () => {
  it("admin vê tudo; conta antiga sem área também; conta de área, só a dela", () => {
    expect(areasDe({ role: "admin", areas: [] })).toEqual(["itens", "pedidos", "entrega"]);
    expect(areasDe({ role: "editor", areas: [] })).toEqual(["itens", "pedidos", "entrega"]);
    expect(areasDe({ role: "editor", areas: ["pedidos"] })).toEqual(["pedidos"]);
    expect(podeUsar({ role: "editor", areas: ["itens"] }, "pedidos")).toBe(false);
    expect(rotuloDoAcesso({ role: "admin", areas: [] })).toBe("Administração geral");
    expect(rotuloDoAcesso({ role: "editor", areas: ["entrega"] })).toBe("Entrega e avisos");
  });

  it("cada caminho do painel pertence a uma área", () => {
    expect(areaDoCaminho("/admin/produtos/abc")).toBe("itens");
    expect(areaDoCaminho("/admin/categorias")).toBe("itens");
    expect(areaDoCaminho("/admin/atividade")).toBe("itens");
    expect(areaDoCaminho("/admin/pedidos/novo")).toBe("pedidos");
    expect(areaDoCaminho("/admin/entrega")).toBe("entrega");
    expect(areaDoCaminho("/admin")).toBeNull();
    expect(areaDoCaminho("/admin/produtosx")).toBeNull();
  });
});

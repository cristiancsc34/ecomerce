import { describe, expect, it } from "vitest";
import { areaDoCaminho, areasDe, podeUsar, rotuloDoAcesso } from "@/lib/auth/areas";

/** Regras de área do painel (lib/auth/areas.ts), usadas pelos links de acesso. */

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

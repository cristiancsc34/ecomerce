import { describe, expect, it } from "vitest";
import { friendlyDbError } from "@/lib/admin/errors";

describe("mensagens de erro do banco", () => {
  it("traduz violações conhecidas", () => {
    expect(friendlyDbError({ code: "23505", message: 'duplicate key value violates unique constraint "products_slug_key"' })).toMatch(/endereço/);
    expect(friendlyDbError({ code: "23503", message: "fk" })).toMatch(/em uso/);
  });

  it("repassa as mensagens claras dos triggers", () => {
    expect(friendlyDbError({ code: "23514", message: "Para publicar, envie uma foto e defina a foto principal." })).toBe(
      "Para publicar, envie uma foto e defina a foto principal.",
    );
    expect(friendlyDbError({ code: "42501", message: "Somente administradores podem publicar ou arquivar produtos." })).toMatch(/^Somente/);
  });

  it("não expõe detalhes internos", () => {
    expect(friendlyDbError({ code: "42501", message: 'new row violates row-level security policy for table "products"' })).toBe(
      "Você não tem permissão para fazer isso.",
    );
    expect(friendlyDbError({ code: "XX000", message: "internal: stack trace..." })).toBe("Não foi possível salvar. Tente novamente.");
  });
});

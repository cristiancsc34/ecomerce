import { describe, expect, it } from "vitest";
import { categoryNavItems, isActiveNavItem } from "@/lib/catalog/category-nav";
import { gridCols } from "@/components/product/product-card";

describe("grade de produtos (gridCols)", () => {
  it("1 produto: uma coluna estreita", () => {
    expect(gridCols(1)).toBe("grid-cols-1 max-w-sm");
  });
  it("2 produtos: duas colunas contidas", () => {
    expect(gridCols(2)).toBe("grid-cols-2 max-w-3xl");
  });
  it("3 produtos: até três colunas", () => {
    expect(gridCols(3)).toContain("sm:grid-cols-3");
    expect(gridCols(3)).not.toContain("lg:grid-cols-4");
  });
  it("4 ou mais: a grade completa de sempre", () => {
    expect(gridCols(4)).toBe("grid-cols-2 sm:grid-cols-3 lg:grid-cols-4");
    expect(gridCols(12)).toBe(gridCols(4));
  });
});

describe("menu de categorias (seções da loja)", () => {
  const cat = (slug: string, productCount: number) => ({ slug, name: slug.toUpperCase(), productCount });

  it("não aparece com nenhuma ou uma seção com produto", () => {
    expect(categoryNavItems([])).toEqual([]);
    expect(categoryNavItems([cat("cadeiras", 2)])).toEqual([]);
    expect(categoryNavItems([cat("cadeiras", 2), cat("mesas", 3)])).toEqual([]);
    expect(categoryNavItems([cat("cadeiras", 2), cat("colchoes", 0)])).toEqual([]);
  });

  it("só seções com produto, na ordem Colchões, Estofados, Móveis, com Todos apontando para /#produtos", () => {
    const items = categoryNavItems([cat("cadeiras", 2), cat("mesas", 0), cat("poltronas", 1), cat("colchoes", 4)]);
    expect(items.map((i) => i.href)).toEqual(["/#produtos", "/colchoes", "/estofados", "/moveis"]);
    expect(items.map((i) => i.label)).toEqual(["Todos", "Colchões", "Estofados", "Móveis"]);
  });

  it("destaca a seção atual, inclusive nas subpáginas", () => {
    const [todos, estofados, moveis] = categoryNavItems([cat("cadeiras", 2), cat("poltronas", 1)]);
    expect(isActiveNavItem(todos, "/")).toBe(true);
    expect(isActiveNavItem(moveis, "/moveis")).toBe(true);
    expect(isActiveNavItem(moveis, "/moveis/cadeiras")).toBe(true);
    expect(isActiveNavItem(estofados, "/moveis/cadeiras")).toBe(false);
    expect(isActiveNavItem(moveis, "/moveisx")).toBe(false);
    expect(isActiveNavItem(todos, "/moveis")).toBe(false);
    expect(isActiveNavItem(todos, null)).toBe(false);
  });
});

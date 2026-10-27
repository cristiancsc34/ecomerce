import { describe, expect, it } from "vitest";
import { centsToInput, formatPrice, parsePriceToCents } from "@/lib/catalog/money";
import { isUuid, slugify } from "@/lib/catalog/slug";

describe("preço em centavos", () => {
  it("formata em reais", () => {
    expect(formatPrice(129990).replace(/\s/g, " ")).toBe("R$ 1.299,90");
    expect(formatPrice(0).replace(/\s/g, " ")).toBe("R$ 0,00");
  });

  it("recusa float", () => {
    expect(() => formatPrice(12.5)).toThrow();
  });

  it.each([
    ["1.299,90", 129990],
    ["1299,9", 129990],
    ["1299", 129900],
    ["1299.90", 129990],
    ["R$ 2.199,00", 219900],
    ["0,05", 5],
  ])("lê %s", (input, cents) => {
    expect(parsePriceToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "-10", "1,234", "12,345", "1.2.3,00x"])("recusa %s", (input) => {
    expect(parsePriceToCents(input)).toBeNull();
  });

  it("converte centavos para o campo do formulário e volta", () => {
    expect(centsToInput(129990)).toBe("1299,90");
    expect(centsToInput(5)).toBe("0,05");
    expect(centsToInput(null)).toBe("");
    expect(parsePriceToCents(centsToInput(349900))).toBe(349900);
  });
});

describe("slug", () => {
  it("gera endereços legíveis e estáveis", () => {
    expect(slugify("Colchão Nuvem Essencial!")).toBe("colchao-nuvem-essencial");
    expect(slugify("  Sereno   Híbrido -- Queen ")).toBe("sereno-hibrido-queen");
    expect(slugify("ÇÃÕ éü")).toBe("cao-eu");
    expect(slugify("a".repeat(100)).length).toBe(80);
  });

  it("valida UUID", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000101")).toBe(true);
    expect(isUuid("../../etc/passwd")).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});

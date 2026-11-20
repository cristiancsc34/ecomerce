import { describe, expect, it } from "vitest";
import { checkoutFieldError } from "@/lib/validation/checkout-field";

/** Validação ao sair do campo no checkout: mesmo schema e mesmas mensagens do envio, só do campo conferido. */
describe("checkoutFieldError", () => {
  it("nome: vazio pede o nome; preenchido passa", () => {
    expect(checkoutFieldError("customerName", "")).toBe("Informe seu nome.");
    expect(checkoutFieldError("customerName", "Ana Souza")).toBeUndefined();
  });

  it("celular com 9 dígitos (sem DDD) mostra erro; com DDD passa", () => {
    expect(checkoutFieldError("customerPhone", "98765-4321")).toBe("Informe o celular com DDD, ex.: (11) 98765-4321.");
    expect(checkoutFieldError("customerPhone", "(11) 98765-4321")).toBeUndefined();
  });

  it("e-mail: opcional, mas inválido mostra erro", () => {
    expect(checkoutFieldError("customerEmail", "")).toBeUndefined();
    expect(checkoutFieldError("customerEmail", "ana@")).toBe("E-mail inválido. Confira ou deixe em branco.");
    expect(checkoutFieldError("customerEmail", "ana@exemplo.com.br")).toBeUndefined();
  });

  it("CEP: precisa de 8 números (com ou sem hífen)", () => {
    expect(checkoutFieldError("address.cep", "")).toBe("CEP com 8 números.");
    expect(checkoutFieldError("address.cep", "8801")).toBe("CEP com 8 números.");
    expect(checkoutFieldError("address.cep", "88015-200")).toBeUndefined();
  });

  it("endereço: as mesmas mensagens do envio", () => {
    expect(checkoutFieldError("address.rua", "")).toBe("Informe a rua.");
    expect(checkoutFieldError("address.numero", "")).toBe("Informe o número (ou s/n).");
    expect(checkoutFieldError("address.numero", "S/N")).toBeUndefined();
    expect(checkoutFieldError("address.uf", "S")).toBe("UF com 2 letras, ex.: SP.");
  });
});

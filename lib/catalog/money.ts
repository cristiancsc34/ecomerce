const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Formata centavos (inteiro) como moeda brasileira. Nunca usar float para preço. */
export function formatPrice(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error("Preço deve estar em centavos inteiros.");
  }
  return brl.format(cents / 100);
}

/**
 * Converte o texto digitado no admin ("1.299,90", "1299.9", "1299") em centavos.
 * Retorna null para entradas inválidas ou negativas.
 */
export function parsePriceToCents(input: string): number | null {
  const trimmed = input.trim().replace(/\s|R\$/g, "");
  if (!trimmed) return null;
  let normalized = trimmed;
  if (normalized.includes(",")) {
    // Formato brasileiro: ponto como milhar, vírgula como decimal.
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [reais, centavos = ""] = normalized.split(".");
  const cents = Number(reais) * 100 + Number(centavos.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Centavos → texto editável no formato brasileiro, sem símbolo ("1299,90"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const reais = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `${reais},${rest}`;
}

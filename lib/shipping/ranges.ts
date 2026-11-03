/**
 * Faixas de CEP digitadas pelo dono, uma por linha:
 *   "88000-000 a 88139-999"  (faixa)
 *   "88015-200"              (um CEP)
 *   "88"  ou  "880"          (todos os CEPs que começam assim: 88000-000 a 88999-999)
 */
export type CepRange = { from: string; to: string };

export function parseCepRanges(text: string): { ranges: CepRange[]; errors: string[] } {
  const ranges: CepRange[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const ceps = line.match(/\d{5}-?\d{3}/g);
    if (ceps && ceps.length === 2) {
      const [from, to] = ceps.map((c) => c.replace(/\D/g, ""));
      if (from > to) errors.push(`Linha ${index + 1}: o primeiro CEP precisa ser menor que o segundo.`);
      else ranges.push({ from, to });
      return;
    }
    if (ceps && ceps.length === 1 && line.replace(/\D/g, "").length === 8) {
      const cep = ceps[0].replace(/\D/g, "");
      ranges.push({ from: cep, to: cep });
      return;
    }
    if (/^\d{1,7}$/.test(line)) {
      ranges.push({ from: line.padEnd(8, "0"), to: line.padEnd(8, "9") });
      return;
    }
    errors.push(`Linha ${index + 1}: use "88000-000 a 88139-999", um CEP ou o começo do CEP (ex.: 88).`);
  });
  return { ranges, errors };
}

const fmt = (cep: string) => cep.replace(/^(\d{5})(\d{3})$/, "$1-$2");

/** Faixas → texto do formulário (o inverso de parseCepRanges). */
export function formatCepRanges(ranges: CepRange[]): string {
  return ranges
    .map(({ from, to }) => {
      if (from === to) return fmt(from);
      // "880" = 88000-000 a 88099-999: o prefixo é o que a faixa inteira tem em comum.
      for (let len = 1; len <= 7; len++) {
        const prefix = from.slice(0, len);
        if (from === prefix.padEnd(8, "0") && to === prefix.padEnd(8, "9")) return prefix;
      }
      return `${fmt(from)} a ${fmt(to)}`;
    })
    .join("\n");
}

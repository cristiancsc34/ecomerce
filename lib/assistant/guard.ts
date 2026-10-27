/**
 * Trava contra alucinação, aplicada no servidor DEPOIS da resposta do modelo.
 *
 * O prompt já proíbe inventar, mas a última palavra é do código:
 * - número de preço, medida, prazo, garantia ou parcela que não esteja na base
 *   de conhecimento => resposta bloqueada;
 * - promessa comercial (frete grátis, desconto, cupom, sem juros…) dita de
 *   forma afirmativa e ausente da base => resposta bloqueada.
 * Em caso de bloqueio, o cliente recebe uma resposta segura e honesta.
 */

/** Unidades que tornam um número "comercial" (o par número+unidade precisa existir na base). */
const UNIT_AFTER =
  /^\s*(%|x\b|vezes\b|parcelas?\b|reais\b|anos?\b|meses\b|m[eê]s\b|dias?\b|horas?\b|semanas?\b|cm\b|mm\b|m\b|metros?\b|kg\b|quilos?\b|g\b|litros?\b|l\b|unidades?\b|pe[çc]as?\b)/i;
const MONEY_BEFORE = /R\$\s*$/i;

/** Forma canônica da unidade: "anos" e "ano" → "ano"; "3x" e "3 vezes" → "x"; "reais" e "R$" → "R$". */
function unitKind(unit: string): string {
  const u = unit.toLowerCase();
  if (u === "reais") return "R$";
  if (u === "x" || u === "vezes" || u.startsWith("parcela")) return "x";
  if (u === "mês" || u === "mes" || u === "meses") return "mes";
  if (u.startsWith("quilo")) return "kg";
  if (u.startsWith("metro")) return "m";
  if (u.startsWith("unidade") || u.startsWith("pe")) return "un";
  return u.replace(/s$/, "");
}

/** Normaliza "1.299,90", "1299.9", "1299" para a mesma forma ("1299.9"). */
export function normalizeNumber(token: string): string {
  let t = token.replace(/[.,]+$/, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d+$/.test(t)) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? String(n) : t;
}

/** kind: unidade canônica (ou "R$") quando o número é comercial; null quando é um número solto. */
type NumberHit = { value: string; kind: string | null };

function numbersIn(text: string): NumberHit[] {
  const hits: NumberHit[] = [];
  for (const m of text.matchAll(/\d[\d.,]*/g)) {
    const raw = m[0];
    const start = m.index ?? 0;
    const before = text.slice(Math.max(0, start - 4), start);
    const after = text.slice(start + raw.length, start + raw.length + 12);
    const unit = UNIT_AFTER.exec(after)?.[1] ?? null;
    // "3D", "4K": o número faz parte de um nome. Já "3x", "45cm" e "2anos" são quantidades.
    if (!unit && /^[a-zà-ÿ]/i.test(after)) continue;
    const kind = MONEY_BEFORE.test(before) ? "R$" : unit ? unitKind(unit) : null;
    hits.push({ value: normalizeNumber(raw), kind });
  }
  return hits;
}

/** Promessas que só podem aparecer se estiverem na base de conhecimento. */
const CLAIMS: { label: string; pattern: RegExp }[] = [
  { label: "frete grátis", pattern: /frete\s+gr[aá]tis/i },
  { label: "desconto", pattern: /desconto/i },
  { label: "cupom", pattern: /cupo[mn]/i },
  { label: "promoção", pattern: /promo[çc][aã]o/i },
  { label: "parcelamento", pattern: /parcel|sem\s+juros/i },
  { label: "pronta entrega", pattern: /pronta\s+entrega/i },
  { label: "garantia", pattern: /garantia\s+de\s+\d/i },
];

/** Frase com negação ("ainda não temos desconto") não é promessa. */
function isNegated(sentence: string): boolean {
  return /\b(n[aã]o|nenhum|nenhuma|ainda\s+sem|sem\s+informa)/i.test(sentence);
}

export type GuardResult = { ok: true } | { ok: false; reasons: string[] };

export function checkAnswer(answer: string, knowledge: string): GuardResult {
  const reasons: string[] = [];

  const known = numbersIn(knowledge);
  const knownValues = new Set(known.map((h) => h.value));
  const knownPairs = new Set(known.filter((h) => h.kind).map((h) => `${h.value} ${h.kind}`));
  for (const hit of numbersIn(answer)) {
    if (hit.kind) {
      // Preço, medida, prazo, parcela: o MESMO número com a MESMA unidade tem que estar na base.
      if (!knownPairs.has(`${hit.value} ${hit.kind}`)) reasons.push(`não confirmado: ${hit.value} ${hit.kind}`);
      continue;
    }
    // Números soltos: os da base, ou contagens pequenas ("as 2 opções").
    const small = Number.isInteger(Number(hit.value)) && Number(hit.value) <= 10;
    if (!knownValues.has(hit.value) && !small) reasons.push(`número não confirmado: ${hit.value}`);
  }

  const sentences = answer.split(/(?<=[.!?\n])\s+/);
  const knowledgeLower = knowledge.toLowerCase();
  for (const claim of CLAIMS) {
    const affirmative = sentences.some((s) => claim.pattern.test(s) && !isNegated(s));
    if (affirmative && !claim.pattern.test(knowledgeLower)) reasons.push(`promessa não confirmada: ${claim.label}`);
  }

  return reasons.length ? { ok: false, reasons: [...new Set(reasons)] } : { ok: true };
}

export const SAFE_FALLBACK_ANSWER =
  "Essa informação ainda não foi confirmada pela loja, então prefiro não arriscar. Posso te mostrar os produtos e o que já sabemos deles, ou você pode falar com o nosso atendimento.";

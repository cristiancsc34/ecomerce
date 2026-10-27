import { FIRMNESS_LEVELS, SIZE_KEYS, type Firmness, type SizeKey } from "./types";

/**
 * Orientação GERAL de conforto para o guia "Encontrar meu colchão".
 * Não é recomendação médica: preferências pessoais variam e o texto da
 * página deixa isso claro.
 */
export const SLEEP_POSITIONS = ["lado", "costas", "brucos", "varia"] as const;
export type SleepPosition = (typeof SLEEP_POSITIONS)[number];

export const SLEEP_POSITION_LABELS: Record<SleepPosition, string> = {
  lado: "De lado",
  costas: "De barriga para cima",
  brucos: "De bruços",
  varia: "Mudo de posição",
};

export const FEEL_PREFERENCES = ["macio", "equilibrado", "firme", "nao-sei"] as const;
export type FeelPreference = (typeof FEEL_PREFERENCES)[number];

export const FEEL_LABELS: Record<FeelPreference, string> = {
  macio: "Gosto de afundar um pouco",
  equilibrado: "Algo equilibrado",
  firme: "Prefiro sentir firmeza",
  "nao-sei": "Não sei dizer",
};

export const SLEEPERS = ["um", "dois"] as const;
export type Sleepers = (typeof SLEEPERS)[number];

/** Faixa de partida por posição (índices na escala macio → firme). */
const BASE_RANGE: Record<SleepPosition, [number, number]> = {
  // De lado, ombros e quadril costumam pedir mais acomodação.
  lado: [0, 2],
  // De barriga para cima, costuma-se buscar equilíbrio entre apoio e conforto.
  costas: [2, 3],
  // De bruços, costuma-se preferir superfícies mais firmes.
  brucos: [3, 4],
  varia: [1, 3],
};

const FEEL_SHIFT: Record<FeelPreference, number> = {
  macio: -1,
  equilibrado: 0,
  firme: 1,
  "nao-sei": 0,
};

export function recommendFirmness(position: SleepPosition, feel: FeelPreference): Firmness[] {
  const [lo, hi] = BASE_RANGE[position];
  const shift = FEEL_SHIFT[feel];
  const max = FIRMNESS_LEVELS.length - 1;
  const from = Math.min(max, Math.max(0, lo + shift));
  const to = Math.min(max, Math.max(0, hi + shift));
  return FIRMNESS_LEVELS.slice(from, to + 1);
}

export function recommendSizes(sleepers: Sleepers, bed: SizeKey | null): SizeKey[] {
  if (bed) return [bed];
  return sleepers === "um" ? ["solteiro", "solteiro-king"] : ["casal", "queen", "king"];
}

export type GuideAnswers = {
  posicao: SleepPosition;
  sensacao: FeelPreference;
  pessoas: Sleepers;
  cama: SizeKey | null;
};

/** Lê as respostas do formulário (GET). Retorna null se faltar algo obrigatório. */
export function parseGuideAnswers(params: Record<string, string | string[] | undefined>): GuideAnswers | null {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const posicao = one("posicao");
  const sensacao = one("sensacao") ?? "nao-sei";
  const pessoas = one("pessoas");
  const cama = one("cama");
  if (!posicao || !(SLEEP_POSITIONS as readonly string[]).includes(posicao)) return null;
  if (!(FEEL_PREFERENCES as readonly string[]).includes(sensacao)) return null;
  if (!pessoas || !(SLEEPERS as readonly string[]).includes(pessoas)) return null;
  return {
    posicao: posicao as SleepPosition,
    sensacao: sensacao as FeelPreference,
    pessoas: pessoas as Sleepers,
    cama: cama && (SIZE_KEYS as readonly string[]).includes(cama) ? (cama as SizeKey) : null,
  };
}

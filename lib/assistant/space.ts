import type { Product } from "@/lib/catalog/types";

/**
 * "Cabe no espaço?" — conta feita pelo SERVIDOR, nunca pelo modelo de IA.
 *
 * Compara o espaço informado pelo cliente com as medidas do catálogo, peça de
 * frente: largura com largura, profundidade com profundidade e, se informada,
 * altura com altura. Resposta determinística: cabe, cabe justo (menos de 10 cm
 * de folga em alguma medida) ou não cabe, com quantos cm sobram ou faltam.
 * Também sugere uma folga de circulação (recomendação, não regra).
 */

/** Folga abaixo disso (em alguma medida) = "cabe justo". */
export const TIGHT_FIT_CM = 10;
/** Circulação recomendada na frente (poltrona) ou atrás (cadeira). */
export const CIRCULATION_CM = 60;
/** Espaço menor que isso em cm não faz sentido para móvel: provavelmente veio em metros. */
const MIN_SPACE_CM = 10;
/** Mais de 30 m também não: provavelmente eram centímetros marcados como metros. */
const MAX_SPACE_CM = 3000;

export type SpaceUnit = "cm" | "m";

export type SpaceInput = {
  produto: string;
  largura: number;
  profundidade: number;
  altura?: number | null;
  unidade?: SpaceUnit;
};

type Dimension = "largura" | "profundidade" | "altura";

export type DimensionCheck = {
  medida: Dimension;
  espaco_cm: number;
  produto_cm: number;
  /** Positivo: sobra; negativo: falta. */
  diferenca_cm: number;
};

export type SpaceResult =
  | { status: "produto_nao_encontrado"; mensagem: string }
  | { status: "medida_invalida"; mensagem: string }
  | { status: "unidade_duvidosa"; mensagem: string }
  | { status: "sem_medidas_do_produto"; produto: string; faltando: Dimension[]; mensagem: string }
  | {
      status: "cabe" | "cabe_justo" | "nao_cabe";
      produto: string;
      comparacoes: DimensionCheck[];
      resumo: string;
      /** Altura informada, mas o catálogo não tem a altura da peça. */
      sem_altura_no_catalogo?: boolean;
      circulacao: { recomendacao: string; cabe_com_circulacao: boolean; diferenca_cm: number };
    };

const round1 = (n: number) => Math.round(n * 10) / 10;
export const formatCm = (n: number) => `${round1(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`;

const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

function kindOf(product: Pick<Product, "name">): "poltrona" | "cadeira" | "outro" {
  if (/^poltrona\b/i.test(product.name.trim())) return "poltrona";
  if (/^cadeira\b/i.test(product.name.trim())) return "cadeira";
  return "outro";
}

function differenceText(c: DimensionCheck): string {
  if (c.diferenca_cm === 0) return `${c.medida}: exato (${formatCm(c.produto_cm)})`;
  return c.diferenca_cm > 0
    ? `${c.medida}: sobram ${formatCm(c.diferenca_cm)} (espaço ${formatCm(c.espaco_cm)}, peça ${formatCm(c.produto_cm)})`
    : `${c.medida}: faltam ${formatCm(-c.diferenca_cm)} (espaço ${formatCm(c.espaco_cm)}, peça ${formatCm(c.produto_cm)})`;
}

export function verificarEspaco(product: Product | undefined, input: SpaceInput): SpaceResult {
  if (!product) return { status: "produto_nao_encontrado", mensagem: "Produto não encontrado no catálogo." };
  const factor = input.unidade === "m" ? 100 : 1;
  const altura = input.altura ?? null;
  if (!positive(input.largura) || !positive(input.profundidade) || (altura !== null && !positive(altura))) {
    return { status: "medida_invalida", mensagem: "As medidas do espaço precisam ser números maiores que zero." };
  }
  const space = {
    largura: round1(input.largura * factor),
    profundidade: round1(input.profundidade * factor),
    altura: altura === null ? null : round1(altura * factor),
  };
  const values = [space.largura, space.profundidade, space.altura].filter((v): v is number => v !== null);
  if (values.some((v) => v < MIN_SPACE_CM)) {
    return {
      status: "unidade_duvidosa",
      mensagem: `Medidas muito pequenas para centímetros (${values.join(" × ")}). Confirme com o cliente se estão em metros.`,
    };
  }
  if (values.some((v) => v > MAX_SPACE_CM)) {
    return {
      status: "unidade_duvidosa",
      mensagem: "Medidas grandes demais para um cômodo. Confirme com o cliente se estão em centímetros ou em metros.",
    };
  }

  const d = product.dimensions;
  const catalog: Record<Dimension, number | undefined> = { largura: d.widthCm, profundidade: d.lengthCm, altura: d.heightCm };
  const missing = (["largura", "profundidade"] as const).filter((k) => !positive(catalog[k]));
  if (missing.length) {
    return {
      status: "sem_medidas_do_produto",
      produto: product.name,
      faltando: missing,
      mensagem: `O catálogo ainda não tem ${missing.join(" e ")} de ${product.name}. Não dá para dizer se cabe.`,
    };
  }

  const dims: Dimension[] = ["largura", "profundidade"];
  const noHeight = space.altura !== null && !positive(catalog.altura);
  if (space.altura !== null && positive(catalog.altura)) dims.push("altura");
  const comparacoes = dims.map((medida) => {
    const espaco = space[medida]!;
    const produto = catalog[medida]!;
    return { medida, espaco_cm: espaco, produto_cm: produto, diferenca_cm: round1(espaco - produto) };
  });
  const tightest = Math.min(...comparacoes.map((c) => c.diferenca_cm));
  const status = tightest < 0 ? "nao_cabe" : tightest < TIGHT_FIT_CM ? "cabe_justo" : "cabe";

  const kind = kindOf(product);
  const where = kind === "cadeira" ? "atrás da cadeira, para puxar e sentar" : kind === "poltrona" ? "na frente da poltrona, para circular" : "em volta da peça, para circular";
  const depthLeft = round1(space.profundidade - catalog.profundidade! - CIRCULATION_CM);
  return {
    status,
    produto: product.name,
    comparacoes,
    resumo: [
      status === "nao_cabe" ? "Não cabe." : status === "cabe_justo" ? `Cabe justo (menos de ${formatCm(TIGHT_FIT_CM)} de folga).` : "Cabe.",
      ...comparacoes.map(differenceText),
    ].join(" "),
    ...(noHeight ? { sem_altura_no_catalogo: true } : {}),
    circulacao: {
      recomendacao: `Recomendação (não é regra): deixar cerca de ${formatCm(CIRCULATION_CM)} livres ${where}.`,
      cabe_com_circulacao: depthLeft >= 0,
      diferenca_cm: depthLeft,
    },
  };
}

/**
 * Texto da resposta da ferramenta para o modelo: JSON com as medidas sempre
 * acompanhadas da unidade ("10 cm"), para a trava contra números inventados
 * reconhecer cada número que o modelo repetir.
 */
export function spaceResultForModel(result: SpaceResult): string {
  if (!("comparacoes" in result)) return JSON.stringify(result);
  return JSON.stringify({
    ...result,
    comparacoes: result.comparacoes.map((c) => ({
      medida: c.medida,
      espaco: formatCm(c.espaco_cm),
      peca: formatCm(c.produto_cm),
      [c.diferenca_cm >= 0 ? "sobra" : "falta"]: formatCm(Math.abs(c.diferenca_cm)),
    })),
    circulacao: {
      recomendacao: result.circulacao.recomendacao,
      cabe_com_circulacao: result.circulacao.cabe_com_circulacao,
      [result.circulacao.diferenca_cm >= 0 ? "sobra_com_circulacao" : "falta_para_circulacao"]: formatCm(Math.abs(result.circulacao.diferenca_cm)),
    },
  });
}

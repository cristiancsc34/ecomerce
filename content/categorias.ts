import { SIZE_INFO, type SizeKey } from "@/lib/catalog/types";
import type { SectionKey } from "@/lib/catalog/sections";

/**
 * Textos das páginas de categoria (seções e subcategorias fixas). Só fatos:
 * a loja vende no Paraná, com saída de Maringá e frete grátis nas cidades
 * atendidas (decisão de 20/11/2026, issue #28). Medidas de colchão = tamanhos-
 * padrão do Brasil (SIZE_INFO). Nada de prazo, preço, avaliação ou "o melhor".
 *
 * Cada página tem título, resumo, H1 e introdução próprios (o Google trata
 * texto repetido entre páginas como conteúdo duplicado).
 */
export type ListingCopy = {
  /** Título da aba e do Google (o layout acrescenta " | AzConfort"). Até ~60 caracteres. */
  title: string;
  /** Resumo do Google. Até ~160 caracteres. */
  description: string;
  h1: string;
  /** Parágrafos da introdução, logo abaixo do H1. */
  intro: string[];
};

function cm(size: SizeKey): string {
  const s = SIZE_INFO[size];
  return `${s.widthCm} × ${s.lengthCm} cm`;
}

export const SECTION_COPY: Record<SectionKey, ListingCopy> = {
  colchoes: {
    title: "Colchões em Maringá e no Paraná",
    description:
      "Colchões solteiro, casal, queen e king com saída de Maringá e frete grátis para as cidades atendidas no Paraná. Compare os tamanhos e escolha o seu.",
    h1: "Colchões com entrega no Paraná",
    intro: [
      "Os colchões da AzConfort saem de Maringá e chegam com frete grátis às cidades atendidas no Paraná, como Londrina, Apucarana e Umuarama.",
      `Escolha pelo tamanho da sua cama: as medidas-padrão vão de ${cm("solteiro")} (solteiro) a ${cm("king")} (king). Meça a cama ou o box antes de decidir.`,
    ],
  },
  estofados: {
    title: "Sofás e estofados em Maringá e no Paraná",
    description:
      "Sofás de 2 e 3 lugares e outros estofados com saída de Maringá e frete grátis para as cidades atendidas no Paraná. Veja fotos de todos os ângulos.",
    h1: "Sofás e estofados com entrega no Paraná",
    intro: [
      "Sofás e estofados que saem de Maringá direto para a sua casa, com frete grátis nas cidades atendidas do Paraná.",
      "Antes de escolher, meça a parede onde o sofá vai ficar e o espaço livre na frente dele, e compare com as medidas na página de cada modelo.",
    ],
  },
  moveis: {
    title: "Móveis em Maringá e no Paraná",
    description:
      "Móveis para a sua casa com saída de Maringá e frete grátis para as cidades atendidas no Paraná. Veja cada peça de todos os ângulos e escolha a sua.",
    h1: "Móveis com entrega no Paraná",
    intro: [
      "Móveis para a sua casa, enviados de Maringá com frete grátis para as cidades atendidas no Paraná.",
      "Escolha por tipo e veja cada peça de todos os ângulos antes de decidir.",
    ],
  },
};

/** Textos das subcategorias fixas (chave = slug dentro da seção). */
export const FACET_COPY: Record<string, ListingCopy> = {
  solteiro: {
    title: "Colchão solteiro em Maringá e no Paraná",
    description: `Colchão solteiro (${cm("solteiro")}) com saída de Maringá e frete grátis para as cidades atendidas no Paraná. Veja os modelos.`,
    h1: "Colchão solteiro",
    intro: [
      `O colchão solteiro segue a medida-padrão de ${cm("solteiro")}. Se a cama tiver ${SIZE_INFO["solteiro-king"].widthCm} cm de largura, o tamanho certo é o solteiro king (${cm("solteiro-king")}).`,
    ],
  },
  "solteiro-king": {
    title: "Colchão solteiro king em Maringá e no Paraná",
    description: `Colchão solteiro king (${cm("solteiro-king")}) com saída de Maringá e frete grátis para as cidades atendidas no Paraná.`,
    h1: "Colchão solteiro king",
    intro: [
      `O solteiro king mede ${cm("solteiro-king")}: ${SIZE_INFO["solteiro-king"].widthCm - SIZE_INFO.solteiro.widthCm} cm mais largo e ${SIZE_INFO["solteiro-king"].lengthCm - SIZE_INFO.solteiro.lengthCm} cm mais comprido que o solteiro comum. Confira se a sua cama comporta essa medida.`,
    ],
  },
  casal: {
    title: "Colchão casal em Maringá e no Paraná",
    description: `Colchão casal (${cm("casal")}) com saída de Maringá e frete grátis para as cidades atendidas no Paraná. Veja os modelos disponíveis.`,
    h1: "Colchão casal",
    intro: [
      `O colchão casal segue a medida-padrão de ${cm("casal")}. Se a sua cama ou o seu box tiver ${SIZE_INFO.queen.widthCm} cm de largura, o tamanho certo é o queen.`,
    ],
  },
  queen: {
    title: "Colchão queen em Maringá e no Paraná",
    description: `Colchão queen (${cm("queen")}) com saída de Maringá e frete grátis para as cidades atendidas no Paraná. Veja os modelos disponíveis.`,
    h1: "Colchão queen",
    intro: [
      `O colchão queen mede ${cm("queen")}: ${SIZE_INFO.queen.widthCm - SIZE_INFO.casal.widthCm} cm mais largo e ${SIZE_INFO.queen.lengthCm - SIZE_INFO.casal.lengthCm} cm mais comprido que o casal. Ele pede uma cama ou um box queen.`,
    ],
  },
  king: {
    title: "Colchão king em Maringá e no Paraná",
    description: `Colchão king (${cm("king")}) com saída de Maringá e frete grátis para as cidades atendidas no Paraná. Veja os modelos disponíveis.`,
    h1: "Colchão king",
    intro: [
      `O king é o maior tamanho-padrão: ${cm("king")}. Ele pede uma cama ou um box king e espaço para circular em volta da cama.`,
    ],
  },
  "sofa-2-lugares": {
    title: "Sofá 2 lugares em Maringá e no Paraná",
    description:
      "Sofá de 2 lugares com saída de Maringá e frete grátis para as cidades atendidas no Paraná. Veja as medidas e as fotos de cada modelo.",
    h1: "Sofá 2 lugares",
    intro: [
      "O sofá de 2 lugares cabe em salas menores e varandas, e também combina com um sofá maior ou com poltronas na mesma sala.",
    ],
  },
  "sofa-3-lugares": {
    title: "Sofá 3 lugares em Maringá e no Paraná",
    description:
      "Sofá de 3 lugares com saída de Maringá e frete grátis para as cidades atendidas no Paraná. Compare as medidas e veja cada modelo de todos os ângulos.",
    h1: "Sofá 3 lugares",
    intro: [
      "O sofá de 3 lugares é para quem recebe a família ou quer espaço para deitar. Confira se a parede comporta o comprimento do modelo escolhido.",
    ],
  },
};

/** Frase de entrega das categorias do banco sem texto próprio para o Google. */
export const CATEGORY_DELIVERY_SENTENCE = "Saída de Maringá e frete grátis para as cidades atendidas no Paraná.";

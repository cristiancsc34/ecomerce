import { SIZE_INFO, type SizeKey } from "@/lib/catalog/types";

/**
 * Textos de SEO das categorias por slug (issue #31): valem enquanto a migração
 * 20261120000100_categorias_seo.sql não estiver aplicada, ou quando o campo do
 * painel estiver vazio. O que a equipe escrever no painel sempre tem
 * preferência.
 *
 * Regras: título variado no formato "{Categoria}: {atributos reais}", região
 * uma vez só (no resumo), nada de frete, prazo, preço, avaliação, garantia ou
 * número de vendas, sem travessão. As dicas são gerais (como escolher, medir,
 * cuidar); dado de produto só aparece na página do produto, quando confirmado.
 * Perguntas frequentes ficam só como texto visível (sem schema FAQPage).
 */
export type CategorySeo = {
  /** Título da aba e do Google (o layout acrescenta " | AzConfort"). */
  title: string;
  /** Resumo do Google, até 155 caracteres. */
  description: string;
  /** Texto da página (3 a 5 parágrafos). */
  content: string[];
  /** Perguntas frequentes, só como texto visível. */
  faq: { question: string; answer: string }[];
};

function cm(size: SizeKey): string {
  const s = SIZE_INFO[size];
  return `${s.widthCm} × ${s.lengthCm} cm`;
}

export const CATEGORY_SEO: Record<string, CategorySeo> = {
  colchoes: {
    title: "Colchões: solteiro, casal, queen e king",
    description:
      "Colchões solteiro, casal, queen e king para quem mora no Paraná. Compare as medidas-padrão e veja cada modelo em fotos de todos os ângulos.",
    content: [
      `Comece pela medida da cama ou do box. As medidas-padrão no Brasil são: solteiro ${cm("solteiro")}, solteiro king ${cm("solteiro-king")}, casal ${cm("casal")}, queen ${cm("queen")} e king ${cm("king")}.`,
      "A firmeza é uma escolha pessoal. Quando o modelo tem a firmeza informada, ela aparece na página do produto, numa escala que vai do macio ao firme.",
      "Some a altura do colchão à da cama ou do box para saber a altura final, e confira se ela fica confortável para sentar e levantar.",
      "Para conservar, siga os cuidados indicados na página de cada modelo e mantenha o colchão num lugar arejado.",
    ],
    faq: [
      {
        question: "Como sei qual tamanho comprar?",
        answer: "Meça a largura e o comprimento da cama ou do box e compare com as medidas-padrão acima. A medida de cada modelo também está na página do produto.",
      },
      {
        question: "Qual a diferença entre casal e queen?",
        answer: `O queen mede ${cm("queen")}: ${SIZE_INFO.queen.widthCm - SIZE_INFO.casal.widthCm} cm mais largo e ${SIZE_INFO.queen.lengthCm - SIZE_INFO.casal.lengthCm} cm mais comprido que o casal (${cm("casal")}). Ele pede uma cama ou um box queen.`,
      },
      {
        question: "Onde vejo os materiais e as camadas do colchão?",
        answer: "Na página de cada modelo, assim que forem confirmados. Material, camada e firmeza sem confirmação não são publicados.",
      },
    ],
  },
  sofas: {
    title: "Sofás: medidas e tecidos para a sua sala",
    description:
      "Sofás para a sua sala no Paraná. Veja cada modelo em fotos de todos os ângulos e confira medidas e tecido antes de escolher.",
    content: [
      "Antes de escolher, meça a parede onde o sofá vai ficar e deixe espaço para circular na frente dele. Compare com a largura e a profundidade informadas na página de cada modelo.",
      "O número de lugares ajuda na escolha: sofás de 2 lugares cabem melhor em salas menores, e os de 3 lugares acomodam mais gente. A largura exata muda de um modelo para outro.",
      "No tecido, pense na rotina da casa: com crianças ou animais, vale um tecido fácil de limpar. O tecido de cada modelo aparece na página do produto quando confirmado.",
      "Nos modelos com o selo 3D, dá para girar o sofá na tela e ver todos os lados antes de decidir.",
    ],
    faq: [
      {
        question: "Como sei se o sofá cabe na minha sala?",
        answer: "Meça a parede e o espaço livre na frente dela e compare com as medidas da página do produto, deixando espaço para circular.",
      },
      {
        question: "Posso ver o sofá de todos os lados?",
        answer: "Veja todas as fotos na página do produto. Nos modelos com o selo 3D, você também gira a peça na tela para ver todos os lados.",
      },
      {
        question: "Onde vejo o tecido e as medidas?",
        answer: "Na página de cada modelo. Se o tecido ou a medida ainda não foram confirmados, eles ficam de fora até a confirmação.",
      },
    ],
  },
  poltronas: {
    title: "Poltronas: conforto, medidas e tecidos",
    description:
      "Poltronas para a sala, o quarto ou o canto de leitura, para casas do Paraná. Veja de todos os ângulos e confira medidas e tecido de cada modelo.",
    content: [
      "Uma poltrona funciona sozinha num canto de leitura ou ao lado do sofá. Meça o espaço disponível e compare com a largura e a profundidade de cada modelo.",
      "Repare na altura do encosto e do assento: encosto alto apoia melhor a cabeça, e assento mais baixo deixa a postura mais relaxada.",
      "O tecido e a estrutura de cada modelo aparecem na página do produto quando confirmados.",
      "Com o selo 3D, você gira a poltrona na tela e, no celular, pode vê-la no seu ambiente pela câmera.",
    ],
    faq: [
      {
        question: "Como escolher o tamanho da poltrona?",
        answer: "Meça o canto onde ela vai ficar e compare com a largura e a profundidade informadas na página do modelo. Deixe espaço para levantar com conforto.",
      },
      {
        question: "Dá para ver a poltrona no meu ambiente?",
        answer: "Nos modelos com o selo 3D, sim: no celular, toque em Ver no seu ambiente para abrir a câmera com a peça.",
      },
      {
        question: "Onde vejo o tecido e a estrutura?",
        answer: "Na página de cada modelo, quando confirmados pela equipe.",
      },
    ],
  },
  mesas: {
    title: "Mesas: formatos, medidas e materiais",
    description:
      "Mesas para a sua casa, aqui no Paraná. Compare formato e medidas e veja cada modelo em fotos de todos os ângulos antes de escolher.",
    content: [
      "Para a mesa de jantar, meça o ambiente e deixe espaço em volta para puxar as cadeiras e circular.",
      "Mesas redondas facilitam a conversa e a circulação em espaços menores; as retangulares costumam acomodar mais lugares em salas compridas.",
      "Medidas e materiais de cada modelo aparecem na página do produto quando confirmados.",
    ],
    faq: [
      {
        question: "Como escolher o tamanho da mesa?",
        answer: "Meça o ambiente e compare com as medidas da página do modelo, deixando espaço em volta para as cadeiras.",
      },
      {
        question: "Redonda ou retangular?",
        answer: "A redonda ajuda em espaços menores e na circulação; a retangular costuma acomodar mais lugares em salas compridas.",
      },
      {
        question: "Onde vejo o material do tampo?",
        answer: "Na página de cada modelo, quando o material estiver confirmado.",
      },
    ],
  },
  cadeiras: {
    title: "Cadeiras: assentos, medidas e acabamentos",
    description:
      "Cadeiras para a sala de jantar e outros ambientes, para quem é do Paraná. Veja de todos os ângulos e confira medidas e acabamento de cada modelo.",
    content: [
      "Confira a altura do assento em relação à mesa: precisa sobrar espaço para as pernas entre o assento e o tampo.",
      "Com mesa pequena, cadeiras sem braço ocupam menos espaço e entram por inteiro embaixo do tampo.",
      "Medidas, material e acabamento de cada modelo aparecem na página do produto quando confirmados.",
    ],
    faq: [
      {
        question: "Quantas cadeiras cabem na minha mesa?",
        answer: "Depende da largura de cada cadeira e do tamanho do tampo. Compare as medidas da página do modelo com as da sua mesa.",
      },
      {
        question: "Posso ver a cadeira de todos os lados?",
        answer: "Veja todas as fotos na página do produto; nos modelos com o selo 3D, dá para girar a cadeira na tela.",
      },
      {
        question: "Onde vejo o material e o acabamento?",
        answer: "Na página de cada modelo, depois de confirmados pela equipe.",
      },
    ],
  },
};

export function categorySeo(slug: string): CategorySeo | null {
  return CATEGORY_SEO[slug] ?? null;
}

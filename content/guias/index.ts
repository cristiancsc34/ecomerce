import { SIZE_INFO, type SizeKey } from "@/lib/catalog/types";

/**
 * Guias de compra (issue #31; textos escritos a pedido do Cristian em
 * 20/11/2026 para as buscas de colchão, sofá, estofado e poltrona no Paraná).
 *
 * Regras: só dica geral e verdadeira (como medir, como escolher, como cuidar)
 * e o que a loja de fato tem hoje (3D e "Ver no seu ambiente" nos produtos
 * com o selo, políticas publicadas). Nada de frete, prazo, lista de
 * cidades (ainda não aprovada, issue #28), preço, avaliação, garantia, número
 * de vendas, "o melhor" nem travessão. Dado de produto (medida, material,
 * firmeza) fica na página do produto.
 *
 * Para publicar um guia novo, acrescente um objeto na lista `GUIAS`.
 */
export type GuiaSecao = { heading: string; paragraphs: string[] };

export type Guia = {
  slug: string;
  /** Título da aba, do Google e o H1 (o layout acrescenta " | AzConfort"). */
  title: string;
  /** Resumo do Google, até 155 caracteres. */
  description: string;
  /** Slug da categoria a que o guia leva (ex.: "colchoes"); sem categoria, guia geral. */
  categorySlug?: string;
  /** Nome de quem escreveu (obrigatório para o JSON-LD Article). */
  author: string;
  /** Datas no formato AAAA-MM-DD. */
  datePublished: string;
  dateModified: string;
  /** Abertura do texto. */
  intro: string[];
  /** Seções com subtítulo (H2). */
  sections: GuiaSecao[];
};

const AUTOR = "Equipe AzConfort";
const DATA = "2026-11-20";

function cm(size: SizeKey): string {
  const s = SIZE_INFO[size];
  return `${s.widthCm} × ${s.lengthCm} cm`;
}

export const GUIAS: readonly Guia[] = [
  {
    slug: "como-escolher-o-tamanho-do-colchao",
    title: "Como escolher o tamanho do colchão",
    description:
      "Solteiro, solteiro king, casal, queen ou king: veja as medidas-padrão e como medir a cama ou o box antes de comprar o colchão.",
    categorySlug: "colchoes",
    author: AUTOR,
    datePublished: DATA,
    dateModified: DATA,
    intro: [
      "Antes de pensar em firmeza ou material, confira o tamanho. Um colchão que não bate com a cama ou com o box fica sobrando nas bordas ou deixa um vão nas laterais.",
    ],
    sections: [
      {
        heading: "As medidas-padrão no Brasil",
        paragraphs: [
          `Os colchões seguem cinco tamanhos-padrão: solteiro (${cm("solteiro")}), solteiro king (${cm("solteiro-king")}), casal (${cm("casal")}), queen (${cm("queen")}) e king (${cm("king")}).`,
          `Do casal para o queen, o colchão ganha ${SIZE_INFO.queen.widthCm - SIZE_INFO.casal.widthCm} cm de largura e ${SIZE_INFO.queen.lengthCm - SIZE_INFO.casal.lengthCm} cm de comprimento. Do queen para o king, mais ${SIZE_INFO.king.widthCm - SIZE_INFO.queen.widthCm} cm de largura e ${SIZE_INFO.king.lengthCm - SIZE_INFO.queen.lengthCm} cm de comprimento.`,
        ],
      },
      {
        heading: "Como medir a cama ou o box",
        paragraphs: [
          "Meça a parte interna da cama, onde o colchão encaixa, ou o tampo do box: de um lado ao outro e da cabeceira aos pés. Anote as duas medidas em centímetros.",
          "Compare com as medidas-padrão acima e com a medida informada na página de cada modelo antes de escolher.",
        ],
      },
      {
        heading: "Quem vai dormir na cama",
        paragraphs: [
          `Para uma pessoa, o solteiro resolve na maioria dos quartos. Quem é mais alto ou gosta de mais espaço pode olhar o solteiro king, que tem ${SIZE_INFO["solteiro-king"].lengthCm} cm de comprimento.`,
          "Para duas pessoas, compare casal, queen e king. Cada tamanho dá mais espaço que o anterior, mas também pede uma cama ou um box do mesmo tamanho e mais espaço no quarto.",
        ],
      },
      {
        heading: "Confira a altura e o espaço do quarto",
        paragraphs: [
          "Some a altura do colchão à da cama ou do box para saber a altura final, e veja se ela fica confortável para sentar e levantar.",
          "Deixe espaço para circular em volta da cama e para abrir portas de armário e janelas.",
        ],
      },
      {
        heading: "Antes de fechar a compra",
        paragraphs: [
          "Na página de cada colchão estão as medidas e, quando informados, a firmeza e os materiais. Se faltar alguma informação, fale com o atendimento antes de comprar.",
        ],
      },
    ],
  },
  {
    slug: "comprar-colchao-online-no-parana",
    title: "Comprar colchão online no Paraná: o que conferir",
    description:
      "Checklist para comprar colchão pela internet no Paraná: medidas, informações do modelo, fotos, entrega no seu endereço e política de trocas.",
    categorySlug: "colchoes",
    author: AUTOR,
    datePublished: DATA,
    dateModified: DATA,
    intro: [
      "Comprar colchão pela internet poupa tempo, mas pede atenção a alguns detalhes que numa loja física você veria na hora. Use esta lista antes de fechar o pedido.",
    ],
    sections: [
      {
        heading: "1. O tamanho certo para a sua cama",
        paragraphs: [
          "Meça a cama ou o box e compare com a medida do colchão. Se estiver em dúvida entre dois tamanhos, veja o guia de como escolher o tamanho do colchão.",
        ],
      },
      {
        heading: "2. As informações do modelo",
        paragraphs: [
          "Leia a página do produto até o fim: medidas, firmeza e materiais, quando informados. Desconfie de anúncio sem medida ou com descrição vaga.",
        ],
      },
      {
        heading: "3. As fotos do produto",
        paragraphs: [
          "Fotos de frente, de lado e de costas ajudam a ver o acabamento e a altura do colchão. Antes de comprar, veja todas as fotos na página do produto.",
        ],
      },
      {
        heading: "4. Se a loja entrega na sua cidade",
        paragraphs: [
          "Antes de comprar, confira se a loja entrega no seu endereço. A AzConfort vende para clientes do Paraná; se tiver dúvida sobre a sua cidade, fale com o atendimento antes de fechar o pedido.",
        ],
      },
      {
        heading: "5. A política de trocas e devoluções",
        paragraphs: [
          "Leia a política de trocas antes de comprar. Em compras feitas pela internet, o Código de Defesa do Consumidor garante o direito de arrependimento, além da garantia legal contra defeitos.",
        ],
      },
    ],
  },
  {
    slug: "como-medir-a-sala-antes-de-comprar-um-sofa",
    title: "Como medir a sala antes de comprar um sofá",
    description:
      "Passo a passo para medir a parede, a profundidade e a circulação da sala e escolher um sofá que caiba sem apertar o ambiente.",
    categorySlug: "sofas",
    author: AUTOR,
    datePublished: DATA,
    dateModified: DATA,
    intro: [
      "O sofá costuma ser a maior peça da sala. Medir antes evita o susto de um sofá que tapa a passagem ou fica pequeno demais para a parede.",
    ],
    sections: [
      {
        heading: "Meça a parede",
        paragraphs: [
          "Meça a largura da parede onde o sofá vai ficar. Desconte o espaço de portas, janelas e tomadas que precisam continuar livres, e pense se quer uma mesa lateral ou uma luminária ao lado.",
        ],
      },
      {
        heading: "Meça a profundidade e a circulação",
        paragraphs: [
          "Meça a distância entre a parede e o que fica na frente do sofá, como o rack ou a mesa de centro. O sofá ocupa parte desse espaço, e é preciso sobrar uma passagem confortável na frente dele.",
        ],
      },
      {
        heading: "Desenhe o sofá no chão",
        paragraphs: [
          "Com fita crepe, marque no chão a largura e a profundidade do modelo que você está olhando. Assim dá para ver o espaço que ele ocupa e testar a passagem antes de comprar.",
        ],
      },
      {
        heading: "Confira portas e corredores",
        paragraphs: [
          "Meça também a largura das portas e dos corredores por onde o sofá vai passar até a sala.",
        ],
      },
      {
        heading: "Compare com a página do modelo",
        paragraphs: [
          "Na página de cada sofá estão a largura, a profundidade e a altura, quando informadas. Nos modelos com o selo 3D, o botão Ver no seu ambiente mostra o sofá na sua sala pela câmera do celular.",
        ],
      },
    ],
  },
  {
    slug: "sofa-de-2-ou-3-lugares-como-decidir",
    title: "Sofá de 2 ou 3 lugares: como decidir",
    description:
      "Veja como o tamanho da sala, o número de pessoas e o uso do dia a dia ajudam a escolher entre um sofá de 2 e um de 3 lugares.",
    categorySlug: "sofas",
    author: AUTOR,
    datePublished: DATA,
    dateModified: DATA,
    intro: [
      "Dois ou três lugares? A resposta depende menos do sofá e mais da sua sala e da sua rotina.",
    ],
    sections: [
      {
        heading: "Comece pelo espaço",
        paragraphs: [
          "Em salas menores e apartamentos compactos, o sofá de 2 lugares deixa a circulação mais livre. Em salas maiores, o de 3 lugares preenche melhor a parede. Meça antes: o guia de como medir a sala mostra o passo a passo.",
        ],
      },
      {
        heading: "Pense em quem usa a sala",
        paragraphs: [
          "Conte quantas pessoas costumam sentar juntas e se você recebe visitas com frequência. Se gosta de deitar no sofá para ver um filme, o de 3 lugares costuma ser mais confortável para isso.",
        ],
      },
      {
        heading: "Combine peças",
        paragraphs: [
          "Um sofá de 2 lugares com uma poltrona ao lado acomoda bem três pessoas e deixa a sala mais flexível. Em ambientes grandes, um sofá de 3 lugares com um de 2 forma um canto de conversa.",
        ],
      },
      {
        heading: "Confira a largura de cada modelo",
        paragraphs: [
          "O número de lugares é só uma referência: a largura muda de um modelo para outro. Confira sempre a medida na página do produto antes de decidir.",
        ],
      },
    ],
  },
  {
    slug: "como-cuidar-do-estofado-no-dia-a-dia",
    title: "Como cuidar do estofado no dia a dia",
    description:
      "Dicas simples para conservar o tecido do sofá e da poltrona: limpeza leve, cuidado com manchas e sol e atenção às orientações do produto.",
    categorySlug: "sofas",
    author: AUTOR,
    datePublished: DATA,
    dateModified: DATA,
    intro: [
      "Sofás e poltronas estofados duram mais quando recebem um cuidado leve e frequente, em vez de uma faxina pesada de vez em quando.",
    ],
    sections: [
      {
        heading: "Limpeza leve e frequente",
        paragraphs: [
          "Passe o aspirador com bocal de escova ou uma escova macia no tecido regularmente. Isso tira o pó que, com o tempo, deixa o tecido opaco.",
        ],
      },
      {
        heading: "Manchas: aja rápido, sem esfregar",
        paragraphs: [
          "Se algo cair no estofado, retire o excesso com um pano limpo e seco, pressionando sem esfregar. Antes de usar qualquer produto de limpeza, teste numa parte escondida e siga as orientações de cuidado do fabricante.",
        ],
      },
      {
        heading: "Cuidado com o sol",
        paragraphs: [
          "A luz do sol direta pode desbotar o tecido com o tempo. Se o sofá fica perto de uma janela, use cortina ou persiana nos horários de sol forte.",
        ],
      },
      {
        heading: "Almofadas e assentos",
        paragraphs: [
          "Afofe e troque de lugar as almofadas soltas de vez em quando, para o uso ficar distribuído e o estofado não marcar sempre no mesmo ponto.",
        ],
      },
      {
        heading: "Os cuidados de cada modelo",
        paragraphs: [
          "Cada tecido pede um cuidado. Quando informados, os cuidados aparecem na página do produto; na dúvida, fale com o atendimento.",
        ],
      },
    ],
  },
  {
    slug: "como-escolher-uma-poltrona",
    title: "Como escolher uma poltrona para a sala ou o quarto",
    description:
      "Encosto, assento, braços e tecido: o que observar para escolher a poltrona certa para a sala, o quarto ou o canto de leitura.",
    categorySlug: "poltronas",
    author: AUTOR,
    datePublished: DATA,
    dateModified: DATA,
    intro: [
      "Uma boa poltrona vira o lugar preferido da casa. Para acertar, pense primeiro em como você vai usá-la.",
    ],
    sections: [
      {
        heading: "Para que ela vai servir",
        paragraphs: [
          "Para ler ou descansar, procure uma poltrona com encosto alto. Para completar o sofá na sala, uma poltrona mais compacta deixa a circulação livre. No quarto, ela pode servir de apoio para trocar de roupa ou calçar os sapatos.",
        ],
      },
      {
        heading: "Encosto e assento",
        paragraphs: [
          "Encosto alto apoia melhor a cabeça e o pescoço. Assento mais fundo convida a relaxar; assento mais raso e mais alto facilita sentar e levantar.",
        ],
      },
      {
        heading: "Braços e espaço em volta",
        paragraphs: [
          "Braços largos dão apoio, mas ocupam espaço. Meça o canto onde a poltrona vai ficar e compare com a largura e a profundidade do modelo.",
        ],
      },
      {
        heading: "Tecido e cor",
        paragraphs: [
          "Em casas com crianças ou animais, vale um tecido fácil de limpar. Uma poltrona colorida pode ser o destaque da sala sem precisar trocar o sofá.",
        ],
      },
      {
        heading: "Veja no seu ambiente",
        paragraphs: [
          "Nos modelos com o selo 3D, dá para girar a poltrona na tela e, no celular, tocar em Ver no seu ambiente para vê-la na sua casa pela câmera.",
        ],
      },
    ],
  },
  {
    slug: "como-escolher-a-mesa-de-jantar",
    title: "Como escolher a mesa de jantar",
    description:
      "Formato, tamanho e espaço em volta: como escolher a mesa de jantar certa para o ambiente e saber quantas cadeiras cabem com conforto.",
    categorySlug: "mesas",
    author: AUTOR,
    datePublished: DATA,
    dateModified: DATA,
    intro: [
      "A mesa de jantar precisa caber no ambiente com as cadeiras puxadas, não só encostadas. Por isso a medida do espaço vem antes da escolha do modelo.",
    ],
    sections: [
      {
        heading: "Meça o ambiente",
        paragraphs: [
          "Meça o espaço onde a mesa vai ficar, de parede a parede ou até os outros móveis. Lembre que, com alguém sentado, a cadeira vai para trás.",
        ],
      },
      {
        heading: "Deixe espaço para as cadeiras e a passagem",
        paragraphs: [
          "Em volta da mesa, é preciso sobrar espaço para puxar a cadeira, sentar e ainda passar por trás de quem está sentado.",
        ],
      },
      {
        heading: "Redonda, quadrada ou retangular",
        paragraphs: [
          "Mesas redondas facilitam a conversa e a circulação em espaços menores. Quadradas funcionam bem para até quatro pessoas. Retangulares acomodam mais lugares em salas compridas.",
        ],
      },
      {
        heading: "Quantas cadeiras cabem",
        paragraphs: [
          "Depende da largura de cada cadeira e do tamanho do tampo. Compare as medidas das cadeiras com as da mesa e deixe uma folga entre elas para ninguém ficar apertado.",
        ],
      },
      {
        heading: "Material do tampo",
        paragraphs: [
          "Cada material pede um cuidado diferente no dia a dia. O material e os cuidados de cada modelo aparecem na página do produto quando confirmados.",
        ],
      },
    ],
  },
  {
    slug: "ver-o-movel-no-seu-ambiente-com-3d",
    title: "Como ver o móvel na sua casa antes de comprar",
    description:
      "Nos produtos com o selo 3D, gire a peça na tela e use a câmera do celular para ver o móvel no seu ambiente antes de escolher.",
    author: AUTOR,
    datePublished: DATA,
    dateModified: DATA,
    intro: [
      "Uma das maiores dúvidas de quem compra móveis pela internet é como a peça vai ficar em casa. Na AzConfort, os produtos com o selo 3D ajudam a responder isso antes da compra.",
    ],
    sections: [
      {
        heading: "Girar em 3D",
        paragraphs: [
          "Na página do produto, toque em Girar em 3D para trocar a foto por um modelo que você gira e aproxima com o dedo ou o mouse. O modelo é ilustrativo: proporções e cores são aproximadas e não substituem as fotos e as medidas.",
        ],
      },
      {
        heading: "Ver no seu ambiente",
        paragraphs: [
          "No celular, toque em Ver no seu ambiente. A câmera abre e mostra o produto no lugar para onde você apontar, como se ele já estivesse na sua sala ou no seu quarto.",
          "No Android, a câmera abre pelo visualizador do Google; no iPhone, pelo visualizador da Apple. Se o seu aparelho não abrir a câmera, você ainda pode girar o produto em 3D na tela.",
        ],
      },
      {
        heading: "No computador",
        paragraphs: [
          "No computador, o botão mostra um código QR. Aponte a câmera do celular para o código e a mesma página abre no celular, pronta para ver o produto no seu ambiente.",
        ],
      },
      {
        heading: "Dica para usar bem",
        paragraphs: [
          "Use o 3D junto com a fita métrica: confira as medidas da página do produto e veja no seu ambiente se a peça combina com o espaço e com os outros móveis.",
        ],
      },
    ],
  },
];

export function guiaBySlug(slug: string): Guia | null {
  return GUIAS.find((g) => g.slug === slug) ?? null;
}

/** Até 3 guias de uma categoria (para a página da categoria). */
export function guiasDaCategoria(categorySlug: string, limit = 3): Guia[] {
  return GUIAS.filter((g) => g.categorySlug === categorySlug).slice(0, limit);
}

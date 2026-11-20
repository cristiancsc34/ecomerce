/**
 * Páginas locais das principais cidades atendidas (todas da lista de frete
 * grátis em lib/shipping/served-cities.ts). Cada cidade tem texto próprio:
 * nada de página repetida trocando só o nome (o Google trata isso como
 * conteúdo duplicado). Os testes conferem que os textos não se repetem e que
 * toda cidade citada está na lista atendida.
 *
 * Só fatos: venda só no Paraná, saída de Maringá, frete grátis nas cidades
 * atendidas (issue #28), entrega por transportadora. Sem prazo, horário,
 * endereço de loja ou número de vendas — a loja ainda não tem esses dados.
 * TODO(Cristian): prazo de entrega por cidade, quando houver.
 */
export type CityPage = {
  slug: string;
  /** Nome com acento, igual ao da lista atendida. */
  name: string;
  uf: "PR";
  title: string;
  description: string;
  h1: string;
  /** Introdução exclusiva da cidade. */
  intro: string[];
  /** Como a entrega chega nesta cidade (exclusivo da cidade). */
  delivery: string;
  /** Cidades próximas que também estão na lista atendida. */
  nearby: string[];
  /** Data da última revisão do texto (sitemap). */
  updatedAt: string;
};

export const CITY_PAGES: readonly CityPage[] = [
  {
    slug: "maringa",
    name: "Maringá",
    uf: "PR",
    title: "Colchões, sofás e móveis em Maringá com frete grátis",
    description:
      "Compre colchões, sofás e móveis online com frete grátis em Maringá. Os pedidos da AzConfort saem da própria cidade. Veja como funciona a entrega.",
    h1: "Colchões, sofás e móveis com frete grátis em Maringá",
    intro: [
      "A AzConfort despacha os pedidos a partir de Maringá. Para quem mora na cidade, isso quer dizer compra pelo site com frete grátis e entrega que sai daqui mesmo, sem depender de envio de outro estado.",
      "Do mesmo ponto de saída, os pedidos seguem para as outras cidades atendidas no Paraná, de Sarandi e Paiçandu, aqui do lado, até o Norte Pioneiro e o Noroeste do estado.",
    ],
    delivery:
      "Em Maringá, o pedido não viaja de outra região: ele sai da cidade direto para o endereço informado na compra.",
    nearby: ["Sarandi", "Paiçandu", "Marialva", "Mandaguaçu", "Mandaguari", "Iguaraçu", "Astorga", "Nova Esperança", "Jandaia do Sul"],
    updatedAt: "2026-11-20",
  },
  {
    slug: "londrina",
    name: "Londrina",
    uf: "PR",
    title: "Colchões, sofás e móveis em Londrina com frete grátis",
    description:
      "Colchões, sofás e móveis com frete grátis para Londrina e cidades vizinhas, como Cambé, Ibiporã e Rolândia. Os pedidos saem de Maringá.",
    h1: "Colchões, sofás e móveis com frete grátis em Londrina",
    intro: [
      "Londrina está na lista de cidades atendidas pela AzConfort: quem mora aqui compra pelo site e recebe em casa sem pagar frete.",
      "Na região de Londrina, o frete também é grátis em Cambé, Ibiporã, Rolândia, Tamarana e Jataizinho, e um pouco mais adiante em Arapongas e Apucarana.",
    ],
    delivery:
      "Para Londrina, o pedido sai de Maringá e segue por transportadora até o seu endereço; o frete continua por conta da loja.",
    nearby: ["Cambé", "Ibiporã", "Rolândia", "Tamarana", "Jataizinho", "Arapongas", "Apucarana"],
    updatedAt: "2026-11-20",
  },
];

export function cityPageBySlug(slug: string): CityPage | null {
  return CITY_PAGES.find((c) => c.slug === slug) ?? null;
}

/** Hub de entrega (/entrega). */
export const DELIVERY_HUB = {
  title: "Entrega no Paraná: cidades atendidas com frete grátis",
  description:
    "Veja as cidades do Paraná onde a AzConfort entrega com frete grátis. Os pedidos saem de Maringá. Confira a lista completa e como funciona a entrega.",
  h1: "Cidades atendidas no Paraná",
  updatedAt: "2026-11-20",
} as const;

/**
 * Passo a passo da entrega (igual em todas as páginas de cidade, por isso fica
 * num bloco só e sem o nome da cidade). Depende da issue #28 (CEP confere a
 * cidade no fechamento do pedido) estar no ar no lançamento.
 */
export const DELIVERY_STEPS: readonly string[] = [
  "Escolha o produto e coloque na sacola.",
  "Ao fechar o pedido, informe o CEP do endereço de entrega: o site confere se a cidade está na lista atendida e, se estiver, o frete sai grátis.",
  "O pedido sai de Maringá e vai por transportadora até o endereço informado.",
  "Acompanhe o pedido em “Acompanhar pedido”, com o número do pedido e o celular usado na compra.",
];

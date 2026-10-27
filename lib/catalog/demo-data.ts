/**
 * Catálogo de DEMONSTRAÇÃO.
 *
 * Usado só quando o catálogo roda em modo demonstração (sem Supabase ou com
 * CATALOG_SOURCE=demo). Tem apenas os dois produtos reais da loja, cadastrados
 * pelo estúdio do painel a partir das fotos do dono:
 * - fotos de catálogo recriadas a partir das fotos reais e conferidas com elas;
 * - nome e textos sugeridos pela IA só com o que aparece nas fotos;
 * - modelo 3D (quando já gerado);
 * - SEM preço, medidas ou materiais: ainda não foram confirmados.
 *
 * Continuam marcados com `isDemo: true` (nunca são publicados por aqui). As
 * mídias foram exportadas do estúdio para `public/demo`.
 */
import type { Category, Product, ProductMedia } from "./types";

export const DEMO_CATEGORY: Category = {
  id: "00000000-0000-4000-8000-000000000002",
  slug: "cadeiras",
  name: "Cadeiras e poltronas",
  description: "Cadeiras e poltronas com fotos de todos os ângulos e visualização em 3D.",
  sortOrder: 1,
  requires3d: true,
};

export const DEMO_CATEGORIES: Category[] = [DEMO_CATEGORY];

const category = { id: DEMO_CATEGORY.id, slug: DEMO_CATEGORY.slug, name: DEMO_CATEGORY.name, requires3d: true };

const VIEWS = [
  { key: "frente", label: "vista frontal" },
  { key: "tres-quartos", label: "vista três-quartos" },
  { key: "lateral", label: "vista lateral" },
  { key: "traseira", label: "vista traseira" },
] as const;

/** As 4 fotos de catálogo (mesmos ângulos para todos os produtos), já aprovadas. */
function catalogPhotos(file: string, label: string, ids: string[]): ProductMedia[] {
  return VIEWS.map((view, i) => ({
    id: ids[i],
    type: "image",
    url: `/demo/${file}-${view.key}.jpg`,
    storagePath: `demo/${file}-${view.key}.jpg`,
    altText: `${label}, ${view.label} (imagem de catálogo feita a partir das fotos reais)`,
    sortOrder: i,
    isPrimary: i === 0,
    isIllustrative: false,
    aiGenerated: true,
    pendingReview: false,
    width: 1600,
    height: 1200,
  }));
}

const PREVIEW_NOTE = "Prévia em ambiente demonstrativo: preço e medidas ainda não foram confirmados.";

const BASE = {
  category,
  status: "draft",
  isDemo: true,
  priceCents: null,
  compareAtPriceCents: null,
  currency: "BRL",
  sku: null,
  stockQuantity: null,
  dimensions: {},
  attributes: {},
  faq: [],
  publishedAt: null,
  variants: [],
} satisfies Partial<Product>;

export const DEMO_PRODUCTS: Product[] = [
  {
    ...BASE,
    id: "dcdaee90-64b9-4b91-832b-f5049a237cb9",
    slug: "poltrona-azul",
    name: "Poltrona Azul Estrutura Clara",
    shortDescription:
      "Poltrona azul com encosto alto e estrutura em tom de madeira clara, para deixar o ambiente mais acolhedor.",
    description: [
      "Esta poltrona azul tem encosto alto e almofadas com costuras marcadas, que criam um visual aconchegante e moderno. O assento é amplo e o apoio de cabeça prolonga o conforto por todo o corpo.",
      "A estrutura em tom de madeira clara traz leveza e combina facilmente com diferentes estilos de decoração. Os braços curvos e a base contínua completam o design, ideal para sala, quarto ou cantinho de leitura.",
      "Vista de todos os lados, a peça mantém o mesmo cuidado nos detalhes, com acabamento uniforme e linhas suaves, perfeita para quem busca um ponto de cor elegante no ambiente.",
      PREVIEW_NOTE,
    ].join("\n\n"),
    seoTitle: "Poltrona azul com estrutura em tom de madeira clara",
    seoDescription:
      "Poltrona azul com encosto alto, almofadas pespontadas e estrutura em tom de madeira clara. Design acolhedor para sala, quarto ou cantinho de leitura.",
    createdAt: "2026-10-27T20:38:53.607Z",
    updatedAt: "2026-10-27T20:43:37.011Z",
    media: [
      ...catalogPhotos("poltrona-azul", "Poltrona azul", [
        "f6a40ce8-2e34-43a7-9131-89db826e0a49",
        "77083c14-d97c-4f4a-9e35-e4aa6a97abd4",
        "1c392a8d-8d41-408f-9377-c37c8e3de843",
        "014e264f-4ccb-4b60-906e-c44f16607ee3",
      ]),
      {
        id: "2d568bb6-f0fd-4795-96df-10e50e010717",
        type: "model_3d",
        url: "/demo/poltrona-azul.glb",
        storagePath: "demo/poltrona-azul.glb",
        altText: "Modelo 3D da Poltrona Azul Estrutura Clara, gerado por IA a partir das fotos.",
        sortOrder: 4,
        isPrimary: false,
        isIllustrative: true,
        aiGenerated: false,
        pendingReview: false,
        width: null,
        height: null,
      },
    ],
  },
  {
    ...BASE,
    id: "6a6d2382-8b27-45ea-a6b6-9d2355929985",
    slug: "cadeira-cinza-trama",
    name: "Cadeira Cinza Trama",
    shortDescription: "Cadeira cinza com assento acolchoado em losangos e base em tom de madeira.",
    description: [
      "A Cadeira Cinza Trama se destaca pelo estofado em tom cinza com pespontos em formato de losangos na parte frontal. O assento e o encosto formam uma peça única levemente curvada, trazendo um visual moderno e aconchegante.",
      "A base conta com quatro pés inclinados em tom de madeira, que dão leveza e deixam a cadeira bem atual. Ideal para compor salas de jantar, cantos de leitura ou home office com um toque discreto e elegante.",
      PREVIEW_NOTE,
    ].join("\n\n"),
    seoTitle: "Cadeira cinza com estofado em losangos e base em tom de madeira",
    seoDescription:
      "Cadeira cinza com estofado em losangos e base em tom de madeira. Visual moderno e aconchegante para sala de jantar ou home office.",
    createdAt: "2026-10-27T21:11:00.000Z",
    updatedAt: "2026-10-27T21:15:00.000Z",
    media: catalogPhotos("cadeira-cinza", "Cadeira cinza", [
      "7efa4d69-eaef-4913-a1d0-62918e2f61f6",
      "105e813e-bfd4-4763-bca5-547f2626ca5e",
      "60fa4d4b-8e46-4f99-939e-b2c22d6b1481",
      "1279f5c0-d669-440d-af71-7bdeec037ce3",
    ]),
  },
];

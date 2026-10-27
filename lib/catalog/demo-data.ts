/**
 * Catálogo de DEMONSTRAÇÃO.
 *
 * Usado só quando o catálogo roda em modo demonstração (sem Supabase ou com
 * CATALOG_SOURCE=demo). Os nomes "Nuvem Essencial", "Brisa Premium" e
 * "Sereno Híbrido" são placeholders do protótipo, não produtos confirmados.
 *
 * Tudo aqui é ILUSTRATIVO e marcado com `isDemo: true`:
 * - preços servem apenas para testar filtros, ordenação e carrinho;
 * - firmeza e altura servem para testar filtros e a escala de firmeza;
 * - larguras/comprimentos seguem os tamanhos-padrão brasileiros;
 * - materiais, camadas, garantia e cuidados ficam VAZIOS de propósito
 *   (não inventamos especificações), e a página mostra que estão pendentes;
 * - todas as imagens e o modelo 3D são ilustrações.
 *
 * No banco, os mesmos produtos entram como rascunho e com `is_demo = true`;
 * uma constraint impede que sejam publicados.
 */
import { SIZE_INFO, type Category, type Product, type ProductMedia, type ProductVariant, type SizeKey } from "./types";

export const DEMO_CATEGORY: Category = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "colchoes",
  name: "Colchões",
  description: "Colchões para diferentes preferências de firmeza e tamanhos de cama.",
  sortOrder: 0,
};

const VIEWS = [
  { key: "frente", alt: "vista em três quartos, mostrando o tampo e a lateral" },
  { key: "lateral", alt: "vista lateral, mostrando a altura e o perfil" },
  { key: "detalhe", alt: "detalhe aproximado do tecido e da costura do tampo" },
  { key: "ambiente", alt: "colchão montado sobre uma cama em um quarto claro" },
] as const;

function demoMedia(productIndex: number, slug: string, name: string, with3d: boolean): ProductMedia[] {
  const images: ProductMedia[] = VIEWS.map((view, i) => ({
    id: `00000000-0000-4000-8000-0000000${productIndex}0${i + 1}00`,
    type: "image",
    url: `/demo/${slug}-${view.key}.svg`,
    storagePath: `demo/${slug}-${view.key}.svg`,
    altText: `Ilustração do colchão ${name}: ${view.alt}.`,
    sortOrder: i,
    isPrimary: i === 0,
    isIllustrative: true,
    width: 1200,
    height: 900,
  }));
  if (!with3d) return images;
  return [
    ...images,
    {
      id: `00000000-0000-4000-8000-0000000${productIndex}0900`,
      type: "model_3d",
      url: `/demo/${slug}.glb`,
      storagePath: `demo/${slug}.glb`,
      altText: `Modelo 3D ilustrativo do colchão ${name}, que pode ser girado para ver todos os lados.`,
      sortOrder: 99,
      isPrimary: false,
      isIllustrative: true,
      width: null,
      height: null,
    },
  ];
}

function demoVariants(productIndex: number, entries: [SizeKey, number][]): ProductVariant[] {
  return entries.map(([size, priceCents], i) => ({
    id: `00000000-0000-4000-8000-0000000${productIndex}1${i + 1}00`,
    name: `${SIZE_INFO[size].label} (${SIZE_INFO[size].widthCm} × ${SIZE_INFO[size].lengthCm} cm)`,
    sku: null,
    priceCents,
    stockQuantity: null,
    size,
    widthCm: SIZE_INFO[size].widthCm,
    lengthCm: SIZE_INFO[size].lengthCm,
    sortOrder: i,
  }));
}

const DEMO_NOTICE =
  "Produto demonstrativo. Nome, preço, firmeza, altura e imagens são ilustrativos e serão substituídos pelos dados reais verificados antes de qualquer publicação.";

const category = { id: DEMO_CATEGORY.id, slug: DEMO_CATEGORY.slug, name: DEMO_CATEGORY.name };

export const DEMO_PRODUCTS: Product[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    slug: "nuvem-essencial",
    name: "Nuvem Essencial",
    shortDescription: "Proposta de colchão de entrada, com toque mais macio.",
    description: `Proposta de linha de entrada da marca, pensada para quem prefere um toque mais macio.\n\n${DEMO_NOTICE}`,
    category,
    status: "draft",
    isDemo: true,
    priceCents: null,
    compareAtPriceCents: null,
    currency: "BRL",
    sku: null,
    stockQuantity: null,
    dimensions: { heightCm: 24 },
    attributes: { firmness: "medio-macio" },
    faq: [],
    seoTitle: null,
    seoDescription: null,
    createdAt: "2026-10-26T12:00:00.000Z",
    updatedAt: "2026-10-26T12:00:00.000Z",
    publishedAt: null,
    media: demoMedia(1, "nuvem-essencial", "Nuvem Essencial", false),
    variants: demoVariants(1, [
      ["solteiro", 89900],
      ["casal", 129900],
      ["queen", 159900],
    ]),
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    slug: "brisa-premium",
    name: "Brisa Premium",
    shortDescription: "Proposta de colchão de firmeza média, para uso do dia a dia.",
    description: `Proposta de linha intermediária, com firmeza média para quem não quer nem muito macio nem muito firme.\n\n${DEMO_NOTICE}`,
    category,
    status: "draft",
    isDemo: true,
    priceCents: null,
    compareAtPriceCents: null,
    currency: "BRL",
    sku: null,
    stockQuantity: null,
    dimensions: { heightCm: 28 },
    attributes: { firmness: "medio" },
    faq: [],
    seoTitle: null,
    seoDescription: null,
    createdAt: "2026-10-26T12:05:00.000Z",
    updatedAt: "2026-10-26T12:05:00.000Z",
    publishedAt: null,
    media: demoMedia(2, "brisa-premium", "Brisa Premium", false),
    variants: demoVariants(2, [
      ["casal", 189900],
      ["queen", 219900],
      ["king", 279900],
    ]),
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    slug: "sereno-hibrido",
    name: "Sereno Híbrido",
    shortDescription: "Proposta de colchão híbrido, com sensação médio-firme.",
    description: `Proposta de linha superior, com sensação médio-firme. É o produto escolhido para a prova de conceito do visualizador 3D.\n\n${DEMO_NOTICE}`,
    category,
    status: "draft",
    isDemo: true,
    priceCents: null,
    compareAtPriceCents: null,
    currency: "BRL",
    sku: null,
    stockQuantity: null,
    dimensions: { heightCm: 30 },
    attributes: { firmness: "medio-firme" },
    faq: [],
    seoTitle: null,
    seoDescription: null,
    createdAt: "2026-10-26T12:10:00.000Z",
    updatedAt: "2026-10-26T12:10:00.000Z",
    publishedAt: null,
    media: demoMedia(3, "sereno-hibrido", "Sereno Híbrido", true),
    variants: demoVariants(3, [
      ["solteiro-king", 219900],
      ["casal", 249900],
      ["queen", 289900],
      ["king", 349900],
    ]),
  },
];

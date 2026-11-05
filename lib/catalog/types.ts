export const PRODUCT_STATUSES = ["draft", "review", "published", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Rascunho",
  review: "Em revisão",
  published: "Publicado",
  archived: "Arquivado",
};

/** Escala de firmeza, do mais macio ao mais firme. */
export const FIRMNESS_LEVELS = [
  "macio",
  "medio-macio",
  "medio",
  "medio-firme",
  "firme",
] as const;
export type Firmness = (typeof FIRMNESS_LEVELS)[number];

export const FIRMNESS_LABELS: Record<Firmness, string> = {
  macio: "Macio",
  "medio-macio": "Médio-macio",
  medio: "Médio",
  "medio-firme": "Médio-firme",
  firme: "Firme",
};

/** Tamanhos-padrão de colchão no Brasil. */
export const SIZE_KEYS = ["solteiro", "solteiro-king", "casal", "queen", "king"] as const;
export type SizeKey = (typeof SIZE_KEYS)[number];

export const SIZE_INFO: Record<SizeKey, { label: string; widthCm: number; lengthCm: number }> = {
  solteiro: { label: "Solteiro", widthCm: 88, lengthCm: 188 },
  "solteiro-king": { label: "Solteiro King", widthCm: 96, lengthCm: 203 },
  casal: { label: "Casal", widthCm: 138, lengthCm: 188 },
  queen: { label: "Queen", widthCm: 158, lengthCm: 198 },
  king: { label: "King", widthCm: 193, lengthCm: 203 },
};

export const MEDIA_TYPES = ["image", "video", "model_3d"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  /** Produtos desta categoria só são publicados com modelo 3D (móveis). */
  requires3d: boolean;
};

export type ProductMedia = {
  id: string;
  type: MediaType;
  /** URL pública pronta para uso (Storage público ou /public). */
  url: string;
  storagePath: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
  /** Imagem/modelo ilustrativo, não é foto real do produto. */
  isIllustrative: boolean;
  /** Imagem de catálogo recriada por IA a partir das fotos reais. */
  aiGenerated: boolean;
  /** Gerada por IA e ainda não conferida/aprovada pela equipe (não aparece na loja). */
  pendingReview: boolean;
  /** Foto feita pelo passo Cores do Estúdio (tarefa que a gerou). Só o painel lê; na loja é sempre null. */
  colorJobId?: string | null;
  width: number | null;
  height: number | null;
  /**
   * Modelo 3D: arquivo do iPhone (.usdz, AR Quick Look). Em tamanho real só com
   * `realScale`; sem ele, no tamanho do próprio modelo (aproximado), só para a
   * câmera abrir no mesmo toque.
   */
  usdzUrl: string | null;
  /** Modelo 3D conferido com as medidas do catálogo (±2 cm). Ver `arFiles()`. */
  realScale: boolean;
  /** Caixa do modelo conferido, em cm. */
  boundsCm: ModelBoundsCm | null;
  /** Foto ou modelo 3D de uma variação (cor/tecido); null = do produto. */
  variantId: string | null;
};

/** Caixa de um modelo 3D em cm: largura (x), profundidade (z) e altura (y). */
export type ModelBoundsCm = { widthCm: number; depthCm: number; heightCm: number };

export type ProductVariant = {
  id: string;
  name: string;
  sku: string | null;
  /**
   * Preço da variação. No banco é obrigatório; `null` só aparece em dados de
   * demonstração/exemplo sem preço definido (a loja mostra "Preço em breve").
   */
  priceCents: number | null;
  stockQuantity: number | null;
  size: SizeKey | null;
  widthCm: number | null;
  lengthCm: number | null;
  /** Cor ou tecido da variação (#RRGGBB). Variações com cor viram o seletor "Cor". */
  colorHex: string | null;
  /** Dado de exemplo do ambiente de desenvolvimento (nunca vem do banco). */
  example?: boolean;
  sortOrder: number;
};

/** Medidas do produto (as de largura/comprimento por tamanho ficam nas variações). */
export type ProductDimensions = {
  heightCm?: number;
  widthCm?: number;
  lengthCm?: number;
  weightKg?: number;
};

/** Especificações confirmadas. Campo ausente = não confirmado = não exibido. */
export type ProductAttributes = {
  firmness?: Firmness;
  materials?: string[];
  layers?: string[];
  fabric?: string;
  warranty?: string;
  care?: string[];
  /** Outras especificações confirmadas, em pares rótulo/valor. */
  extraSpecs?: { label: string; value: string }[];
};

export type ProductFaqItem = { question: string; answer: string };

export type Product = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  category: Pick<Category, "id" | "slug" | "name" | "requires3d"> | null;
  status: ProductStatus;
  /** Produto de demonstração: nunca pode ser publicado. */
  isDemo: boolean;
  priceCents: number | null;
  compareAtPriceCents: number | null;
  currency: "BRL";
  sku: string | null;
  stockQuantity: number | null;
  dimensions: ProductDimensions;
  attributes: ProductAttributes;
  faq: ProductFaqItem[];
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  media: ProductMedia[];
  variants: ProductVariant[];
};

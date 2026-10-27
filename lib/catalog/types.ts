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
  width: number | null;
  height: number | null;
};

export type ProductVariant = {
  id: string;
  name: string;
  sku: string | null;
  priceCents: number;
  stockQuantity: number | null;
  size: SizeKey | null;
  widthCm: number | null;
  lengthCm: number | null;
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
  category: Pick<Category, "id" | "slug" | "name"> | null;
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

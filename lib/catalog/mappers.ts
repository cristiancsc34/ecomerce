import { attributesSchema, dimensionsSchema, faqSchema } from "@/lib/validation/product";
import {
  MEDIA_TYPES,
  PRODUCT_STATUSES,
  SIZE_KEYS,
  type Category,
  type MediaType,
  type Product,
  type ProductMedia,
  type ProductStatus,
  type ProductVariant,
  type SizeKey,
} from "./types";

export const MEDIA_BUCKET = "product-media";

/** Colunas lidas pela vitrine (o papel anon só tem acesso a estas). */
export const PUBLIC_PRODUCT_COLUMNS = [
  "id",
  "name",
  "slug",
  "short_description",
  "description",
  "status",
  "is_demo",
  "price_cents",
  "compare_at_price_cents",
  "currency",
  "sku",
  "stock_quantity",
  "dimensions",
  "attributes",
  "faq",
  "seo_title",
  "seo_description",
  "created_at",
  "updated_at",
  "published_at",
  "category:categories(id,slug,name,requires_3d)",
  "media:product_media(id,storage_path,media_type,alt_text,sort_order,is_primary,is_illustrative,width,height)",
  "variants:product_variants(id,name,sku,price_cents,stock_quantity,attributes,sort_order)",
].join(",");

export type ProductRow = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  status: string;
  is_demo: boolean;
  price_cents: number | null;
  compare_at_price_cents: number | null;
  currency: string;
  sku: string | null;
  stock_quantity: number | null;
  dimensions: unknown;
  attributes: unknown;
  faq: unknown;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  category: { id: string; slug: string; name: string; requires_3d?: boolean } | null;
  media: MediaRow[] | null;
  variants: VariantRow[] | null;
};

export type MediaRow = {
  id: string;
  storage_path: string;
  media_type: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
  is_illustrative: boolean;
  width: number | null;
  height: number | null;
};

export type VariantRow = {
  id: string;
  name: string;
  sku: string | null;
  price_cents: number;
  stock_quantity: number | null;
  attributes: unknown;
  sort_order: number;
};

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  requires_3d?: boolean;
};

/**
 * URL pública de um arquivo de mídia.
 * Caminhos "demo/..." são ilustrações estáticas servidas de /public/demo.
 */
export function mediaPublicUrl(storagePath: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  if (storagePath.startsWith("demo/")) return `/${storagePath}`;
  const base = (supabaseUrl ?? "").replace(/\/+$/, "");
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${encoded}`;
}

function asStatus(value: string): ProductStatus {
  return (PRODUCT_STATUSES as readonly string[]).includes(value) ? (value as ProductStatus) : "draft";
}

function asMediaType(value: string): MediaType {
  return (MEDIA_TYPES as readonly string[]).includes(value) ? (value as MediaType) : "image";
}

export function mapMedia(row: MediaRow): ProductMedia {
  return {
    id: row.id,
    type: asMediaType(row.media_type),
    url: mediaPublicUrl(row.storage_path),
    storagePath: row.storage_path,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    isPrimary: row.is_primary,
    isIllustrative: row.is_illustrative,
    width: row.width,
    height: row.height,
  };
}

function positiveNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function mapVariant(row: VariantRow): ProductVariant {
  const attrs = (row.attributes && typeof row.attributes === "object" ? row.attributes : {}) as Record<string, unknown>;
  const size = typeof attrs.size === "string" && (SIZE_KEYS as readonly string[]).includes(attrs.size)
    ? (attrs.size as SizeKey)
    : null;
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    priceCents: row.price_cents,
    stockQuantity: row.stock_quantity,
    size,
    widthCm: positiveNumberOrNull(attrs.widthCm),
    lengthCm: positiveNumberOrNull(attrs.lengthCm),
    sortOrder: row.sort_order,
  };
}

/**
 * Converte a linha do banco no tipo de domínio. JSONs inválidos viram vazios
 * em vez de quebrar a página: dado não validado simplesmente não aparece.
 */
export function mapProduct(row: ProductRow): Product {
  const attributes = attributesSchema.safeParse(row.attributes ?? {});
  const dimensions = dimensionsSchema.safeParse(row.dimensions ?? {});
  const faq = faqSchema.safeParse(row.faq ?? []);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    description: row.description,
    category: row.category
      ? { id: row.category.id, slug: row.category.slug, name: row.category.name, requires3d: row.category.requires_3d ?? false }
      : null,
    status: asStatus(row.status),
    isDemo: row.is_demo,
    priceCents: row.price_cents,
    compareAtPriceCents: row.compare_at_price_cents,
    currency: "BRL",
    sku: row.sku,
    stockQuantity: row.stock_quantity,
    dimensions: dimensions.success ? dimensions.data : {},
    attributes: attributes.success ? attributes.data : {},
    faq: faq.success ? faq.data : [],
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    media: (row.media ?? []).map(mapMedia).sort((a, b) => a.sortOrder - b.sortOrder),
    variants: (row.variants ?? []).map(mapVariant).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    requires3d: row.requires_3d ?? false,
  };
}

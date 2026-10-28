import { z } from "zod";
import { parsePriceToCents } from "@/lib/catalog/money";
import {
  FIRMNESS_LEVELS,
  MEDIA_TYPES,
  PRODUCT_STATUSES,
  SIZE_KEYS,
  type Product,
} from "@/lib/catalog/types";

// ---------------------------------------------------------------------------
// Blocos reutilizados (formato salvo no banco / domínio)
// ---------------------------------------------------------------------------

export const slugSchema = z
  .string()
  .trim()
  .min(2, "Use pelo menos 2 caracteres.")
  .max(80, "Use no máximo 80 caracteres.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use só letras minúsculas sem acento, números e hífens (ex.: colchao-nuvem).");

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const attributesSchema = z
  .object({
    firmness: z.enum(FIRMNESS_LEVELS).optional(),
    materials: z.array(shortText(160)).max(20).optional(),
    layers: z.array(shortText(200)).max(20).optional(),
    fabric: shortText(200).optional(),
    warranty: shortText(300).optional(),
    care: z.array(shortText(300)).max(20).optional(),
    extraSpecs: z
      .array(z.object({ label: shortText(60), value: shortText(200) }))
      .max(30)
      .optional(),
  })
  .strip();

export const dimensionsSchema = z
  .object({
    // Móveis (poltrona de encosto alto, estante…) passam de 1 m: limite de 3 m.
    heightCm: z.number().positive().max(300).optional(),
    widthCm: z.number().positive().max(400).optional(),
    lengthCm: z.number().positive().max(400).optional(),
    weightKg: z.number().positive().max(500).optional(),
  })
  .strip();

export const faqSchema = z
  .array(
    z.object({
      question: z.string().trim().min(3).max(200),
      answer: z.string().trim().min(1).max(2000),
    }),
  )
  .max(20);

const cents = z.number().int().min(0).max(100_000_000);

export const variantSaveSchema = z.object({
  id: z.uuid().optional(),
  name: shortText(120),
  sku: z.string().trim().max(64).nullable(),
  priceCents: cents,
  stockQuantity: z.number().int().min(0).max(1_000_000).nullable(),
  size: z.enum(SIZE_KEYS).nullable(),
  widthCm: z.number().positive().max(400).nullable(),
  lengthCm: z.number().positive().max(400).nullable(),
});

/** Formato que a Server Action de salvar produto aceita (já em centavos). */
export const productSaveSchema = z
  .object({
    name: shortText(120),
    slug: slugSchema,
    shortDescription: z.string().trim().max(240).nullable(),
    description: z.string().trim().max(8000).nullable(),
    categoryId: z.uuid().nullable(),
    priceCents: cents.nullable(),
    compareAtPriceCents: cents.nullable(),
    sku: z.string().trim().max(64).nullable(),
    stockQuantity: z.number().int().min(0).max(1_000_000).nullable(),
    dimensions: dimensionsSchema,
    attributes: attributesSchema,
    faq: faqSchema,
    seoTitle: z.string().trim().max(70).nullable(),
    seoDescription: z.string().trim().max(170).nullable(),
    variants: z.array(variantSaveSchema).max(20),
  })
  .superRefine((data, ctx) => {
    if (
      data.compareAtPriceCents !== null &&
      (data.priceCents === null || data.compareAtPriceCents <= data.priceCents)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["compareAtPriceCents"],
        message: "O preço “de” só pode existir se for maior que o preço atual e for legítimo.",
      });
    }
    const skus = [data.sku, ...data.variants.map((v) => v.sku)].filter(Boolean) as string[];
    if (new Set(skus).size !== skus.length) {
      ctx.addIssue({ code: "custom", path: ["sku"], message: "SKUs repetidos entre produto e variações." });
    }
  });

export type ProductSaveInput = z.infer<typeof productSaveSchema>;

// ---------------------------------------------------------------------------
// Formulário do admin (campos de texto → formato salvo)
// ---------------------------------------------------------------------------

const optionalText = z.string().trim().transform((v) => (v === "" ? null : v));

const optionalNumber = (label: string, max: number) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return undefined;
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n <= 0 || n > max) {
        ctx.addIssue({ code: "custom", message: `${label}: informe um número entre 0 e ${max}.` });
        return z.NEVER;
      }
      return n;
    });

const optionalInt = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      if (!/^\d{1,7}$/.test(v)) {
        ctx.addIssue({ code: "custom", message: `${label}: use um número inteiro (0 ou mais).` });
        return z.NEVER;
      }
      return Number(v);
    });

const optionalPriceText = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const c = parsePriceToCents(v);
    if (c === null) {
      ctx.addIssue({ code: "custom", message: "Preço inválido. Use o formato 1.299,90." });
      return z.NEVER;
    }
    return c;
  });

const requiredPriceText = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const c = v === "" ? null : parsePriceToCents(v);
    if (c === null) {
      ctx.addIssue({ code: "custom", message: v === "" ? "Informe o preço." : "Preço inválido. Use o formato 1.299,90." });
      return z.NEVER;
    }
    return c;
  });

const lines = z
  .string()
  .transform((v) =>
    v
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  )
  .pipe(z.array(shortText(300)).max(20))
  .transform((arr) => (arr.length ? arr : undefined));

export const productFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(120),
  slug: slugSchema,
  shortDescription: optionalText.pipe(z.string().max(240).nullable()),
  description: optionalText.pipe(z.string().max(8000).nullable()),
  categoryId: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.uuid("Categoria inválida.").nullable()),
  price: optionalPriceText,
  compareAtPrice: optionalPriceText,
  sku: optionalText.pipe(z.string().max(64).nullable()),
  stockQuantity: optionalInt("Estoque"),
  heightCm: optionalNumber("Altura", 300),
  widthCm: optionalNumber("Largura", 400),
  lengthCm: optionalNumber("Profundidade", 400),
  weightKg: optionalNumber("Peso", 500),
  firmness: z
    .string()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.enum(FIRMNESS_LEVELS).optional()),
  materialsText: lines,
  layersText: lines,
  fabric: optionalText.pipe(z.string().max(200).nullable()),
  warranty: optionalText.pipe(z.string().max(300).nullable()),
  careText: lines,
  extraSpecs: z.array(z.object({ label: z.string().trim().min(1, "Rótulo obrigatório.").max(60), value: z.string().trim().min(1, "Valor obrigatório.").max(200) })).max(30),
  faq: z.array(z.object({ question: z.string().trim().min(3, "Pergunta muito curta.").max(200), answer: z.string().trim().min(1, "Resposta obrigatória.").max(2000) })).max(20),
  seoTitle: optionalText.pipe(z.string().max(70, "Até 70 caracteres.").nullable()),
  seoDescription: optionalText.pipe(z.string().max(170, "Até 170 caracteres.").nullable()),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1, "Nome da variação obrigatório.").max(120),
        sku: optionalText.pipe(z.string().max(64).nullable()),
        price: requiredPriceText,
        stockQuantity: optionalInt("Estoque"),
        size: z
          .string()
          .transform((v) => (v === "" ? null : v))
          .pipe(z.enum(SIZE_KEYS).nullable()),
        widthCm: optionalNumber("Largura", 400).transform((v) => v ?? null),
        lengthCm: optionalNumber("Comprimento", 400).transform((v) => v ?? null),
      }),
    )
    .max(20),
});

export type ProductFormValues = z.input<typeof productFormSchema>;
export type ProductFormOutput = z.output<typeof productFormSchema>;

/** Converte a saída do formulário no formato aceito pela Server Action. */
export function formOutputToSaveInput(out: ProductFormOutput): ProductSaveInput {
  const attributes: ProductSaveInput["attributes"] = {};
  if (out.firmness) attributes.firmness = out.firmness;
  if (out.materialsText) attributes.materials = out.materialsText;
  if (out.layersText) attributes.layers = out.layersText;
  if (out.fabric) attributes.fabric = out.fabric;
  if (out.warranty) attributes.warranty = out.warranty;
  if (out.careText) attributes.care = out.careText;
  if (out.extraSpecs.length) attributes.extraSpecs = out.extraSpecs;

  const dimensions: ProductSaveInput["dimensions"] = {};
  if (out.heightCm !== undefined) dimensions.heightCm = out.heightCm;
  if (out.widthCm !== undefined) dimensions.widthCm = out.widthCm;
  if (out.lengthCm !== undefined) dimensions.lengthCm = out.lengthCm;
  if (out.weightKg !== undefined) dimensions.weightKg = out.weightKg;

  return {
    name: out.name,
    slug: out.slug,
    shortDescription: out.shortDescription,
    description: out.description,
    categoryId: out.categoryId,
    priceCents: out.price,
    compareAtPriceCents: out.compareAtPrice,
    sku: out.sku,
    stockQuantity: out.stockQuantity,
    dimensions,
    attributes,
    faq: out.faq,
    seoTitle: out.seoTitle,
    seoDescription: out.seoDescription,
    variants: out.variants.map((v) => ({
      ...(v.id && /^[0-9a-f-]{36}$/i.test(v.id) ? { id: v.id } : {}),
      name: v.name,
      sku: v.sku,
      priceCents: v.price,
      stockQuantity: v.stockQuantity,
      size: v.size,
      widthCm: v.widthCm,
      lengthCm: v.lengthCm,
    })),
  };
}

// ---------------------------------------------------------------------------
// Publicação: o que precisa estar confirmado antes de ir ao ar
// ---------------------------------------------------------------------------

export type PublishIssue = { field: string; message: string };

/**
 * Lista o que impede a publicação. Vazia = pode publicar.
 * Executada no servidor antes de mudar o status (o banco tem constraints
 * equivalentes para os itens críticos).
 */
export function publishIssues(product: Product): PublishIssue[] {
  const issues: PublishIssue[] = [];
  if (product.isDemo) {
    issues.push({ field: "isDemo", message: "Produto de demonstração não pode ser publicado. Cadastre o produto real." });
  }
  if (!product.category) issues.push({ field: "categoryId", message: "Escolha uma categoria." });
  if (!product.description?.trim()) issues.push({ field: "description", message: "Escreva a descrição revisada." });
  if (product.priceCents === null && product.variants.length === 0) {
    issues.push({ field: "price", message: "Informe o preço ou cadastre variações com preço." });
  }
  const images = product.media.filter((m) => m.type === "image");
  if (images.length === 0) issues.push({ field: "media", message: "Envie pelo menos uma foto." });
  const primary = images.find((m) => m.isPrimary);
  if (images.length > 0 && !primary) {
    issues.push({ field: "media", message: "Defina a foto principal." });
  }
  if (primary?.isIllustrative) {
    issues.push({ field: "media", message: "A foto principal precisa ser uma foto real do produto, não uma ilustração." });
  }
  if (product.category?.requires3d && !product.media.some((m) => m.type === "model_3d")) {
    issues.push({ field: "media", message: "Esta categoria exige o modelo 3D: gere no estúdio de fotos e 3D ou envie um arquivo .glb." });
  }
  const noAlt = product.media.filter((m) => m.altText.trim().length < 5);
  if (noAlt.length) {
    issues.push({ field: "media", message: `${noAlt.length} mídia(s) sem texto alternativo descritivo.` });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Mídia
// ---------------------------------------------------------------------------

export const mediaMetaSchema = z.object({
  altText: z.string().trim().min(5, "Descreva a imagem em pelo menos 5 caracteres.").max(300),
  isIllustrative: z.boolean(),
});

export const mediaTypeSchema = z.enum(MEDIA_TYPES);
export const statusSchema = z.enum(PRODUCT_STATUSES);

export const categorySaveSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(60),
  slug: slugSchema,
  description: optionalText.pipe(z.string().max(300).nullable()),
  sortOrder: z.coerce.number().int().min(0).max(999),
  requires3d: z.boolean(),
});

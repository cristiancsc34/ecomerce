import { centsToInput } from "@/lib/catalog/money";
import { sortedVariants } from "@/lib/catalog/product-helpers";
import type { Product } from "@/lib/catalog/types";
import type { ProductFormValues } from "@/lib/validation/product";

function num(n: number | undefined | null): string {
  return n === undefined || n === null ? "" : String(n).replace(".", ",");
}

/** Produto → valores do formulário (tudo em texto, como nos inputs). */
export function productToFormValues(product: Product | null): ProductFormValues {
  if (!product) {
    return {
      name: "",
      slug: "",
      shortDescription: "",
      description: "",
      categoryId: "",
      price: "",
      compareAtPrice: "",
      sku: "",
      stockQuantity: "",
      heightCm: "",
      weightKg: "",
      firmness: "",
      materialsText: "",
      layersText: "",
      fabric: "",
      warranty: "",
      careText: "",
      extraSpecs: [],
      faq: [],
      seoTitle: "",
      seoDescription: "",
      variants: [],
    };
  }
  const a = product.attributes;
  return {
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription ?? "",
    description: product.description ?? "",
    categoryId: product.category?.id ?? "",
    price: centsToInput(product.priceCents),
    compareAtPrice: centsToInput(product.compareAtPriceCents),
    sku: product.sku ?? "",
    stockQuantity: product.stockQuantity === null ? "" : String(product.stockQuantity),
    heightCm: num(product.dimensions.heightCm),
    weightKg: num(product.dimensions.weightKg),
    firmness: a.firmness ?? "",
    materialsText: (a.materials ?? []).join("\n"),
    layersText: (a.layers ?? []).join("\n"),
    fabric: a.fabric ?? "",
    warranty: a.warranty ?? "",
    careText: (a.care ?? []).join("\n"),
    extraSpecs: a.extraSpecs ?? [],
    faq: product.faq,
    seoTitle: product.seoTitle ?? "",
    seoDescription: product.seoDescription ?? "",
    variants: sortedVariants(product).map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku ?? "",
      price: centsToInput(v.priceCents),
      stockQuantity: v.stockQuantity === null ? "" : String(v.stockQuantity),
      size: v.size ?? "",
      widthCm: num(v.widthCm),
      lengthCm: num(v.lengthCm),
    })),
  };
}

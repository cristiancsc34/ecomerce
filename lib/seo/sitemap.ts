import { imageMedia } from "@/lib/catalog/product-helpers";
import type { Product } from "@/lib/catalog/types";

/** Fotos reais do produto (sem ilustração nem .svg), em URL completa: viram o "sitemap de imagens". */
export function sitemapImages(product: Pick<Product, "media">, base: string): string[] {
  return imageMedia(product)
    .filter((m) => !m.isIllustrative && !m.pendingReview && !m.url.toLowerCase().endsWith(".svg"))
    .map((m) => (m.url.startsWith("http") ? m.url : `${base}${m.url.startsWith("/") ? "" : "/"}${m.url}`));
}

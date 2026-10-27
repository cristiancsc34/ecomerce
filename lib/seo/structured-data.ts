import { brand } from "@/config/brand";
import { availability, fromPriceCents, imageMedia, toPriceCents } from "@/lib/catalog/product-helpers";
import type { Product } from "@/lib/catalog/types";

function decimal(cents: number) {
  return (cents / 100).toFixed(2);
}

function absolute(url: string, base: string) {
  return url.startsWith("http") ? url : `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * schema.org/Product somente com dados reais: nunca para produto de
 * demonstração, nunca com imagem ilustrativa, e disponibilidade apenas
 * quando o estoque é controlado. Preço igual ao exibido na página.
 */
export function productJsonLd(product: Product, baseUrl: string): Record<string, unknown> | null {
  if (product.isDemo) return null;
  const low = fromPriceCents(product);
  const high = toPriceCents(product);
  if (low === null || high === null) return null;

  const url = `${baseUrl}/produtos/${product.slug}`;
  const stock = availability(product);
  const availabilityUrl =
    stock === "in_stock" ? "https://schema.org/InStock" : stock === "out_of_stock" ? "https://schema.org/OutOfStock" : undefined;

  const offers =
    product.variants.length > 0
      ? {
          "@type": "AggregateOffer",
          priceCurrency: "BRL",
          lowPrice: decimal(low),
          highPrice: decimal(high),
          offerCount: product.variants.length,
          url,
          ...(availabilityUrl ? { availability: availabilityUrl } : {}),
        }
      : {
          "@type": "Offer",
          priceCurrency: "BRL",
          price: decimal(low),
          url,
          ...(availabilityUrl ? { availability: availabilityUrl } : {}),
        };

  const images = imageMedia(product)
    .filter((m) => !m.isIllustrative)
    .map((m) => absolute(m.url, baseUrl));

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.seoDescription ?? product.shortDescription ?? undefined,
    ...(images.length ? { image: images } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    brand: { "@type": "Brand", name: brand.name },
    ...(product.category ? { category: product.category.name } : {}),
    url,
    offers,
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[], baseUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${baseUrl}${item.path}`,
    })),
  };
}

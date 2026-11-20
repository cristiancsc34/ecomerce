import { brand } from "@/config/brand";
import { availability, fromPriceCents, imageMedia, sortedVariants, toPriceCents } from "@/lib/catalog/product-helpers";
import { SIZE_INFO, type Product, type ProductMedia, type ProductVariant } from "@/lib/catalog/types";
import { galleryFor, variantSlug } from "@/lib/catalog/variants";

function decimal(cents: number) {
  return (cents / 100).toFixed(2);
}

function absolute(url: string, base: string) {
  return url.startsWith("http") ? url : `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

const AVAILABILITY = {
  in_stock: "https://schema.org/InStock",
  out_of_stock: "https://schema.org/OutOfStock",
} as const;

/** Fotos reais (sem ilustração nem desenho .svg), em URL completa. */
function realImages(media: ProductMedia[], base: string): string[] {
  return media
    .filter((m) => m.type === "image" && !m.isIllustrative && !m.pendingReview && !m.url.toLowerCase().endsWith(".svg"))
    .map((m) => absolute(m.url, base));
}

/** Medida em cm/kg no formato do schema.org (só as que estão no cadastro). */
function measures(product: Product): Record<string, unknown> {
  const q = (value: number | undefined, unitCode: string) =>
    value && value > 0 ? { "@type": "QuantitativeValue", value, unitCode } : undefined;
  const d = product.dimensions;
  const out: Record<string, unknown> = {};
  const width = q(d.widthCm, "CMT");
  const depth = q(d.lengthCm, "CMT");
  const height = q(d.heightCm, "CMT");
  const weight = q(d.weightKg, "KGM");
  if (width) out.width = width;
  if (depth) out.depth = depth;
  if (height) out.height = height;
  if (weight) out.weight = weight;
  return out;
}

/** Materiais e tecido confirmados no cadastro. */
function materials(product: Product): Record<string, unknown> {
  const list = [...(product.attributes.materials ?? []), ...(product.attributes.fabric ? [product.attributes.fabric] : [])]
    .map((m) => m.trim())
    .filter(Boolean);
  return list.length ? { material: list.length === 1 ? list[0] : list } : {};
}

/**
 * Frete da oferta: grátis (R$ 0) para o Paraná, a única região onde a loja
 * vende (decisão de 20/11/2026, issue #28; saída de Maringá). Sem prazo
 * (`deliveryTime`): a loja ainda não tem esse dado.
 */
export const SHIPPING_DETAILS = {
  "@type": "OfferShippingDetails",
  shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "BRL" },
  shippingDestination: { "@type": "DefinedRegion", addressCountry: "BR", addressRegion: "PR" },
} as const;

function offer(priceCents: number, url: string, stock: "in_stock" | "out_of_stock" | null): Record<string, unknown> {
  return {
    "@type": "Offer",
    priceCurrency: "BRL",
    price: decimal(priceCents),
    url,
    ...(stock ? { availability: AVAILABILITY[stock] } : {}),
    shippingDetails: SHIPPING_DETAILS,
    seller: { "@type": "Organization", name: brand.name },
  };
}

/** Link que abre a página já na variação (?cor= ou ?tamanho=), como a própria loja faz. */
function variantUrl(url: string, variant: ProductVariant): string | null {
  if (variant.colorHex) return `${url}?cor=${encodeURIComponent(variantSlug(variant))}`;
  if (variant.size) return `${url}?tamanho=${encodeURIComponent(variant.size)}`;
  return null;
}

/**
 * schema.org/Product somente com dados reais: nunca para produto de
 * demonstração, nunca com imagem ilustrativa, e disponibilidade apenas
 * quando o estoque é controlado. Preço igual ao exibido na página.
 *
 * Com variações (cores ou tamanhos) vira um ProductGroup com uma oferta por
 * variação, o formato que o Google pede para "merchant listing" (ele não aceita
 * AggregateOffer ali). Frete: grátis no Paraná (SHIPPING_DETAILS). Nada de
 * avaliação, prazo, devolução, condição ou código de barras: a loja ainda não
 * tem esses dados cadastrados.
 */
export function productJsonLd(product: Product, baseUrl: string): Record<string, unknown> | null {
  if (product.isDemo) return null;
  const low = fromPriceCents(product);
  const high = toPriceCents(product);
  if (low === null || high === null) return null;

  const url = `${baseUrl}/produtos/${product.slug}`;
  const images = realImages(imageMedia(product), baseUrl);
  const description = product.seoDescription ?? product.shortDescription ?? product.description ?? undefined;
  const common = {
    name: product.name,
    ...(description ? { description } : {}),
    ...(images.length ? { image: images } : {}),
    brand: { "@type": "Brand", name: brand.name },
    ...(product.category ? { category: product.category.name } : {}),
    ...materials(product),
  };

  const priced = sortedVariants(product).filter((v): v is ProductVariant & { priceCents: number } => v.priceCents !== null);
  const groupable = priced.length > 0 && priced.every((v) => variantUrl(url, v) !== null);

  if (product.variants.length === 0) {
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      ...common,
      ...(product.sku ? { sku: product.sku } : {}),
      ...measures(product),
      url,
      offers: offer(low, url, availability(product)),
    };
  }

  if (groupable) {
    const byColor = priced.some((v) => v.colorHex);
    const bySize = priced.some((v) => v.size);
    return {
      "@context": "https://schema.org",
      "@type": "ProductGroup",
      ...common,
      productGroupID: product.sku ?? product.id,
      url,
      variesBy: [...(byColor ? ["https://schema.org/color"] : []), ...(bySize ? ["https://schema.org/size"] : [])],
      hasVariant: priced.map((v) => {
        const own = realImages(galleryFor(product, v.id), baseUrl);
        const vUrl = variantUrl(url, v)!;
        const width = v.widthCm ?? (v.size ? SIZE_INFO[v.size].widthCm : null);
        const length = v.lengthCm ?? (v.size ? SIZE_INFO[v.size].lengthCm : null);
        return {
          "@type": "Product",
          name: `${product.name} - ${v.name}`,
          ...(v.sku ? { sku: v.sku } : {}),
          ...(own.length ? { image: own } : images.length ? { image: images } : {}),
          ...(v.colorHex ? { color: v.name } : {}),
          ...(v.size ? { size: SIZE_INFO[v.size].label } : {}),
          ...measures(product),
          ...(width ? { width: { "@type": "QuantitativeValue", value: width, unitCode: "CMT" } } : {}),
          ...(length ? { depth: { "@type": "QuantitativeValue", value: length, unitCode: "CMT" } } : {}),
          url: vUrl,
          offers: offer(v.priceCents, vUrl, availability(product, v)),
        };
      }),
    };
  }

  // Variações sem cor nem tamanho (sem link próprio): faixa de preço.
  const stock = availability(product);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    ...common,
    ...(product.sku ? { sku: product.sku } : {}),
    ...measures(product),
    url,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      lowPrice: decimal(low),
      highPrice: decimal(high),
      offerCount: priced.length,
      url,
      ...(stock ? { availability: AVAILABILITY[stock] } : {}),
      shippingDetails: SHIPPING_DETAILS,
    },
  };
}

/**
 * schema.org/ItemList das listagens (categoria, todos os produtos): só os
 * links das páginas de produto, na ordem em que aparecem. Produto de
 * demonstração fica de fora.
 */
export function itemListJsonLd(
  products: Pick<Product, "slug" | "name" | "isDemo">[],
  baseUrl: string,
  name?: string,
): Record<string, unknown> | null {
  const real = products.filter((p) => !p.isDemo);
  if (!real.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    ...(name ? { name } : {}),
    numberOfItems: real.length,
    itemListElement: real.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${baseUrl}/produtos/${p.slug}`,
      name: p.name,
    })),
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

/** Onde a loja vende: só no Paraná (Brasil). */
export const AREA_SERVED = { "@type": "State", name: "Paraná", containedInPlace: { "@type": "Country", name: "Brasil" } } as const;

/**
 * schema.org/Organization (OnlineStore) da loja: só com os dados que existem
 * em config/brand.ts. Contato, CNPJ e endereço entram sozinhos quando forem
 * preenchidos; campo vazio fica de fora (nunca inventado). A área atendida é
 * o Paraná (a loja vende só no estado).
 */
export function organizationJsonLd(baseUrl: string): Record<string, unknown> {
  const { contact, legal, social } = brand;
  const phone = contact.phone || contact.whatsapp;
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${baseUrl}/#loja`,
    name: brand.name,
    url: `${baseUrl}/`,
    description: brand.description,
    areaServed: AREA_SERVED,
    ...(legal.companyName ? { legalName: legal.companyName } : {}),
    ...(legal.cnpj ? { taxID: legal.cnpj } : {}),
    ...(legal.address ? { address: legal.address } : {}),
    ...(contact.email ? { email: contact.email } : {}),
    ...(phone ? { telephone: phone } : {}),
    ...(social.length ? { sameAs: social.map((s) => s.href) } : {}),
  };
}

/** schema.org/WebSite com a busca da loja (caixa de busca nos resultados do Google). */
export function websiteJsonLd(baseUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${baseUrl}/#site`,
    name: brand.name,
    url: `${baseUrl}/`,
    inLanguage: "pt-BR",
    publisher: { "@id": `${baseUrl}/#loja` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/busca?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * schema.org/LocalBusiness (FurnitureStore) só com endereço real completo
 * (rua, cidade, CEP e UF em `brand.location`). O Google exige o endereço
 * para negócio local; sem ele, nada é publicado (devolve null). Telefone,
 * CNPJ e horário entram quando existirem em config/brand.ts.
 * TODO(Cristian): endereço da loja/expedição e CNPJ.
 */
export function localBusinessJsonLd(baseUrl: string): Record<string, unknown> | null {
  const { location, contact, legal } = brand;
  if (!location.streetAddress || !location.addressLocality || !location.postalCode || !location.addressRegion) return null;
  const phone = contact.phone || contact.whatsapp;
  return {
    "@context": "https://schema.org",
    "@type": "FurnitureStore",
    "@id": `${baseUrl}/#negocio-local`,
    name: brand.name,
    url: `${baseUrl}/`,
    parentOrganization: { "@id": `${baseUrl}/#loja` },
    address: {
      "@type": "PostalAddress",
      streetAddress: location.streetAddress,
      addressLocality: location.addressLocality,
      addressRegion: location.addressRegion,
      postalCode: location.postalCode,
      addressCountry: "BR",
    },
    areaServed: AREA_SERVED,
    ...(phone ? { telephone: phone } : {}),
    ...(legal.cnpj ? { taxID: legal.cnpj } : {}),
    ...(contact.hours ? { openingHours: contact.hours } : {}),
  };
}

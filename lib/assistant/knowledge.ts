import { brand, whatsappHref } from "@/config/brand";
import { STORE_FAQ } from "@/content/faq";
import { formatPrice } from "@/lib/catalog/money";
import { availability, fromPriceCents, imageMedia, model3d, primaryImage, sortedVariants } from "@/lib/catalog/product-helpers";
import { FIRMNESS_LABELS, type Product } from "@/lib/catalog/types";

/**
 * Base de conhecimento do assistente: SÓ dados confirmados do catálogo e da
 * loja. O que não está confirmado aparece escrito como "não confirmado", para o
 * modelo não preencher a lacuna. O texto é determinístico (sem data/hora,
 * produtos em ordem fixa) para o prompt caching funcionar.
 */

const NOT_CONFIRMED = "não confirmado pela loja (não informe nenhum valor)";

function priceLine(product: Product): string {
  const variants = sortedVariants(product);
  if (variants.length) {
    return variants.map((v) => `${v.name}: ${formatPrice(v.priceCents)}`).join("; ");
  }
  const from = fromPriceCents(product);
  return from === null ? `ainda não definido — ${NOT_CONFIRMED}` : formatPrice(from);
}

function specsLines(product: Product): string[] {
  const a = product.attributes;
  const d = product.dimensions;
  const lines: string[] = [];
  const measures = [
    d.heightCm ? `altura ${d.heightCm} cm` : null,
    d.widthCm ? `largura ${d.widthCm} cm` : null,
    d.lengthCm ? `profundidade/comprimento ${d.lengthCm} cm` : null,
    d.weightKg ? `peso ${d.weightKg} kg` : null,
  ].filter(Boolean);
  lines.push(`- Medidas: ${measures.length ? measures.join(", ") : NOT_CONFIRMED}`);
  lines.push(`- Materiais: ${a.materials?.length ? a.materials.join(", ") : NOT_CONFIRMED}`);
  if (a.fabric) lines.push(`- Tecido: ${a.fabric}`);
  if (a.firmness) lines.push(`- Firmeza: ${FIRMNESS_LABELS[a.firmness]}`);
  lines.push(`- Garantia: ${a.warranty ?? NOT_CONFIRMED}`);
  if (a.care?.length) lines.push(`- Cuidados: ${a.care.join("; ")}`);
  for (const s of a.extraSpecs ?? []) lines.push(`- ${s.label}: ${s.value}`);
  return lines;
}

function stockLine(product: Product): string {
  const s = availability(product);
  return s === "in_stock" ? "disponível" : s === "out_of_stock" ? "indisponível no momento" : NOT_CONFIRMED;
}

export function productKnowledge(product: Product): string {
  const photos = imageMedia(product).length;
  return [
    `### ${product.name}`,
    `- Código (slug): ${product.slug}`,
    `- Página: /produtos/${product.slug}`,
    `- Categoria: ${product.category?.name ?? "sem categoria"}`,
    `- Preço: ${priceLine(product)}`,
    `- Estoque: ${stockLine(product)}`,
    `- Fotos: ${photos} foto(s) de catálogo${photos >= 4 ? " (frente, ¾, lado e costas)" : ""}, recriadas a partir de fotos reais e conferidas pela equipe`,
    `- Visualização 3D: ${model3d(product) ? "sim (botão “Girar em 3D” na página; modelo ilustrativo)" : "não tem"}`,
    ...specsLines(product),
    product.shortDescription ? `- Resumo: ${product.shortDescription}` : null,
    product.description ? `- Descrição:\n${product.description.trim()}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

function contactLines(): string[] {
  const { whatsapp, email, phone, hours } = brand.contact;
  const lines: string[] = [];
  const wa = whatsapp ? whatsappHref(whatsapp) : null;
  if (wa) lines.push(`- WhatsApp: ${whatsapp} (${wa})`);
  if (phone) lines.push(`- Telefone: ${phone}`);
  if (email) lines.push(`- E-mail: ${email}`);
  if (hours) lines.push(`- Horário: ${hours}`);
  if (!lines.length) lines.push("- Canais de contato ainda em configuração: indique a página /atendimento.");
  return lines;
}

/** Texto completo da base, estável entre requisições enquanto o catálogo não muda. */
export function buildKnowledge(products: Product[]): string {
  const sorted = [...products].sort((a, b) => a.slug.localeCompare(b.slug));
  return [
    `# Loja ${brand.name}`,
    "",
    "## Como comprar hoje",
    "- A compra online (pagamento no site) ainda está em preparação. A pessoa já pode escolher os produtos e montar a sacola.",
    "- Produto sem preço definido ainda não pode ir para a sacola.",
    "- Para fechar o pedido, a pessoa fala com o atendimento.",
    "- Frete e prazo de entrega: calculados pelo CEP quando a compra online for ativada. Não existe valor nem prazo para informar agora.",
    "- Trocas e devoluções: página /politicas/trocas-e-devolucoes. Entrega: página /politicas/entrega.",
    "",
    "## Atendimento humano",
    ...contactLines(),
    "",
    `## Produtos à venda (${sorted.length})`,
    ...(sorted.length ? sorted.map(productKnowledge) : ["Nenhum produto publicado no momento."]),
    "",
    "## Perguntas frequentes",
    ...STORE_FAQ.map((f) => `- ${f.question} ${f.answer}`),
  ].join("\n");
}

/** Dados mínimos para o cartão de produto no chat (montado no servidor, nunca pelo modelo). */
export type AssistantProductCard = {
  slug: string;
  name: string;
  url: string;
  imageUrl: string | null;
  imageAlt: string;
  priceText: string | null;
  has3d: boolean;
};

export function productCard(product: Product): AssistantProductCard {
  const image = primaryImage(product);
  const from = fromPriceCents(product);
  return {
    slug: product.slug,
    name: product.name,
    url: `/produtos/${product.slug}`,
    imageUrl: image?.url ?? null,
    imageAlt: image?.altText ?? product.name,
    priceText: from === null ? null : formatPrice(from),
    has3d: Boolean(model3d(product)),
  };
}

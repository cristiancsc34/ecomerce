import type { Product, ProductMedia, ProductVariant } from "./types";

/**
 * DADOS DE EXEMPLO, SÓ PARA DESENVOLVIMENTO: a Poltrona Azul em 5 cores, para ver
 * a troca de cor (fotos, 3D, AR e código QR) sem cadastrar na loja cores que ela
 * não vende.
 *
 * Liga com CATALOG_DEV_EXAMPLES=1, e só no modo demonstração e fora da Vercel
 * (produção e prévias nunca mostram). As fotos e o modelo vêm de
 * `npm run demo:variantes` (public/demo/exemplo): são a poltrona azul
 * recolorida, não fotos reais, e aparecem marcadas como ilustrativas. As cores
 * não têm preço ("Preço em breve"), como o produto.
 */
export function devExamplesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CATALOG_DEV_EXAMPLES === "1" && !env.VERCEL && env.CATALOG_SOURCE === "demo";
}

const COLORS = [
  { slug: "azul", name: "Azul", hex: "#2F3E62" },
  { slug: "marrom", name: "Marrom", hex: "#6B4A35" },
  { slug: "branco", name: "Branco", hex: "#ECE7DE" },
  { slug: "vermelho", name: "Vermelho", hex: "#9C2A2A" },
  { slug: "bege", name: "Bege", hex: "#CDB797" },
] as const;

const VIEWS = [
  { key: "frente", label: "vista frontal" },
  { key: "tres-quartos", label: "vista três-quartos" },
  { key: "lateral", label: "vista lateral" },
  { key: "traseira", label: "vista traseira" },
] as const;

const id = (n: number) => `00000000-0000-4000-8000-0000000e${String(n).padStart(4, "0")}`;

function withColors(product: Product): Product {
  const variants: ProductVariant[] = COLORS.map((c, i) => ({
    id: id(i + 1),
    name: c.name,
    sku: null,
    priceCents: null,
    stockQuantity: null,
    size: null,
    widthCm: null,
    lengthCm: null,
    colorHex: c.hex,
    example: true,
    sortOrder: i,
  }));
  // A primeira cor (azul) usa as fotos do produto; as outras, as recoloridas.
  const photos: ProductMedia[] = COLORS.slice(1).flatMap((c, ci) =>
    VIEWS.map((v, vi) => ({
      id: id(100 + ci * 10 + vi),
      type: "image",
      url: `/demo/exemplo/poltrona-${c.slug}-${v.key}.jpg`,
      storagePath: `demo/exemplo/poltrona-${c.slug}-${v.key}.jpg`,
      altText: `Poltrona ${c.name.toLowerCase()}, ${v.label} (cor de exemplo, imagem ilustrativa)`,
      sortOrder: vi,
      isPrimary: vi === 0,
      isIllustrative: true,
      aiGenerated: false,
      pendingReview: false,
      width: 1600,
      height: 1200,
      usdzUrl: null,
      realScale: false,
      boundsCm: null,
      variantId: variants[ci + 1].id,
    })),
  );
  // Um .glb só com as 5 cores (KHR_materials_variants): o visualizador troca pelo nome.
  const media = product.media.map((m) =>
    m.type === "model_3d"
      ? { ...m, url: "/demo/exemplo/poltrona-cores.glb", storagePath: "demo/exemplo/poltrona-cores.glb", altText: `${m.altText} Com as cores de exemplo.` }
      : m,
  );
  return { ...product, variants, media: [...media, ...photos] };
}

export function withDevExamples(products: Product[]): Product[] {
  return products.map((p) => (p.slug === "poltrona-azul" ? withColors(p) : p));
}

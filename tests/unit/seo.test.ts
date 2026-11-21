import { describe, expect, it } from "vitest";
import { CATEGORY_COLUMNS, CATEGORY_COLUMNS_LEGACY, missingCategorySeoMigration, selectCategoriesWithFallback } from "@/lib/catalog/category-columns";
import { mapCategory } from "@/lib/catalog/mappers";
import { categoryDescription, categoryTitle, clip, measuresText, productDescription, productTitle, shareableImage } from "@/lib/seo/metadata";
import { sitemapImages } from "@/lib/seo/sitemap";
import { CATEGORY_SEO } from "@/content/categorias-seo";
import { categoryContent } from "@/lib/seo/metadata";
import { articleJsonLd, itemListJsonLd, localBusinessJsonLd, organizationJsonLd, productJsonLd, websiteJsonLd } from "@/lib/seo/structured-data";
import { brand } from "@/config/brand";
import { makeMedia, makeProduct, makeVariant } from "./factories";

const base = "https://www.azconfort.com.br";

describe("JSON-LD do produto", () => {
  it("produto sem variação: Offer única com preço, medidas e materiais do cadastro", () => {
    const p = makeProduct({
      slug: "poltrona-azul",
      priceCents: 129900,
      variants: [],
      sku: "POL-1",
      dimensions: { widthCm: 80, lengthCm: 90, heightCm: 95, weightKg: 18 },
      attributes: { materials: ["Madeira maciça"], fabric: "Linho" },
    });
    const ld = productJsonLd(p, base)!;
    expect(ld["@type"]).toBe("Product");
    expect(ld.sku).toBe("POL-1");
    expect(ld.offers).toEqual({
      "@type": "Offer",
      priceCurrency: "BRL",
      price: "1299.00",
      url: `${base}/produtos/poltrona-azul`,
      seller: { "@type": "Organization", name: "AzConfort" },
    });
    expect(ld.width).toEqual({ "@type": "QuantitativeValue", value: 80, unitCode: "CMT" });
    expect(ld.depth).toEqual({ "@type": "QuantitativeValue", value: 90, unitCode: "CMT" });
    expect(ld.height).toEqual({ "@type": "QuantitativeValue", value: 95, unitCode: "CMT" });
    expect(ld.weight).toEqual({ "@type": "QuantitativeValue", value: 18, unitCode: "KGM" });
    expect(ld.material).toEqual(["Madeira maciça", "Linho"]);
  });

  it("nunca inventa avaliação, frete, devolução, condição ou código de barras", () => {
    const p = makeProduct({ priceCents: 5000, variants: [] });
    const json = JSON.stringify(productJsonLd(p, base));
    for (const field of ["aggregateRating", "review", "shippingDetails", "hasMerchantReturnPolicy", "itemCondition", "gtin", "priceValidUntil"]) {
      expect(json).not.toContain(field);
    }
  });

  it("sem medida ou material no cadastro, o campo fica de fora", () => {
    const ld = productJsonLd(makeProduct({ priceCents: 5000, variants: [] }), base)!;
    for (const k of ["width", "depth", "height", "weight", "material"]) expect(ld).not.toHaveProperty(k);
  });

  it("cores: ProductGroup com uma oferta por cor e o link que abre na cor", () => {
    const azul = makeVariant({ name: "Azul Marinho", colorHex: "#2F3E62", size: null, widthCm: null, lengthCm: null, priceCents: 189900, stockQuantity: 2, sortOrder: 0 });
    const bege = makeVariant({ name: "Bege", colorHex: "#CDB797", size: null, widthCm: null, lengthCm: null, priceCents: 199900, stockQuantity: 0, sortOrder: 1 });
    const p = makeProduct({
      slug: "sofa-3-lugares",
      name: "Sofá 3 Lugares",
      variants: [azul, bege],
      media: [
        makeMedia({ url: "https://cdn/produto.jpg" }),
        makeMedia({ url: "https://cdn/bege.jpg", isPrimary: false, variantId: bege.id }),
      ],
    });
    const ld = productJsonLd(p, base)!;
    expect(ld["@type"]).toBe("ProductGroup");
    expect(ld.productGroupID).toBe(p.id);
    expect(ld.variesBy).toEqual(["https://schema.org/color"]);
    const variants = ld.hasVariant as Record<string, unknown>[];
    expect(variants).toHaveLength(2);
    expect(variants[0]).toMatchObject({
      "@type": "Product",
      name: "Sofá 3 Lugares - Azul Marinho",
      color: "Azul Marinho",
      url: `${base}/produtos/sofa-3-lugares?cor=azul-marinho`,
      offers: { "@type": "Offer", price: "1899.00", availability: "https://schema.org/InStock" },
    });
    expect(variants[1]).toMatchObject({
      color: "Bege",
      image: ["https://cdn/bege.jpg"],
      offers: { price: "1999.00", availability: "https://schema.org/OutOfStock" },
    });
  });

  it("tamanhos: ProductGroup com o tamanho e as medidas de cada um", () => {
    const p = makeProduct({
      slug: "colchao",
      variants: [makeVariant({ size: "casal", priceCents: 150000 }), makeVariant({ size: "queen", widthCm: null, lengthCm: null, priceCents: 180000 })],
    });
    const ld = productJsonLd(p, base)!;
    expect(ld.variesBy).toEqual(["https://schema.org/size"]);
    const [casal, queen] = ld.hasVariant as Record<string, unknown>[];
    expect(casal).toMatchObject({ size: "Casal", url: `${base}/produtos/colchao?tamanho=casal`, width: { value: 138 }, depth: { value: 188 } });
    expect(queen).toMatchObject({ size: "Queen", width: { value: 158 }, depth: { value: 198 } });
    expect(casal).not.toHaveProperty("offers.availability");
  });

  it("variação sem preço fica de fora da lista", () => {
    const p = makeProduct({ variants: [makeVariant({ size: "casal", priceCents: 150000 }), makeVariant({ size: "king", priceCents: null })] });
    expect((productJsonLd(p, base)!.hasVariant as unknown[]).length).toBe(1);
  });

  it("fotos pendentes de revisão ou .svg não entram", () => {
    const p = makeProduct({
      priceCents: 1000,
      variants: [],
      media: [makeMedia({ url: "https://cdn/ok.jpg" }), makeMedia({ url: "https://cdn/p.jpg", pendingReview: true }), makeMedia({ url: "/x.svg" })],
    });
    expect(productJsonLd(p, base)!.image).toEqual(["https://cdn/ok.jpg"]);
  });
});

describe("ItemList das listagens", () => {
  it("links dos produtos na ordem da página, sem demonstração", () => {
    const a = makeProduct({ slug: "a", name: "A" });
    const demo = makeProduct({ slug: "d", isDemo: true });
    const b = makeProduct({ slug: "b", name: "B" });
    expect(itemListJsonLd([a, demo, b], base, "Sofás")).toEqual({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Sofás",
      numberOfItems: 2,
      itemListElement: [
        { "@type": "ListItem", position: 1, url: `${base}/produtos/a`, name: "A" },
        { "@type": "ListItem", position: 2, url: `${base}/produtos/b`, name: "B" },
      ],
    });
  });

  it("lista vazia não gera nada", () => {
    expect(itemListJsonLd([makeProduct({ isDemo: true })], base)).toBeNull();
  });
});

describe("títulos e resumos", () => {
  it("corta o resumo na palavra, até 160 caracteres", () => {
    const text = "Sofá ".repeat(60);
    const out = clip(text);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
    expect(clip("  curto \n texto ")).toBe("curto texto");
  });

  it("produto: usa o texto escrito pela equipe, nessa ordem", () => {
    expect(productDescription(makeProduct({ seoDescription: "Para o Google", shortDescription: "Curta" }), false)).toBe("Para o Google");
    expect(productDescription(makeProduct({ seoDescription: null, shortDescription: "Curta" }), false)).toBe("Curta");
    expect(productTitle({ seoTitle: "  ", name: "Poltrona" })).toBe("Poltrona");
    expect(productTitle({ seoTitle: "Poltrona azul de linho", name: "Poltrona" })).toBe("Poltrona azul de linho");
  });

  it("produto sem texto: frase só com dados do cadastro", () => {
    const p = makeProduct({
      name: "Mesa Redonda",
      seoDescription: null,
      shortDescription: null,
      description: null,
      category: { id: "c", slug: "mesas", name: "Mesas", requires3d: true },
      dimensions: { widthCm: 120, lengthCm: 120, heightCm: 75 },
    });
    expect(productDescription(p, true)).toBe("Mesa Redonda (mesas) na AzConfort, medidas L 120 × P 120 × A 75 cm, veja em 3D.");
    expect(measuresText({ dimensions: { heightCm: 75 } })).toBeNull();
  });

  it("categoria: título e resumo escritos, senão nome e contagem real", () => {
    const cat = { name: "Cadeiras", seoTitle: null, seoDescription: null, description: null };
    expect(categoryTitle(cat)).toBe("Cadeiras");
    expect(categoryDescription(cat, 3)).toBe("Veja 3 modelos de cadeiras na AzConfort. Móveis para a sua casa.");
    expect(categoryDescription(cat, 1)).toContain("1 modelo de");
    expect(categoryDescription({ ...cat, description: "Cadeiras de jantar." }, 3)).toBe("Cadeiras de jantar.");
    expect(categoryDescription({ ...cat, description: "x", seoDescription: "Para o Google" }, 3)).toBe("Para o Google");
    expect(categoryTitle({ ...cat, seoTitle: "Cadeiras de jantar" })).toBe("Cadeiras de jantar");
  });

  it("categoria sem texto no painel (ou antes da migração): usa o texto padrão por slug", () => {
    const base = { name: "Colchões", seoTitle: null, seoDescription: null, description: "Do banco.", content: null };
    expect(categoryTitle({ ...base, slug: "colchoes" })).toBe(CATEGORY_SEO.colchoes.title);
    expect(categoryDescription({ ...base, slug: "colchoes" }, 2)).toBe(CATEGORY_SEO.colchoes.description);
    expect(categoryContent({ content: null, slug: "colchoes" })).toEqual({ paragraphs: CATEGORY_SEO.colchoes.content, faq: CATEGORY_SEO.colchoes.faq });
    // O que a equipe escreveu no painel vale mais que o texto padrão.
    expect(categoryTitle({ ...base, slug: "colchoes", seoTitle: "Colchões do painel" })).toBe("Colchões do painel");
    expect(categoryDescription({ ...base, slug: "colchoes", seoDescription: "Resumo do painel" }, 2)).toBe("Resumo do painel");
    expect(categoryContent({ content: "Primeiro.\n\nSegundo.", slug: "colchoes" }).paragraphs).toEqual(["Primeiro.", "Segundo."]);
    // Slug sem texto padrão: o que existir no banco, como antes.
    expect(categoryTitle({ ...base, slug: "puffs" })).toBe("Colchões");
    expect(categoryDescription({ ...base, slug: "puffs" }, 2)).toBe("Do banco.");
    expect(categoryContent({ content: null, slug: "puffs" })).toEqual({ paragraphs: [], faq: [] });
  });

  it("foto de compartilhamento: só real", () => {
    expect(shareableImage(makeProduct({ media: [makeMedia({ isIllustrative: true })] }))).toBeNull();
    expect(shareableImage(makeProduct({ media: [makeMedia({ url: "https://cdn/a.jpg" })] }))?.url).toBe("https://cdn/a.jpg");
  });
});

describe("sitemap de imagens", () => {
  it("lista as fotos reais com URL completa, a principal primeiro", () => {
    const p = makeProduct({
      media: [
        makeMedia({ url: "/demo/b.jpg", isPrimary: false, sortOrder: 1 }),
        makeMedia({ url: "https://cdn/a.jpg", isPrimary: true }),
        makeMedia({ url: "https://cdn/i.jpg", isIllustrative: true }),
        makeMedia({ type: "model_3d", url: "https://cdn/m.glb" }),
      ],
    });
    expect(sitemapImages(p, base)).toEqual(["https://cdn/a.jpg", `${base}/demo/b.jpg`]);
  });
});

describe("categorias antes da migração de SEO", () => {
  const realErrors = [
    { code: "42703", message: "column categories.seo_title does not exist", details: null, hint: null },
    { code: "PGRST204", message: "Could not find the 'content' column of 'categories' in the schema cache", details: null, hint: null },
  ];

  it("reconhece as mensagens do banco sem a migração", () => {
    for (const e of realErrors) expect(missingCategorySeoMigration(e)).toBe(true);
    for (const e of [null, undefined, { message: "permission denied for table categories" }, { message: "column categories.name does not exist" }]) {
      expect(missingCategorySeoMigration(e)).toBe(false);
    }
  });

  it("lê de novo sem as colunas novas e os campos ficam vazios", async () => {
    const asked: string[] = [];
    const { result, legacy } = await selectCategoriesWithFallback(async (columns) => {
      asked.push(columns);
      return columns.includes("seo_title")
        ? { data: null, error: realErrors[0] }
        : { data: [{ id: "1", slug: "sofas", name: "Sofás", description: null, sort_order: 0, requires_3d: true }], error: null };
    });
    expect(asked).toEqual([CATEGORY_COLUMNS, CATEGORY_COLUMNS_LEGACY]);
    expect(legacy).toBe(true);
    expect(mapCategory(result.data![0])).toMatchObject({ seoTitle: null, seoDescription: null, content: null });
  });

  it("com a migração, lê tudo de uma vez", async () => {
    const { legacy } = await selectCategoriesWithFallback(async () => ({ data: [], error: null }));
    expect(legacy).toBe(false);
  });
});

describe("dados da loja (schema.org)", () => {
  it("Organization (OnlineStore) com área atendida no Paraná e sem campo legal vazio", () => {
    const ld = organizationJsonLd(base);
    expect(ld).toMatchObject({ "@type": "OnlineStore", "@id": `${base}/#loja`, areaServed: "Paraná" });
    for (const k of ["taxID", "legalName", "address", "telephone", "email"]) expect(ld).not.toHaveProperty(k);
  });

  it("um único WebSite com a busca da loja", () => {
    expect(websiteJsonLd(base)).toMatchObject({
      "@type": "WebSite",
      potentialAction: { "@type": "SearchAction", target: { urlTemplate: `${base}/busca?q={search_term_string}` } },
    });
  });

  it("LocalBusiness só com endereço real completo (hoje não sai)", () => {
    expect(localBusinessJsonLd(base)).toBeNull();
    const original = { ...brand.location };
    try {
      Object.assign(brand.location, { streetAddress: "Rua Exemplo, 100", addressLocality: "Cidade", postalCode: "00000-000", addressRegion: "PR" });
      expect(localBusinessJsonLd(base)).toMatchObject({ "@type": "FurnitureStore", address: { "@type": "PostalAddress", addressRegion: "PR" } });
    } finally {
      Object.assign(brand.location, original);
    }
  });

  it("Article só com guia real (autor e datas)", () => {
    const guia = { slug: "como-medir", title: "Como medir", description: "Resumo", author: "Equipe", datePublished: "2026-12-01", dateModified: "2026-12-02" };
    expect(articleJsonLd(guia, base)).toMatchObject({
      "@type": "Article",
      headline: "Como medir",
      author: { "@type": "Organization", name: "Equipe" },
      url: `${base}/guias/como-medir`,
    });
    expect(articleJsonLd({ ...guia, author: " " }, base)).toBeNull();
  });

  it("nenhum JSON-LD de FAQ (FAQPage) nem frete no Offer", () => {
    const json = JSON.stringify([
      productJsonLd(makeProduct({ priceCents: 1000, variants: [] }), base),
      productJsonLd(makeProduct({ variants: [makeVariant({ size: "casal" }), makeVariant({ size: "queen" })] }), base),
      organizationJsonLd(base),
      websiteJsonLd(base),
    ]);
    expect(json).not.toContain("FAQPage");
    expect(json).not.toContain("shippingDetails");
  });
});

import { describe, expect, it } from "vitest";
import { downloadHref, downloadName } from "@/components/product/architects";
import { devExamplesEnabled, withDevExamples } from "@/lib/catalog/dev-examples";
import { DEMO_PRODUCTS } from "@/lib/catalog/demo-data";
import { mapMedia, mapVariant } from "@/lib/catalog/mappers";
import { colorOptions, colorVariants, findColorVariant, galleryFor, modelFor, variantSlug } from "@/lib/catalog/variants";
import { formOutputToSaveInput, productFormSchema } from "@/lib/validation/product";
import { makeMedia, makeProduct, makeVariant } from "./factories";

const azul = makeVariant({ name: "Azul", size: null, widthCm: null, lengthCm: null, colorHex: "#2F3E62", sortOrder: 0, priceCents: 189900 });
const marrom = makeVariant({ name: "Marrom", size: null, widthCm: null, lengthCm: null, colorHex: "#6B4A35", sortOrder: 1, priceCents: 199900 });
const verde = makeVariant({ name: "Verde-sálvia", size: null, widthCm: null, lengthCm: null, colorHex: "#9CAF88", sortOrder: 2, priceCents: 199900 });

const baseModel = makeMedia({ type: "model_3d", url: "/m/base.glb", storagePath: "m/base.glb", isPrimary: false });
const marromModel = makeMedia({ type: "model_3d", url: "/m/marrom.glb", storagePath: "m/marrom.glb", isPrimary: false, variantId: marrom.id });
const baseFoto = makeMedia({ url: "/f/base.jpg" });
const marromFoto = makeMedia({ url: "/f/marrom.jpg", isPrimary: false, variantId: marrom.id });

const product = makeProduct({
  slug: "poltrona-x",
  variants: [verde, marrom, azul],
  media: [baseFoto, marromFoto, baseModel, marromModel],
});

describe("variantes de cor: dados", () => {
  it("lê a cor da variação e a variação da mídia (e ignora cor fora do formato)", () => {
    const v = mapVariant({ id: "v", name: "Marrom", sku: null, price_cents: 1, stock_quantity: null, attributes: { colorHex: "#6b4a35" }, sort_order: 0 });
    expect(v.colorHex).toBe("#6B4A35");
    expect(mapVariant({ id: "v", name: "x", sku: null, price_cents: 1, stock_quantity: null, attributes: { colorHex: "marrom" }, sort_order: 0 }).colorHex).toBeNull();
    const m = mapMedia({ id: "m", storage_path: "products/p/a.jpg", media_type: "image", alt_text: "", sort_order: 0, is_primary: false, is_illustrative: false, width: null, height: null, variant_id: "v" });
    expect(m.variantId).toBe("v");
  });

  it("o formulário do painel aceita a cor com ou sem # e recusa formato errado", () => {
    const base = {
      name: "Poltrona",
      slug: "poltrona",
      shortDescription: "",
      description: "",
      categoryId: "",
      price: "",
      compareAtPrice: "",
      sku: "",
      stockQuantity: "",
      heightCm: "",
      widthCm: "",
      lengthCm: "",
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
    };
    const variant = { name: "Marrom", sku: "", price: "1.999,00", stockQuantity: "", size: "", widthCm: "", lengthCm: "" };
    const ok = productFormSchema.safeParse({ ...base, variants: [{ ...variant, colorHex: "6b4a35" }] });
    expect(ok.success).toBe(true);
    if (ok.success) expect(formOutputToSaveInput(ok.data).variants[0].colorHex).toBe("#6B4A35");
    expect(productFormSchema.safeParse({ ...base, variants: [{ ...variant, colorHex: "" }] }).success).toBe(true);
    expect(productFormSchema.safeParse({ ...base, variants: [{ ...variant, colorHex: "marrom" }] }).success).toBe(false);
  });
});

describe("variantes de cor: o que a página mostra", () => {
  it("lista as cores na ordem do catálogo, com o nome no link", () => {
    expect(colorVariants(product).map((v) => v.name)).toEqual(["Azul", "Marrom", "Verde-sálvia"]);
    expect(variantSlug(verde)).toBe("verde-salvia");
    expect(findColorVariant(product, "verde-salvia")?.id).toBe(verde.id);
    expect(findColorVariant(product, "rosa")).toBeNull();
  });

  it("produto sem variação de cor: nenhuma opção (o seletor fica escondido)", () => {
    expect(colorOptions(makeProduct())).toEqual([]);
    expect(colorOptions(DEMO_PRODUCTS[0])).toEqual([]);
  });

  it("fotos: as da cor, se tiver; senão as do produto", () => {
    expect(galleryFor(product, marrom.id).map((m) => m.url)).toEqual(["/f/marrom.jpg"]);
    expect(galleryFor(product, verde.id).map((m) => m.url)).toEqual(["/f/base.jpg"]);
    expect(galleryFor(product, null).map((m) => m.url)).toEqual(["/f/base.jpg"]);
  });

  it("modelo próprio troca o arquivo; sem ele, pinta o modelo do produto (menos a primeira cor)", () => {
    expect(modelFor(product, marrom)).toMatchObject({ own: true, tint: null, model: { url: "/m/marrom.glb" } });
    expect(modelFor(product, verde)).toMatchObject({ own: false, tint: "#9CAF88", model: { url: "/m/base.glb" } });
    // A primeira cor é a das fotos e do modelo do produto.
    expect(modelFor(product, azul)).toMatchObject({ own: false, tint: null, model: { url: "/m/base.glb" } });
  });

  it("cor pintada na hora não usa o .usdz pronto (que está na cor original)", () => {
    const usdzModel = { ...baseModel, usdzUrl: "/m/base.usdz", realScale: true, boundsCm: { widthCm: 78, depthCm: 90, heightCm: 100 } };
    const p = { ...product, dimensions: { widthCm: 78, lengthCm: 90, heightCm: 100 }, media: [baseFoto, usdzModel] };
    expect(modelFor(p, azul)).toMatchObject({ usdzUrl: "/m/base.usdz", realScale: true });
    expect(modelFor(p, verde)).toMatchObject({ usdzUrl: null, tint: "#9CAF88" });
  });
});

describe("exemplo de cores (só desenvolvimento)", () => {
  it("só liga com a variável, no modo demonstração e fora da Vercel", () => {
    expect(devExamplesEnabled({ CATALOG_DEV_EXAMPLES: "1", CATALOG_SOURCE: "demo" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(devExamplesEnabled({ CATALOG_SOURCE: "demo" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(devExamplesEnabled({ CATALOG_DEV_EXAMPLES: "1", CATALOG_SOURCE: "demo", VERCEL: "1" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(devExamplesEnabled({ CATALOG_DEV_EXAMPLES: "1", CATALOG_SOURCE: "supabase" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("a poltrona ganha azul, marrom, branco, vermelho e bege, sem preço e marcadas como exemplo", () => {
    const poltrona = withDevExamples(DEMO_PRODUCTS).find((p) => p.slug === "poltrona-azul")!;
    expect(poltrona.variants.map((v) => [v.name, v.colorHex, v.priceCents, v.example])).toEqual([
      ["Azul", "#2F3E62", null, true],
      ["Marrom", "#6B4A35", null, true],
      ["Branco", "#ECE7DE", null, true],
      ["Vermelho", "#9C2A2A", null, true],
      ["Bege", "#CDB797", null, true],
    ]);
    const options = colorOptions(poltrona);
    // Azul usa as fotos reais do produto; as outras, as recoloridas (marcadas como ilustrativas).
    expect(options[0].gallery.every((m) => m.url.startsWith("/demo/poltrona-azul-"))).toBe(true);
    expect(options[1].gallery.map((m) => m.url)).toEqual([
      "/demo/exemplo/poltrona-marrom-frente.jpg",
      "/demo/exemplo/poltrona-marrom-tres-quartos.jpg",
      "/demo/exemplo/poltrona-marrom-lateral.jpg",
      "/demo/exemplo/poltrona-marrom-traseira.jpg",
    ]);
    expect(options[1].gallery.every((m) => m.isIllustrative)).toBe(true);
    // Um .glb com as cores (KHR_materials_variants).
    expect(options.every((o) => o.model.model?.url === "/demo/exemplo/poltrona-cores.glb")).toBe(true);
    // A cadeira não muda.
    expect(withDevExamples(DEMO_PRODUCTS).find((p) => p.slug === "cadeira-cinza-trama")).toBe(DEMO_PRODUCTS[1]);
  });
});

describe("arquitetos: arquivos com nome legível", () => {
  it("nomes cuxoes-<produto>[-<cor>].glb|usdz", () => {
    expect(downloadName("poltrona-azul", "glb")).toBe("cuxoes-poltrona-azul.glb");
    expect(downloadName("poltrona-azul", "usdz")).toBe("cuxoes-poltrona-azul.usdz");
    expect(downloadName("poltrona-azul", "glb", "marrom")).toBe("cuxoes-poltrona-azul-marrom.glb");
  });

  it("no Storage o nome vai por ?download=; arquivos do próprio site usam o atributo download", () => {
    expect(downloadHref("/demo/poltrona-azul.glb", "cuxoes-poltrona-azul.glb")).toBe("/demo/poltrona-azul.glb");
    expect(
      downloadHref("https://x.supabase.co/storage/v1/object/public/product-media/products/p/m.glb", "cuxoes-poltrona-azul.glb"),
    ).toBe("https://x.supabase.co/storage/v1/object/public/product-media/products/p/m.glb?download=cuxoes-poltrona-azul.glb");
  });
});

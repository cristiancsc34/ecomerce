import { describe, expect, it } from "vitest";
import { productToFormValues } from "@/lib/admin/form-values";
import {
  formOutputToSaveInput,
  productFormSchema,
  productSaveSchema,
  publishIssues,
  type ProductFormValues,
} from "@/lib/validation/product";
import { makeMedia, makeProduct, makeVariant } from "./factories";

function validForm(overrides: Partial<ProductFormValues> = {}): ProductFormValues {
  return {
    ...productToFormValues(null),
    name: "Colchão Brisa",
    slug: "colchao-brisa",
    description: "Texto revisado.",
    categoryId: "00000000-0000-4000-8000-0000000000c1",
    variants: [
      { name: "Casal", sku: "BR-C", price: "1.899,00", stockQuantity: "", size: "casal", widthCm: "138", lengthCm: "188" },
    ],
    firmness: "medio",
    heightCm: "28",
    materialsText: "Espuma D33\n\nMola ensacada\n",
    ...overrides,
  };
}

describe("formulário de produto", () => {
  it("converte texto do formulário para o formato salvo (centavos, listas, nulos)", () => {
    const out = productFormSchema.parse(validForm());
    const input = formOutputToSaveInput(out);
    expect(input.variants[0].priceCents).toBe(189900);
    expect(input.priceCents).toBeNull();
    expect(input.attributes).toEqual({ firmness: "medio", materials: ["Espuma D33", "Mola ensacada"] });
    expect(input.dimensions).toEqual({ heightCm: 28 });
    expect(input.shortDescription).toBeNull();
    expect(productSaveSchema.safeParse(input).success).toBe(true);
  });

  it("aponta erros em português nos campos certos", () => {
    const result = productFormSchema.safeParse(
      validForm({ slug: "Slug Inválido", variants: [{ name: "", sku: "", price: "abc", stockQuantity: "-1", size: "", widthCm: "", lengthCm: "" }] }),
    );
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["slug", "variants.0.name", "variants.0.price", "variants.0.stockQuantity"]));
  });

  it("produto → formulário → produto preserva os dados", () => {
    const product = makeProduct({
      priceCents: null,
      sku: "SKU-1",
      stockQuantity: 4,
      dimensions: { heightCm: 30.5, weightKg: 22 },
      attributes: { firmness: "firme", layers: ["Pillow top", "Molas"], warranty: "1 ano", care: ["Ventilar"], extraSpecs: [{ label: "Densidade", value: "D33" }] },
      faq: [{ question: "Vem enrolado?", answer: "Sim." }],
      variants: [makeVariant({ priceCents: 249900, stockQuantity: 1, sku: "SKU-1-C" })],
    });
    const out = productFormSchema.parse(productToFormValues(product));
    const input = formOutputToSaveInput(out);
    expect(input.dimensions).toEqual(product.dimensions);
    expect(input.attributes).toEqual(product.attributes);
    expect(input.faq).toEqual(product.faq);
    expect(input.variants[0]).toMatchObject({ id: product.variants[0].id, priceCents: 249900, stockQuantity: 1, sku: "SKU-1-C" });
    expect(productSaveSchema.safeParse(input).success).toBe(true);
  });
});

describe("regras do formato salvo", () => {
  const base = formOutputToSaveInput(productFormSchema.parse(validForm({ price: "1.000,00" })));

  it("preço “de” só se for maior que o preço atual", () => {
    expect(productSaveSchema.safeParse({ ...base, compareAtPriceCents: 90000 }).success).toBe(false);
    expect(productSaveSchema.safeParse({ ...base, compareAtPriceCents: 120000 }).success).toBe(true);
    expect(productSaveSchema.safeParse({ ...base, priceCents: null, compareAtPriceCents: 120000 }).success).toBe(false);
  });

  it("recusa SKU repetido entre produto e variações", () => {
    expect(productSaveSchema.safeParse({ ...base, sku: "BR-C" }).success).toBe(false);
  });

  it("recusa preço negativo, float e atributos desconhecidos são descartados", () => {
    expect(productSaveSchema.safeParse({ ...base, priceCents: -1 }).success).toBe(false);
    expect(productSaveSchema.safeParse({ ...base, priceCents: 10.5 }).success).toBe(false);
    const parsed = productSaveSchema.parse({ ...base, attributes: { ...base.attributes, certificado: "falso" } });
    expect(parsed.attributes).not.toHaveProperty("certificado");
  });
});

describe("prontidão para publicar", () => {
  it("produto completo pode publicar", () => {
    expect(publishIssues(makeProduct())).toEqual([]);
  });

  it("demonstração nunca publica", () => {
    expect(publishIssues(makeProduct({ isDemo: true })).map((i) => i.field)).toContain("isDemo");
  });

  it("exige preço, descrição, categoria, foto principal real e alt text", () => {
    const issues = publishIssues(
      makeProduct({
        priceCents: null,
        variants: [],
        description: " ",
        category: null,
        media: [makeMedia({ isIllustrative: true, altText: "x" })],
      }),
    ).map((i) => i.message);
    expect(issues.join(" ")).toMatch(/preço/);
    expect(issues.join(" ")).toMatch(/descrição/);
    expect(issues.join(" ")).toMatch(/categoria/);
    expect(issues.join(" ")).toMatch(/foto real/);
    expect(issues.join(" ")).toMatch(/texto alternativo/);
  });

  it("sem foto não publica", () => {
    expect(publishIssues(makeProduct({ media: [] })).map((i) => i.field)).toContain("media");
  });
});

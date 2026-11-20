import { SIZE_INFO, type Category, type Product, type SizeKey } from "./types";
import { categoryPath, isSectionCategory, sectionByKey, sectionKeyForCategory, SECTIONS, type SectionKey } from "./sections";

/**
 * Subcategorias fixas, calculadas a partir do cadastro (nada é marcado à mão):
 * - colchões por tamanho: variação com o tamanho-padrão ou medidas que batem
 *   com ele (±2 cm);
 * - sofás por lugares: especificação "Lugares" do cadastro ou o número de
 *   lugares escrito no nome do produto ("Sofá 3 lugares retrátil").
 */
export type Facet = {
  section: SectionKey;
  slug: string;
  /** Nome curto (trilha, atalhos). */
  name: string;
  match: (product: Product) => boolean;
};

const MATTRESS_SIZES: SizeKey[] = ["solteiro", "solteiro-king", "casal", "queen", "king"];
const TOLERANCE_CM = 2;

function near(a: number | null | undefined, b: number): boolean {
  return typeof a === "number" && Math.abs(a - b) <= TOLERANCE_CM;
}

/** Tamanho-padrão de colchão que corresponde a largura × comprimento (±2 cm). */
export function sizeFromMeasures(widthCm: number | null | undefined, lengthCm: number | null | undefined): SizeKey | null {
  return MATTRESS_SIZES.find((k) => near(widthCm, SIZE_INFO[k].widthCm) && near(lengthCm, SIZE_INFO[k].lengthCm)) ?? null;
}

/** Tamanhos de colchão que o produto tem (variações ou medidas do próprio produto). */
export function productSizes(product: Pick<Product, "variants" | "dimensions">): SizeKey[] {
  const found = new Set<SizeKey>();
  for (const v of product.variants) {
    const size = v.size ?? sizeFromMeasures(v.widthCm, v.lengthCm);
    if (size) found.add(size);
  }
  const own = sizeFromMeasures(product.dimensions.widthCm, product.dimensions.lengthCm);
  if (own) found.add(own);
  return MATTRESS_SIZES.filter((k) => found.has(k));
}

const SEAT_WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5 };

function seatNumber(text: string): number | null {
  const flat = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const digit = flat.match(/\b(\d)\s*lugar(?:es)?\b/);
  if (digit) return Number(digit[1]);
  const word = flat.match(/\b(um|uma|dois|duas|tres|quatro|cinco)\s+lugar(?:es)?\b/);
  return word ? SEAT_WORDS[word[1]] : null;
}

/** Número de lugares do estofado: especificação "Lugares" do cadastro ou o nome do produto. */
export function productSeats(product: Pick<Product, "name" | "attributes">): number | null {
  const spec = product.attributes.extraSpecs?.find((s) => /lugar/i.test(s.label));
  if (spec) {
    const n = Number.parseInt(spec.value, 10);
    if (Number.isInteger(n) && n > 0) return n;
    const fromText = seatNumber(`${spec.value} lugares`);
    if (fromText) return fromText;
  }
  return seatNumber(product.name);
}

export const FACETS: readonly Facet[] = [
  ...MATTRESS_SIZES.map(
    (size): Facet => ({
      section: "colchoes",
      slug: size,
      name: `Colchão ${SIZE_INFO[size].label.toLowerCase()}`,
      match: (p) => productSizes(p).includes(size),
    }),
  ),
  { section: "estofados", slug: "sofa-2-lugares", name: "Sofá 2 lugares", match: (p) => productSeats(p) === 2 },
  { section: "estofados", slug: "sofa-3-lugares", name: "Sofá 3 lugares", match: (p) => productSeats(p) === 3 },
];

export function facetsOf(section: SectionKey): Facet[] {
  return FACETS.filter((f) => f.section === section);
}

/** Seção do produto (pela categoria do banco); produto sem categoria fica só em /produtos. */
export function productSection(product: Pick<Product, "category">): SectionKey | null {
  return product.category ? sectionKeyForCategory(product.category.slug) : null;
}

export function productsInSection(products: Product[], section: SectionKey): Product[] {
  return products.filter((p) => productSection(p) === section);
}

/** Categorias do banco que viram subpágina da seção (a que tem o nome da seção é a própria seção). */
export function sectionCategories<C extends Pick<Category, "slug">>(categories: C[], section: SectionKey): C[] {
  return categories.filter((c) => sectionKeyForCategory(c.slug) === section && !isSectionCategory(c.slug));
}

export type Subpage =
  | { kind: "facet"; section: SectionKey; slug: string; path: string; name: string; facet: Facet; category: null }
  | { kind: "category"; section: SectionKey; slug: string; path: string; name: string; facet: null; category: Category };

/**
 * Subpágina de uma seção pelo slug: subcategoria fixa (tamanho, lugares) ou
 * categoria do banco. Se uma categoria do banco tiver o mesmo slug de uma
 * subcategoria fixa, a página junta os produtos das duas.
 */
export function resolveSubpage(section: SectionKey, slug: string, categories: Category[]): Subpage | null {
  const base = sectionByKey(section).path;
  const facet = facetsOf(section).find((f) => f.slug === slug);
  if (facet) return { kind: "facet", section, slug, path: `${base}/${slug}`, name: facet.name, facet, category: null };
  const category = sectionCategories(categories, section).find((c) => c.slug === slug);
  if (category) return { kind: "category", section, slug, path: categoryPath(category.slug), name: category.name, facet: null, category };
  return null;
}

/** Produtos de uma subpágina (sempre dentro da seção). */
export function productsInSubpage(products: Product[], sub: Subpage): Product[] {
  return productsInSection(products, sub.section).filter(
    (p) => p.category?.slug === sub.slug || (sub.facet ? sub.facet.match(p) : false),
  );
}

export type SubpageLink = { path: string; name: string; count: number };

/** Atalhos para as subpáginas da seção que têm produto (subcategorias fixas primeiro). */
export function subpageLinks(section: SectionKey, products: Product[], categories: Category[]): SubpageLink[] {
  const inSection = productsInSection(products, section);
  const facets = facetsOf(section).map((f) => ({
    path: `${sectionByKey(section).path}/${f.slug}`,
    name: f.name,
    count: inSection.filter((p) => f.match(p) || p.category?.slug === f.slug).length,
  }));
  const facetSlugs = new Set(facetsOf(section).map((f) => f.slug));
  const cats = sectionCategories(categories, section)
    .filter((c) => !facetSlugs.has(c.slug))
    .map((c) => ({ path: categoryPath(c.slug), name: c.name, count: inSection.filter((p) => p.category?.slug === c.slug).length }));
  return [...facets, ...cats].filter((l) => l.count > 0);
}

/** Seções com pelo menos um produto, na ordem do menu. */
export function sectionsWithProducts(products: Pick<Product, "category">[]) {
  return SECTIONS.map((s) => ({ ...s, count: products.filter((p) => productSection(p) === s.key).length })).filter((s) => s.count > 0);
}

export type Crumb = { name: string; path: string };

/**
 * Trilha de navegação do produto: Início › Seção › (categoria, quando ela é
 * subpágina) › Produto. Sem categoria: Início › Todos os produtos › Produto.
 */
export function productBreadcrumbs(product: Pick<Product, "name" | "slug" | "category">): Crumb[] {
  const self = { name: product.name, path: `/produtos/${product.slug}` };
  if (!product.category) return [{ name: "Início", path: "/" }, { name: "Todos os produtos", path: "/produtos" }, self];
  const section = sectionByKey(sectionKeyForCategory(product.category.slug));
  const category = isSectionCategory(product.category.slug)
    ? []
    : [{ name: product.category.name, path: categoryPath(product.category.slug) }];
  return [{ name: "Início", path: "/" }, { name: section.name, path: section.path }, ...category, self];
}

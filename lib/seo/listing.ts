import type { Metadata } from "next";
import { FACET_COPY, SECTION_COPY } from "@/content/categorias";
import { sectionByKey, SECTIONS, type SectionKey } from "@/lib/catalog/sections";
import {
  productsInSection,
  productsInSubpage,
  subpageLinks,
  type Crumb,
  type Subpage,
  type SubpageLink,
} from "@/lib/catalog/taxonomy";
import type { Category, Product } from "@/lib/catalog/types";
import { categoryDescription, categoryTitle, clip, OPEN_GRAPH_BASE, shareableImage } from "./metadata";
import { pageRobots } from "./robots";

/** Tudo o que uma página de listagem (seção ou subcategoria) mostra e manda para o Google. */
export type ListingView = {
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string[];
  /** Texto longo escrito no painel para a categoria (abaixo dos produtos). */
  content: string | null;
  /** Nome usado no bloco "Sobre …" do texto longo. */
  contentLabel: string;
  breadcrumbs: Crumb[];
  products: Product[];
  /** Atalhos: subcategorias (na seção) ou as irmãs (na subcategoria). */
  links: SubpageLink[];
  linksTitle: string;
  /** Outras seções, para ligar as páginas entre si. */
  otherSections: { path: string; name: string }[];
};

function others(section: SectionKey) {
  return SECTIONS.filter((s) => s.key !== section).map((s) => ({ path: s.path, name: s.name }));
}

/** Página da seção (/colchoes, /estofados, /moveis). */
export function sectionView(section: SectionKey, products: Product[], categories: Category[]): ListingView {
  const def = sectionByKey(section);
  const copy = SECTION_COPY[section];
  // Categoria do banco com o nome da seção: o texto escrito no painel vale mais que o padrão.
  const own = categories.find((c) => c.slug === section) ?? null;
  return {
    path: def.path,
    title: own?.seoTitle?.trim() || copy.title,
    description: clip(own?.seoDescription?.trim() || copy.description),
    h1: copy.h1,
    intro: copy.intro,
    content: own?.content ?? null,
    contentLabel: def.name.toLowerCase(),
    breadcrumbs: [
      { name: "Início", path: "/" },
      { name: def.name, path: def.path },
    ],
    products: productsInSection(products, section),
    links: subpageLinks(section, products, categories),
    linksTitle: `Escolha por ${section === "colchoes" ? "tamanho" : "tipo"}`,
    otherSections: others(section),
  };
}

/** Subcategoria (tamanho, lugares ou categoria do banco dentro da seção). */
export function subpageView(sub: Subpage, products: Product[], categories: Category[]): ListingView {
  const def = sectionByKey(sub.section);
  const inSub = productsInSubpage(products, sub);
  const siblings = subpageLinks(sub.section, products, categories).filter((l) => l.path !== sub.path);
  const breadcrumbs = [
    { name: "Início", path: "/" },
    { name: def.name, path: def.path },
    { name: sub.name, path: sub.path },
  ];
  const base = { path: sub.path, breadcrumbs, products: inSub, links: siblings, otherSections: others(sub.section) };

  if (sub.kind === "facet") {
    const copy = FACET_COPY[sub.slug];
    // Categoria do banco com o mesmo slug: o texto do painel entra embaixo.
    const own = categories.find((c) => c.slug === sub.slug) ?? null;
    return {
      ...base,
      title: own?.seoTitle?.trim() || copy.title,
      description: clip(own?.seoDescription?.trim() || copy.description),
      h1: copy.h1,
      intro: copy.intro,
      content: own?.content ?? null,
      contentLabel: sub.name.toLowerCase(),
      linksTitle: `Outras opções em ${def.name.toLowerCase()}`,
    };
  }

  const category = sub.category;
  return {
    ...base,
    title: categoryTitle(category),
    description: categoryDescription(category, inSub.length),
    h1: category.name,
    intro: category.description?.trim() ? [category.description.trim()] : [],
    content: category.content,
    contentLabel: category.name.toLowerCase(),
    linksTitle: `Outras opções em ${def.name.toLowerCase()}`,
  };
}

/**
 * Metadata da listagem: canonical próprio, Open Graph com foto real do
 * primeiro produto e `noindex` enquanto a página não tiver produto (ou com a
 * trava de indexação fechada).
 */
export function listingMetadata(view: ListingView): Metadata {
  const image = view.products.map(shareableImage).find(Boolean) ?? null;
  const images = image ? [{ url: image.url, alt: image.altText }] : undefined;
  const robots = pageRobots(view.products.length > 0);
  return {
    title: view.title,
    description: view.description,
    alternates: { canonical: view.path },
    ...(robots ? { robots } : {}),
    openGraph: { ...OPEN_GRAPH_BASE, type: "website", title: view.title, description: view.description, url: view.path, ...(images ? { images } : {}) },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: view.title,
      description: view.description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}

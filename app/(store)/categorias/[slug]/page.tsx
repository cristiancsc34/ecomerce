import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { isDemoMode, siteUrl } from "@/config/site";
import { guiasDaCategoria } from "@/content/guias";
import { getCategories, getCategoryBySlug, getVisibleProducts } from "@/lib/catalog/queries";
import { ProductSection, ProductSectionSkeleton } from "@/components/catalog/product-section";
import { JsonLd } from "@/components/seo/json-ld";
import { PageBreadcrumbs } from "@/components/seo/page-breadcrumbs";
import { FaqList } from "@/components/ui/faq-list";
import { categoryBreadcrumbs } from "@/lib/seo/breadcrumbs";
import { categoryContent, categoryDescription, categoryTitle, OPEN_GRAPH_BASE, shareableImage } from "@/lib/seo/metadata";
import { pageRobots, productStructuredDataAllowed } from "@/lib/seo/robots";
import { itemListJsonLd } from "@/lib/seo/structured-data";

export async function generateStaticParams() {
  const categories = await getCategories().catch((error: unknown) => {
    // Falha no catálogo não quebra o build: segue só o placeholder e as páginas são montadas na visita.
    console.error("Categorias: falha ao ler o catálogo no generateStaticParams; usando só o placeholder.", error);
    return [];
  });
  // Cache Components exige ao menos um parâmetro; um placeholder cai em notFound().
  return categories.length ? categories.map((c) => ({ slug: c.slug })) : [{ slug: "__vazio__" }];
}

export async function generateMetadata({ params }: PageProps<"/categorias/[slug]">): Promise<Metadata> {
  // Lido a cada visita: o "shell" pré-renderizado guardaria o catálogo do momento
  // do build, e algo publicado depois abriria como "não encontrado".
  await connection();
  const { slug } = await params;
  const [category, products] = await Promise.all([getCategoryBySlug(slug), getVisibleProducts()]);
  // Categoria inexistente: 404 (o proxy.ts já responde 404 antes da página na visita direta).
  if (!category) notFound();
  const inCategory = products.filter((p) => p.category?.slug === slug);
  const title = categoryTitle(category);
  const description = categoryDescription(category, inCategory.length);
  const path = `/categorias/${category.slug}`;
  // Foto real do primeiro produto da categoria para o WhatsApp e o Google.
  const image = inCategory.map(shareableImage).find(Boolean) ?? null;
  const images = image ? [{ url: image.url, alt: image.altText }] : undefined;
  // Categoria ainda sem produto (ou trava de indexação fechada): fora do Google, mas existe (200).
  const robots = pageRobots(inCategory.length > 0);
  return {
    title,
    description,
    alternates: { canonical: path },
    ...(robots ? { robots } : {}),
    openGraph: { ...OPEN_GRAPH_BASE, type: "website", title, description, url: path, ...(images ? { images } : {}) },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}

export default function CategoryPage({ params }: PageProps<"/categorias/[slug]">) {
  return (
    <div className="mx-auto w-full max-w-[80rem] px-1.5 pt-2 sm:px-6 sm:pt-6 lg:px-8">
      <Suspense fallback={<ProductSectionSkeleton />}>
        <Results params={params} />
      </Suspense>
    </div>
  );
}

async function Results({ params }: Pick<PageProps<"/categorias/[slug]">, "params">) {
  // Lista montada a cada visita (os dados vêm do cache): publicar no painel aparece na hora.
  await connection();
  const { slug } = await params;
  const [category, products] = await Promise.all([getCategoryBySlug(slug), getVisibleProducts()]);
  if (!category) notFound();
  const inCategory = products.filter((p) => p.category?.slug === slug);
  const structured = !isDemoMode();
  const list = structured && productStructuredDataAllowed() ? itemListJsonLd(inCategory, siteUrl(), category.name) : null;
  const { paragraphs, faq } = categoryContent(category);
  const guias = guiasDaCategoria(category.slug);
  return (
    <div className="space-y-2 sm:space-y-4">
      {list ? <JsonLd data={list} /> : null}
      <PageBreadcrumbs items={categoryBreadcrumbs(category)} structured={structured} className="px-2.5 sm:px-0" />
      <ProductSection
        id="categoria-titulo"
        title={category.name}
        headingLevel="h1"
        intro={category.description}
        products={inCategory}
        priorityCount={4}
        empty={{ title: "Nenhum produto nesta categoria por enquanto" }}
      />
      {paragraphs.length ? (
        <section aria-labelledby="categoria-sobre" className="bg-white px-4 py-5 sm:rounded-lg sm:px-6">
          <h2 id="categoria-sobre" className="mb-3 text-base font-bold uppercase tracking-wide text-deep-fjord">
            Sobre {category.name.toLowerCase()}
          </h2>
          <div className="space-y-3 text-[0.9375rem] leading-relaxed text-ink sm:text-base">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
      ) : null}
      {faq.length ? (
        <section aria-labelledby="categoria-duvidas" className="bg-white px-4 py-5 sm:rounded-lg sm:px-6">
          <h2 id="categoria-duvidas" className="mb-3 text-base font-bold uppercase tracking-wide text-deep-fjord">
            Dúvidas frequentes
          </h2>
          {/* Só texto visível: sem schema FAQPage (o Google descontinuou o resultado de FAQ). */}
          <FaqList items={faq} />
        </section>
      ) : null}
      {guias.length ? (
        <nav aria-labelledby="categoria-guias" className="bg-white px-4 py-4 sm:rounded-lg sm:px-6">
          <h2 id="categoria-guias" className="text-sm font-bold uppercase tracking-wide text-deep-fjord">
            Guias de compra
          </h2>
          <ul className="mt-1">
            {guias.map((g) => (
              <li key={g.slug}>
                <Link href={`/guias/${g.slug}`} className="link inline-flex min-h-11 items-center">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

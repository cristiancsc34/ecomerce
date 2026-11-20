import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { isDemoMode, siteUrl } from "@/config/site";
import { getCategories, getCategoryBySlug, getVisibleProducts } from "@/lib/catalog/queries";
import { ProductSection, ProductSectionSkeleton } from "@/components/catalog/product-section";
import { JsonLd } from "@/components/seo/json-ld";
import { Paragraphs } from "@/components/ui/paragraphs";
import { categoryDescription, categoryTitle, OPEN_GRAPH_BASE, shareableImage } from "@/lib/seo/metadata";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo/structured-data";

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
  if (!category) return { title: "Categoria não encontrada", robots: { index: false } };
  const inCategory = products.filter((p) => p.category?.slug === slug);
  const title = categoryTitle(category);
  const description = categoryDescription(category, inCategory.length);
  const path = `/categorias/${category.slug}`;
  // Foto real do primeiro produto da categoria para o WhatsApp e o Google.
  const image = inCategory.map(shareableImage).find(Boolean) ?? null;
  const images = image ? [{ url: image.url, alt: image.altText }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: path },
    // Categoria ainda sem produto: página vazia não deve ir para o Google.
    ...(inCategory.length ? {} : { robots: { index: false, follow: true } }),
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
  const base = siteUrl();
  const list = itemListJsonLd(inCategory, base, category.name);
  return (
    <>
      {!isDemoMode() ? (
        <>
          <JsonLd
            data={breadcrumbJsonLd(
              [
                { name: "Início", path: "/" },
                { name: category.name, path: `/categorias/${category.slug}` },
              ],
              base,
            )}
          />
          {list ? <JsonLd data={list} /> : null}
        </>
      ) : null}
      <ProductSection
        id="categoria-titulo"
        title={category.name}
        headingLevel="h1"
        intro={category.description}
        products={inCategory}
        priorityCount={4}
        empty={{ title: "Nenhum produto nesta categoria por enquanto" }}
      />
      {category.content ? (
        <section aria-labelledby="categoria-sobre" className="mt-2 bg-white px-4 py-5 sm:mt-4 sm:rounded-lg sm:px-6">
          <h2 id="categoria-sobre" className="mb-3 text-base font-bold uppercase tracking-wide text-deep-fjord">
            Sobre {category.name.toLowerCase()}
          </h2>
          <Paragraphs text={category.content} />
        </section>
      ) : null}
    </>
  );
}

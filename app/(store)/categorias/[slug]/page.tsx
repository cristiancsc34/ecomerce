import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { isDemoMode, siteUrl } from "@/config/site";
import { getCategories, getCategoryBySlug, getVisibleProducts } from "@/lib/catalog/queries";
import { ProductSection, ProductSectionSkeleton } from "@/components/catalog/product-section";
import { JsonLd } from "@/components/seo/json-ld";

export async function generateStaticParams() {
  const categories = await getCategories();
  // Cache Components exige ao menos um parâmetro; um placeholder cai em notFound().
  return categories.length ? categories.map((c) => ({ slug: c.slug })) : [{ slug: "__vazio__" }];
}

export async function generateMetadata({ params }: PageProps<"/categorias/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Categoria não encontrada" };
  return {
    title: category.name,
    description: category.description ?? `${category.name} da ${brand.name}.`,
    alternates: { canonical: `/categorias/${category.slug}` },
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
  return (
    <>
      {!isDemoMode() ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Início", item: `${siteUrl()}/` },
              { "@type": "ListItem", position: 2, name: category.name, item: `${siteUrl()}/categorias/${category.slug}` },
            ],
          }}
        />
      ) : null}
      <ProductSection
        id="categoria-titulo"
        title={category.name}
        headingLevel="h1"
        products={products.filter((p) => p.category?.slug === slug)}
        priorityCount={4}
        empty={{ title: "Nenhum produto nesta categoria por enquanto" }}
      />
    </>
  );
}

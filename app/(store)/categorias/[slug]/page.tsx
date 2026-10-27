import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { isDemoMode, siteUrl } from "@/config/site";
import { parseCatalogQuery } from "@/lib/catalog/query";
import { getCategories, getCategoryBySlug, getVisibleProducts } from "@/lib/catalog/queries";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { CatalogSkeleton, CatalogView } from "@/components/catalog/catalog-view";
import { JsonLd } from "@/components/seo/json-ld";
import { Skeleton } from "@/components/ui/misc";

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

export default function CategoryPage({ params, searchParams }: PageProps<"/categorias/[slug]">) {
  return (
    <div className="container-page py-8 sm:py-10">
      <Suspense fallback={<CategoryHeaderSkeleton />}>
        <CategoryHeader params={params} />
      </Suspense>
      <Suspense fallback={<CatalogSkeleton />}>
        <Results params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CategoryHeader({ params }: Pick<PageProps<"/categorias/[slug]">, "params">) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Início", href: "/" },
          { label: "Produtos", href: "/produtos" },
          { label: category.name },
        ]}
      />
      <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{category.name}</h1>
      {category.description ? <p className="mb-6 mt-2 max-w-2xl text-muted">{category.description}</p> : <div className="mb-6" />}
      {!isDemoMode() ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Início", item: `${siteUrl()}/` },
              { "@type": "ListItem", position: 2, name: "Produtos", item: `${siteUrl()}/produtos` },
              { "@type": "ListItem", position: 3, name: category.name, item: `${siteUrl()}/categorias/${category.slug}` },
            ],
          }}
        />
      ) : null}
    </>
  );
}

function CategoryHeaderSkeleton() {
  return (
    <div className="mb-6 space-y-4">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-10 w-64" />
    </div>
  );
}

async function Results({ params, searchParams }: Pick<PageProps<"/categorias/[slug]">, "params" | "searchParams">) {
  const [{ slug }, sp, products] = await Promise.all([params, searchParams, getVisibleProducts()]);
  const inCategory = products.filter((p) => p.category?.slug === slug);
  const query = { ...parseCatalogQuery(sp), categoria: null };
  return (
    <CatalogView
      products={inCategory}
      query={query}
      action={`/categorias/${slug}`}
      showCategory={false}
    />
  );
}

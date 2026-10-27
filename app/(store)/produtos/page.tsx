import type { Metadata } from "next";
import { Suspense } from "react";
import { parseCatalogQuery } from "@/lib/catalog/query";
import { getVisibleProducts } from "@/lib/catalog/queries";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { CatalogSkeleton, CatalogView } from "@/components/catalog/catalog-view";

export const metadata: Metadata = {
  title: "Produtos",
  description: "Todos os colchões, com filtros por tamanho, firmeza e preço.",
  // Combinações de filtros apontam para a listagem principal (sem páginas duplicadas).
  alternates: { canonical: "/produtos" },
};

export default function ProductsPage({ searchParams }: PageProps<"/produtos">) {
  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Produtos" }]} />
      <h1 className="mb-6 mt-4 text-3xl font-bold sm:text-4xl">Produtos</h1>
      <Suspense fallback={<CatalogSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/produtos">, "searchParams">) {
  const [params, products] = await Promise.all([searchParams, getVisibleProducts()]);
  return <CatalogView products={products} query={parseCatalogQuery(params)} action="/produtos" />;
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { applyCatalogQuery, parseCatalogQuery } from "@/lib/catalog/query";
import { getVisibleProducts } from "@/lib/catalog/queries";
import { ProductSection, ProductSectionSkeleton } from "@/components/catalog/product-section";

export const metadata: Metadata = {
  title: "Buscar",
  description: "Busque produtos por nome ou descrição.",
  // Páginas de resultado de busca não devem ser indexadas.
  robots: { index: false, follow: true },
};

/** Resultados da busca do cabeçalho (?q=), sem acento e sem filtros extras. */
export default function SearchPage({ searchParams }: PageProps<"/busca">) {
  return (
    <div className="mx-auto w-full max-w-[80rem] px-1.5 pt-2 sm:px-6 sm:pt-6 lg:px-8">
      <Suspense fallback={<ProductSectionSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/busca">, "searchParams">) {
  const [params, products] = await Promise.all([searchParams, getVisibleProducts()]);
  const query = { ...parseCatalogQuery(params), ordem: "relevancia" as const };
  const results = query.q ? applyCatalogQuery(products, query) : products;
  return (
    <ProductSection
      id="busca-titulo"
      title={query.q ? `Resultados para “${query.q}”` : "Buscar"}
      headingLevel="h1"
      products={results}
      empty={{ title: "Nenhum produto encontrado", text: "Tente outra palavra, como “poltrona” ou “cadeira”." }}
    />
  );
}

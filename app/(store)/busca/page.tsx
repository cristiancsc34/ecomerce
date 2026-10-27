import type { Metadata } from "next";
import Form from "next/form";
import { Suspense } from "react";
import { parseCatalogQuery } from "@/lib/catalog/query";
import { getVisibleProducts } from "@/lib/catalog/queries";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { CatalogSkeleton, CatalogView } from "@/components/catalog/catalog-view";
import { buttonClasses } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Buscar",
  description: "Busque colchões por nome, firmeza, tamanho ou material.",
  // Páginas de resultado de busca não devem ser indexadas.
  robots: { index: false, follow: true },
};

export default function SearchPage({ searchParams }: PageProps<"/busca">) {
  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Buscar" }]} />
      <h1 className="mb-5 mt-4 text-3xl font-bold sm:text-4xl">Buscar</h1>
      <Suspense fallback={<SearchBox defaultValue="" />}>
        <SearchBoxFromParams searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<CatalogSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchBoxFromParams({ searchParams }: Pick<PageProps<"/busca">, "searchParams">) {
  const { q } = parseCatalogQuery(await searchParams);
  return <SearchBox defaultValue={q} />;
}

function SearchBox({ defaultValue }: { defaultValue: string }) {
  return (
    <Form action="/busca" role="search" className="mb-8 flex max-w-2xl gap-2">
      <div className="relative flex-1">
        <label htmlFor="busca-q" className="sr-only">
          O que você procura?
        </label>
        <input
          id="busca-q"
          key={defaultValue}
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder="Ex.: casal, médio-firme, queen"
          className="h-12 w-full rounded-full border border-line bg-white pl-11 pr-4 text-base text-ink placeholder:text-muted"
        />
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
      </div>
      <button type="submit" className={buttonClasses({ size: "lg" })}>
        Buscar
      </button>
    </Form>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/busca">, "searchParams">) {
  const [params, products] = await Promise.all([searchParams, getVisibleProducts()]);
  return <CatalogView products={products} query={parseCatalogQuery(params)} action="/busca" showSearch={false} />;
}

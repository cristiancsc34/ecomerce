import Link from "next/link";
import {
  applyCatalogQuery,
  catalogFacets,
  catalogQueryToSearchParams,
  hasActiveFilters,
  type CatalogQuery,
} from "@/lib/catalog/query";
import { FIRMNESS_LABELS, SIZE_INFO, type Product } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/catalog/money";
import { ProductGrid } from "@/components/product/product-card";
import { buttonClasses } from "@/components/ui/button";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { CatalogFilters } from "./catalog-filters";

type Chip = { label: string; href: string };

function chips(action: string, query: CatalogQuery, categoryNames: Map<string, string>): Chip[] {
  const without = (patch: Partial<CatalogQuery>) => {
    const sp = catalogQueryToSearchParams({ ...query, ...patch });
    const s = sp.toString();
    return s ? `${action}?${s}` : action;
  };
  const list: Chip[] = [];
  if (query.q) list.push({ label: `Busca: “${query.q}”`, href: without({ q: "" }) });
  if (query.categoria) {
    list.push({ label: categoryNames.get(query.categoria) ?? query.categoria, href: without({ categoria: null }) });
  }
  for (const t of query.tamanhos) {
    list.push({ label: SIZE_INFO[t].label, href: without({ tamanhos: query.tamanhos.filter((x) => x !== t) }) });
  }
  for (const f of query.firmezas) {
    list.push({ label: FIRMNESS_LABELS[f], href: without({ firmezas: query.firmezas.filter((x) => x !== f) }) });
  }
  if (query.precoMin !== null) list.push({ label: `A partir de ${formatPrice(query.precoMin * 100)}`, href: without({ precoMin: null }) });
  if (query.precoMax !== null) list.push({ label: `Até ${formatPrice(query.precoMax * 100)}`, href: without({ precoMax: null }) });
  return list;
}

/**
 * Listagem com busca, filtros e ordenação. Os filtros são aplicados no
 * servidor a partir da URL, então qualquer resultado pode ser compartilhado.
 */
export function CatalogView({
  products,
  query,
  action,
  showCategory = true,
  showSearch = true,
}: {
  products: Product[];
  query: CatalogQuery;
  action: string;
  showCategory?: boolean;
  showSearch?: boolean;
}) {
  const facets = catalogFacets(products);
  const results = applyCatalogQuery(products, query);
  const active = hasActiveFilters(query);
  const categoryNames = new Map(facets.categories.map((c) => [c.slug, c.name]));
  const activeChips = chips(action, query, categoryNames);

  if (products.length === 0) {
    return (
      <EmptyState title="Catálogo em preparação">
        Estamos confirmando fotos, medidas e especificações dos primeiros produtos. Volte em breve.
      </EmptyState>
    );
  }

  const filterProps = { action, query, facets, showCategory, showSearch };

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_1fr] lg:gap-10">
      <aside aria-label="Filtros" className="hidden lg:block">
        <div className="sticky top-24 rounded-[1.25rem] border border-line bg-white p-5">
          <CatalogFilters idPrefix="filtros-desktop" {...filterProps} />
        </div>
      </aside>

      <div className="min-w-0">
        <details className="group mb-5 rounded-[1.25rem] border border-line bg-white lg:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 font-semibold text-deep-fjord [&::-webkit-details-marker]:hidden">
            <span>Filtrar e ordenar{activeChips.length ? ` (${activeChips.length})` : ""}</span>
            <span aria-hidden="true" className="text-xl leading-none group-open:rotate-45 transition-transform">
              +
            </span>
          </summary>
          <div className="border-t border-line p-5">
            <CatalogFilters idPrefix="filtros-mobile" {...filterProps} />
          </div>
        </details>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <p role="status" className="mr-2 text-sm text-muted">
            {results.length === 1 ? "1 produto encontrado" : `${results.length} produtos encontrados`}
          </p>
          {activeChips.map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              scroll={false}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-sm text-ink hover:border-deep-fjord"
            >
              {chip.label}
              <CloseIcon className="h-4 w-4" />
              <span className="sr-only">(remover filtro)</span>
            </Link>
          ))}
          {activeChips.length > 1 ? (
            <Link href={action} scroll={false} className="link ml-1 text-sm">
              Limpar tudo
            </Link>
          ) : null}
        </div>

        {results.length ? (
          <ProductGrid products={results} priorityCount={active ? 0 : 2} />
        ) : (
          <EmptyState
            icon={<SearchIcon className="h-7 w-7" />}
            title="Nenhum produto com esses filtros"
            action={
              <Link href={action} className={buttonClasses({ variant: "secondary" })} scroll={false}>
                Limpar filtros
              </Link>
            }
          >
            Tente remover algum filtro ou buscar por outro termo.
          </EmptyState>
        )}
      </div>
    </div>
  );
}

export function CatalogSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_1fr] lg:gap-10" aria-busy="true" aria-label="Carregando produtos">
      <Skeleton className="hidden h-96 lg:block" />
      <div>
        <Skeleton className="mb-5 h-12 lg:hidden" />
        <Skeleton className="mb-5 h-5 w-40" />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-[1.25rem] border border-line bg-white">
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="space-y-3 p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-6 w-28" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { Product } from "@/lib/catalog/types";
import { ProductGrid } from "@/components/product/product-card";
import { Skeleton } from "@/components/ui/misc";

/**
 * Bloco de vitrine: faixa de título (estilo marketplace) e grade de produtos.
 * Sem filtros: a loja é pequena e a pessoa vai direto ao produto.
 */
export function ProductSection({
  id,
  title,
  headingLevel = "h2",
  products,
  priorityCount = 0,
  empty,
}: {
  id: string;
  title: string;
  headingLevel?: "h1" | "h2";
  products: Product[];
  priorityCount?: number;
  empty: { title: string; text?: string };
}) {
  const Heading = headingLevel;
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex items-baseline justify-between gap-3 border-b-4 border-air-blue-ink bg-white px-4 py-3 sm:mb-3 sm:rounded-t-lg">
        <Heading id={id} className="text-base font-bold uppercase tracking-wide text-air-blue-ink">
          {title}
        </Heading>
        <p role="status" className="text-sm text-muted">
          {products.length === 1 ? "1 produto" : `${products.length} produtos`}
        </p>
      </div>
      {products.length ? (
        <ProductGrid products={products} priorityCount={priorityCount} />
      ) : (
        <div className="rounded-lg bg-white px-6 py-12 text-center">
          <p className="text-lg font-semibold text-ink">{empty.title}</p>
          {empty.text ? <p className="mt-1 text-muted">{empty.text}</p> : null}
          <Link href="/" className="link mt-4 inline-block">
            Ver todos os produtos
          </Link>
        </div>
      )}
    </section>
  );
}

export function ProductSectionSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando produtos">
      <Skeleton className="mb-3 h-12 w-full rounded-none sm:rounded-t-lg" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

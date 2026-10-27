import Link from "next/link";
import { fromPriceCents, model3d, primaryImage } from "@/lib/catalog/product-helpers";
import type { Product } from "@/lib/catalog/types";
import { CubeIcon } from "@/components/ui/icons";
import { ProductPrice } from "./price";
import { ProductImage } from "./product-image";

/** Card compacto de vitrine: foto quadrada, nome em até 2 linhas e preço em destaque. */
export function ProductCard({
  product,
  priority = false,
  headingLevel = "h3",
}: {
  product: Product;
  priority?: boolean;
  headingLevel?: "h2" | "h3";
}) {
  const image = primaryImage(product);
  const has3d = Boolean(model3d(product));
  const hasPrice = fromPriceCents(product) !== null;
  const Heading = headingLevel;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-[var(--shadow-soft)] ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] hover:ring-air-blue">
      <div className="relative">
        <ProductImage
          media={image}
          priority={priority}
          aspect="aspect-square"
          sizes="(min-width: 1024px) 300px, (min-width: 640px) 33vw, 50vw"
        />
        {has3d ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-deep-fjord px-1.5 py-0.5 text-xs font-bold text-white">
            <CubeIcon className="h-3.5 w-3.5" aria-hidden="true" /> 3D
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5 sm:p-3">
        <Heading className="line-clamp-2 min-h-10 text-sm font-normal leading-5 text-ink">
          {/* O link cobre o card inteiro (alvo de toque grande), mantendo um único link por produto. */}
          <Link href={`/produtos/${product.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </Heading>
        <div className="mt-auto space-y-2">
          <ProductPrice product={product} />
          {/* Visual de botão; o link do card inteiro já leva ao produto. */}
          <span
            aria-hidden="true"
            className="flex h-9 items-center justify-center rounded-md bg-deep-fjord text-sm font-semibold text-white transition-colors group-hover:bg-[#1d3a58]"
          >
            {hasPrice ? "Comprar" : "Ver produto"}
          </span>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: Product[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id} className="min-w-0">
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

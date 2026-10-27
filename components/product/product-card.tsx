import Link from "next/link";
import { productSizes, primaryImage } from "@/lib/catalog/product-helpers";
import { SIZE_INFO, type Product } from "@/lib/catalog/types";
import { Badge } from "@/components/ui/badge";
import { FirmnessScale } from "./firmness-scale";
import { ProductPrice } from "./price";
import { ProductImage } from "./product-image";

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
  const sizes = productSizes(product);
  const Heading = headingLevel;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-line bg-white shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lift)]">
      <ProductImage
        media={image}
        priority={priority}
        sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw"
      />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {product.category ? <span className="text-sm font-medium text-air-blue-ink">{product.category.name}</span> : null}
          {product.isDemo ? <Badge tone="demo">Demonstração</Badge> : null}
        </div>
        <Heading className="text-lg font-semibold">
          {/* O link cobre o card inteiro (alvo de toque grande), mantendo um único link por produto. */}
          <Link href={`/produtos/${product.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </Heading>
        {product.shortDescription ? <p className="text-[0.9375rem] text-muted">{product.shortDescription}</p> : null}
        {product.attributes.firmness ? <FirmnessScale value={product.attributes.firmness} compact /> : null}
        {sizes.length ? (
          <p className="text-sm text-muted">
            <span className="sr-only">Tamanhos: </span>
            {sizes.map((s) => SIZE_INFO[s].label).join(" · ")}
          </p>
        ) : null}
        <div className="mt-auto pt-2">
          <ProductPrice product={product} />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: Product[]; priorityCount?: number }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

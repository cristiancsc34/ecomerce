import { formatPrice } from "@/lib/catalog/money";
import { fromPriceCents, hasPriceRange } from "@/lib/catalog/product-helpers";
import type { Product } from "@/lib/catalog/types";

/** Preço "a partir de" para listagens. Nunca exibe desconto sem preço "de" legítimo. */
export function ProductPrice({
  product,
  size = "md",
}: {
  product: Pick<Product, "priceCents" | "variants" | "compareAtPriceCents" | "isDemo">;
  size?: "md" | "lg";
}) {
  const from = fromPriceCents(product);
  if (from === null) {
    return <p className="text-sm font-medium text-muted">Preço em definição</p>;
  }
  const range = hasPriceRange(product);
  const showCompare =
    !range && product.compareAtPriceCents !== null && product.priceCents !== null && product.compareAtPriceCents > product.priceCents;

  return (
    <div>
      <p className={size === "lg" ? "text-2xl font-bold text-deep-fjord" : "text-lg font-bold text-deep-fjord"}>
        {range ? <span className="mr-1 text-sm font-medium text-muted">a partir de</span> : null}
        {formatPrice(from)}
        {showCompare ? (
          <span className="ml-2 text-sm font-medium text-muted line-through">
            <span className="sr-only">Preço anterior: </span>
            {formatPrice(product.compareAtPriceCents!)}
          </span>
        ) : null}
      </p>
      {product.isDemo ? <p className="text-xs font-medium text-muted">Preço ilustrativo</p> : null}
    </div>
  );
}

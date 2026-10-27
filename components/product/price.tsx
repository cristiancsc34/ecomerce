import { formatPrice } from "@/lib/catalog/money";
import { fromPriceCents, hasPriceRange } from "@/lib/catalog/product-helpers";
import type { Product } from "@/lib/catalog/types";

/** Texto exibido enquanto o produto não tem preço confirmado (nunca inventar um). */
export const NO_PRICE_LABEL = "Preço em breve";

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
    return <p className="text-sm font-semibold text-muted">{NO_PRICE_LABEL}</p>;
  }
  const range = hasPriceRange(product);
  const showCompare =
    !range && product.compareAtPriceCents !== null && product.priceCents !== null && product.compareAtPriceCents > product.priceCents;

  return (
    <p className={size === "lg" ? "text-2xl font-bold text-air-blue-ink" : "text-base font-bold text-air-blue-ink"}>
      {range ? <span className="mr-1 text-xs font-medium text-muted">a partir de</span> : null}
      {formatPrice(from)}
      {showCompare ? (
        <span className="ml-1.5 text-xs font-medium text-muted line-through">
          <span className="sr-only">Preço anterior: </span>
          {formatPrice(product.compareAtPriceCents!)}
        </span>
      ) : null}
    </p>
  );
}

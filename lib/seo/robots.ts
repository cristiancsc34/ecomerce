import type { Metadata } from "next";
import { indexingAllowed } from "@/config/site";

/** Trava fechada (issue #17) ou página que não deve ir ao Google. */
const NOINDEX_NOFOLLOW = { index: false, follow: false } as const;
const NOINDEX_FOLLOW = { index: false, follow: true } as const;

/**
 * Robots de uma página da vitrine. Com a trava de indexação fechada, sempre
 * `noindex, nofollow`. Aberta, `noindex` só quando a página não tem o que
 * mostrar (ex.: categoria sem produto); senão herda o `index, follow` do layout.
 */
export function pageRobots(indexable = true): Metadata["robots"] | undefined {
  if (!indexingAllowed()) return NOINDEX_NOFOLLOW;
  return indexable ? undefined : NOINDEX_FOLLOW;
}

/** Robots padrão do site inteiro (layout raiz). */
export function siteRobots(): NonNullable<Metadata["robots"]> {
  return indexingAllowed() ? { index: true, follow: true } : NOINDEX_NOFOLLOW;
}

/** JSON-LD de produto (Product/Offer) e de lista (ItemList) só com a trava aberta (issue #17). */
export function productStructuredDataAllowed(): boolean {
  return indexingAllowed();
}

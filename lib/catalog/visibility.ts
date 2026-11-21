/**
 * O que a vitrine considera "visível" na consulta do catálogo (repository.ts).
 * O RLS do banco aplica a mesma regra ao visitante; o 404 do proxy.ts
 * (slug-exists.ts) segue só o RLS, para acompanhar sozinho a issue #29.
 */
export const VISIBLE_PRODUCT_FILTERS = [
  ["status", "published"],
  ["is_demo", false],
] as const;

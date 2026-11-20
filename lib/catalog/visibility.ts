/**
 * O que a vitrine considera "visível". Usado pela consulta do catálogo
 * (repository.ts) e pela conferência de endereço do proxy.ts (slug-exists.ts):
 * se a regra mudar (ex.: issue #29, produtos de demonstração), muda aqui e as
 * duas ficam iguais. Sem dependências: o proxy não pode importar "server-only".
 */
export const VISIBLE_PRODUCT_FILTERS = [
  ["status", "published"],
  ["is_demo", false],
] as const;

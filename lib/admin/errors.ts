/** Mensagens que os nossos triggers/funções já escrevem em português claro. */
const FRIENDLY_PREFIXES = ["Para publicar", "Produto de demonstração", "Produto não encontrado", "Variação não", "Imagem não encontrada"];

type DbError = { code?: string; message?: string; details?: string | null; hint?: string | null } | null | undefined;

const CONSTRAINT_MESSAGES: Record<string, string> = {
  products_slug_key: "Já existe um produto com esse endereço (slug). Escolha outro.",
  products_sku_key: "Já existe um produto com esse SKU.",
  product_variants_sku_key: "Já existe uma variação com esse SKU.",
  categories_slug_key: "Já existe uma categoria com esse endereço (slug).",
  products_demo_never_published: "Produto de demonstração não pode ser publicado.",
  products_published_requires_category: "Para publicar, escolha uma categoria.",
  products_published_requires_description: "Para publicar, escreva a descrição.",
  products_compare_at_gt_price: "O preço “de” precisa ser maior que o preço atual.",
  product_media_one_primary: "Já existe uma foto principal para este produto.",
};

/**
 * Converte erros do Postgres/PostgREST em mensagens claras para a equipe,
 * sem expor detalhes internos.
 */
export function friendlyDbError(error: DbError, fallback = "Não foi possível salvar. Tente novamente."): string {
  if (!error) return fallback;
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  for (const [constraint, message] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (text.includes(constraint)) return message;
  }
  switch (error.code) {
    case "23505":
      return "Já existe um registro com esses dados (endereço ou SKU repetido).";
    case "23503":
      return "Este item está em uso por outros registros e não pode ser removido.";
    case "42501":
      // Mensagens dos nossos triggers já são amigáveis.
      return error.message?.startsWith("Somente") ? error.message : "Você não tem permissão para fazer isso.";
    case "23514":
    case "P0002":
      return FRIENDLY_PREFIXES.some((prefix) => error.message?.startsWith(prefix))
        ? error.message!
        : "Algum valor não passou nas regras de validação.";
    case "PGRST116":
      return "Registro não encontrado ou sem permissão.";
    default:
      return fallback;
  }
}

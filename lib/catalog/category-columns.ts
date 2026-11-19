/**
 * Colunas das categorias. As de SEO (título, resumo e texto da página) vêm da
 * migração 20261120000100_categorias_seo.sql. Enquanto ela não for aplicada no
 * banco, a loja e o painel leem e gravam sem essas colunas (nada quebra) e o
 * painel avisa que o texto só é guardado depois da atualização.
 */
export const CATEGORY_COLUMNS_LEGACY = "id,slug,name,description,sort_order,requires_3d";
export const CATEGORY_COLUMNS = `${CATEGORY_COLUMNS_LEGACY},seo_title,seo_description,content`;

type DbError = { code?: string; message?: string; details?: string | null; hint?: string | null } | null | undefined;

/** O banco ainda não tem as colunas de SEO das categorias. */
export function missingCategorySeoMigration(error: DbError): boolean {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return /categories[\w.]*\.(seo_title|seo_description|content)|'(seo_title|seo_description|content)' column of 'categories'|column [\w.]*(seo_title|seo_description|content) does not exist/i.test(
    text,
  );
}

/**
 * Faz a consulta com as colunas de SEO e, se o banco ainda não as tem, repete
 * sem elas. `legacy` diz se precisou repetir.
 */
export async function selectCategoriesWithFallback<R extends { error: DbError }>(
  build: (columns: string) => PromiseLike<R>,
): Promise<{ result: R; legacy: boolean }> {
  const result = await build(CATEGORY_COLUMNS);
  if (!missingCategorySeoMigration(result.error)) return { result, legacy: false };
  return { result: await build(CATEGORY_COLUMNS_LEGACY), legacy: true };
}

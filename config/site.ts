/**
 * Configuração de ambiente compartilhada entre servidor e cliente.
 * Só lê variáveis NEXT_PUBLIC_* (públicas por definição) e flags sem segredo.
 */

export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

export type CatalogSource = "supabase" | "demo";

/**
 * De onde vem o catálogo público.
 *
 * - `CATALOG_SOURCE=demo` força o modo demonstração (produtos fictícios,
 *   sempre identificados e com `noindex`).
 * - `CATALOG_SOURCE=supabase` exige Supabase configurado.
 * - Sem a variável: Supabase quando configurado, senão demonstração.
 */
export function catalogSource(): CatalogSource {
  const explicit = process.env.CATALOG_SOURCE?.trim().toLowerCase();
  if (explicit === "demo") return "demo";
  if (explicit === "supabase") return "supabase";
  return isSupabaseConfigured() ? "supabase" : "demo";
}

export function isDemoMode(): boolean {
  return catalogSource() === "demo";
}

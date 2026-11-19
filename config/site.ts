/**
 * Configuração de ambiente compartilhada entre servidor e cliente.
 * Só lê variáveis NEXT_PUBLIC_* (públicas por definição), variáveis de sistema
 * da Vercel e flags sem segredo.
 */

const LOCAL_SITE_URL = "http://localhost:3000";

/** Build ou servidor de produção (`next build`, `next start`, Vercel). */
function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Ambiente da Vercel ("production", "preview", "development"); vazio fora da Vercel. */
function vercelEnv(): string {
  return (process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV || "").trim();
}

/** Endereço da prévia na Vercel (link fixo da branch, senão o do deploy). */
function vercelPreviewUrl(): string | null {
  const host = (
    process.env.VERCEL_BRANCH_URL ||
    process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    ""
  ).trim();
  return host ? `https://${host.replace(/^https?:\/\//, "")}` : null;
}

/**
 * URL canônica da loja (canonical, sitemap, Open Graph e JSON-LD).
 *
 * - Com `NEXT_PUBLIC_SITE_URL`: usa o valor (sem barra no fim).
 * - Em desenvolvimento: `http://localhost:3000`.
 * - Em produção sem a variável: nunca cai em localhost. Na prévia da Vercel usa
 *   o endereço da própria prévia; no resto, falha com mensagem clara (o build
 *   para em vez de publicar canonical/sitemap apontando para localhost).
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  if (!isProduction()) return LOCAL_SITE_URL;

  if (vercelEnv() === "preview") {
    const preview = vercelPreviewUrl();
    if (preview) return preview.replace(/\/+$/, "");
  }

  throw new Error(
    "NEXT_PUBLIC_SITE_URL não está definida. Em produção ela é obrigatória: canonical, sitemap, " +
      "Open Graph e JSON-LD usam esse endereço. Defina o endereço final da loja " +
      "(ex.: https://minhaloja.com.br).",
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

export type CatalogSource = "supabase" | "demo";

export const IMPLICIT_DEMO_MESSAGE =
  "Produção sem NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY e sem CATALOG_SOURCE: " +
  "a loja entraria no modo demonstração (produtos fictícios e noindex em todas as páginas). " +
  "Configure o Supabase ou, se a demonstração for de propósito, defina CATALOG_SOURCE=demo.";

let implicitDemoWarned = false;

/**
 * Produção caindo em demonstração sem ninguém pedir: na produção da Vercel
 * (loja no ar) o build falha; nos outros builds de produção (prévias, CI,
 * `next start` local) sai um aviso explícito no log. Só no servidor: no
 * navegador `CATALOG_SOURCE` não existe e o aviso já saiu no build.
 */
function signalImplicitDemo(): void {
  if (!isProduction() || typeof window !== "undefined") return;
  if (vercelEnv() === "production") throw new Error(IMPLICIT_DEMO_MESSAGE);
  if (implicitDemoWarned) return;
  implicitDemoWarned = true;
  console.error(`[config] ATENÇÃO: ${IMPLICIT_DEMO_MESSAGE}`);
}

/**
 * De onde vem o catálogo público.
 *
 * - `CATALOG_SOURCE=demo` força o modo demonstração (produtos fictícios,
 *   sempre identificados e com `noindex`).
 * - `CATALOG_SOURCE=supabase` exige Supabase configurado.
 * - Sem a variável: Supabase quando configurado, senão demonstração. Em
 *   produção essa queda para demonstração nunca é silenciosa (ver acima).
 */
export function catalogSource(): CatalogSource {
  const explicit = process.env.CATALOG_SOURCE?.trim().toLowerCase();
  if (explicit === "demo") return "demo";
  if (explicit === "supabase") return "supabase";
  if (isSupabaseConfigured()) return "supabase";
  signalImplicitDemo();
  return "demo";
}

export function isDemoMode(): boolean {
  return catalogSource() === "demo";
}

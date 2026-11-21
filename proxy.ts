import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { catalogSlugExists, type CatalogKind } from "@/lib/catalog/slug-exists";

/** Produto, categoria ou guia por endereço (o 404 de verdade é decidido aqui). */
const CATALOG_PATH = /^\/(produtos|categorias|guias)\/([^/]+)\/?$/;

/**
 * Endereço de produto, categoria ou guia que não existe responde 404 já aqui,
 * antes de a página começar a ser enviada (com o streaming, o "não encontrado"
 * da própria página sairia com status 200; issue #31). Só na visita direta
 * (documento HTML, GET ou HEAD): navegação interna e pré-carregamento seguem
 * normalmente. Na dúvida (banco fora do ar), a página abre como sempre.
 */
async function catalogNotFound(request: NextRequest, kind: CatalogKind, rawSlug: string): Promise<NextResponse> {
  const document = (request.method === "GET" || request.method === "HEAD") && !request.headers.get("rsc") && !request.headers.has("next-router-prefetch");
  if (!document) return NextResponse.next();
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  if ((await catalogSlugExists(kind, slug)) !== false) return NextResponse.next();
  // Endereço que não existe em nenhuma rota: o Next responde com a página de não encontrada e status 404.
  return NextResponse.rewrite(new URL("/404-nao-encontrado", request.url));
}

/**
 * Painel: renova a sessão do Supabase e faz um redirecionamento
 * OTIMISTA para o login. A autorização de verdade acontece no servidor, em
 * cada página e Server Action (lib/auth/staff.ts) e no RLS do banco.
 */
export async function proxy(request: NextRequest) {
  const catalog = request.nextUrl.pathname.match(CATALOG_PATH);
  if (catalog) return catalogNotFound(request, catalog[1] as CatalogKind, catalog[2]);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Sem Supabase, o painel mostra a tela de configuração.
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // Valida o JWT e renova os tokens se necessário (antes de gerar a resposta).
  const { data } = await supabase.auth.getClaims();
  const isLogin = request.nextUrl.pathname === "/admin/login";

  if (!data?.claims && !isLogin) {
    const login = request.nextUrl.clone();
    login.pathname = "/admin/login";
    login.search = "";
    login.searchParams.set("next", request.nextUrl.pathname);
    const redirect = NextResponse.redirect(login);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  // Páginas do painel nunca devem ser guardadas por CDN.
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/produtos/:slug", "/categorias/:slug", "/guias/:slug"],
};

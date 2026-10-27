import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";

/**
 * Cliente com a sessão do usuário (cookies). Usado só no painel e nas Server
 * Actions: todas as leituras e escritas passam pelo RLS com o papel do usuário.
 * A aplicação nunca usa a service role em tempo de execução.
 */
export async function createSessionClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase não configurado.");
  // A sessão é sempre por requisição: o cliente de Auth consulta o relógio
  // (Date.now) para checar a validade do token, o que não pode acontecer
  // durante o pré-render do "App Shell".
  await connection();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Chamado durante a renderização de um Server Component (cookies somente
          // leitura). O proxy.ts renova a sessão a cada requisição do painel.
        }
      },
    },
  });
}

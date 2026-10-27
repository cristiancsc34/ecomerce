import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente sem sessão (papel anon) para leituras públicas da vitrine.
 * Não lê cookies, então pode ser usado dentro de `use cache`.
 * O RLS garante que só produtos publicados e não-demo são visíveis.
 */
export function createPublicSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      // A única camada de cache é o `use cache` das consultas (com a tag
      // "catalog", que o painel invalida). Sem isto, o Next também guarda a
      // resposta HTTP no cache de fetch, que sobrevive a builds e não é
      // invalidado pela tag — e a loja mostrava catálogo desatualizado.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave de serviço (passa por cima do RLS). Uso restrito à IA na
 * nuvem (lib/ai-cloud): pegar tarefas da fila e gravar os resultados, como o
 * processador local faz. Nunca em código que vai para o navegador; o resto do
 * site continua usando a sessão do usuário (lib/supabase/server.ts).
 */
export function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

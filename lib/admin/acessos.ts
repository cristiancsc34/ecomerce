import "server-only";
import { requireStaffAction } from "@/lib/auth/staff";
import { createSessionClient } from "@/lib/supabase/server";
import { paraLink, type LinkDeAcesso } from "./access-links";

/** Links de acesso para a tela /admin/acessos (só o administrador; o banco confere pelo RLS). */
export async function listarLinksDeAcesso(): Promise<LinkDeAcesso[]> {
  await requireStaffAction("admin");
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("admin_access_links")
    .select("id,label,areas,user_id,expires_at,revoked_at,last_used_at,use_count,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar os links de acesso.");
  const agora = new Date();
  return (data ?? []).map((l) => paraLink(l as Parameters<typeof paraLink>[0], agora));
}

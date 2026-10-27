import "server-only";
import { MEDIA_BUCKET } from "@/lib/catalog/mappers";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Remove do Storage os arquivos que nenhuma mídia referencia mais (produtos
 * duplicados compartilham arquivos). Não é Server Action: só é chamada por
 * ações que já verificaram a autorização.
 */
export async function removeOrphanFiles(paths: string[]) {
  const candidates = [...new Set(paths)].filter((p) => p.startsWith("products/"));
  if (!candidates.length) return;
  const supabase = await createSessionClient();
  const { data: stillUsed } = await supabase.from("product_media").select("storage_path").in("storage_path", candidates);
  const used = new Set((stillUsed ?? []).map((r) => r.storage_path as string));
  const orphans = candidates.filter((p) => !used.has(p));
  if (orphans.length) await supabase.storage.from(MEDIA_BUCKET).remove(orphans);
}

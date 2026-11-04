import "server-only";
import type { AreaDoPainel } from "@/lib/auth/areas";
import { createServiceClient } from "@/lib/supabase/service";
import { areaAccount } from "./pin";

/**
 * Cria (ou acerta) a conta do Supabase de uma área do painel: e-mail e senha derivados da conta geral
 * (lib/admin/pin.ts → areaAccount) e o vínculo em admin_users com papel "editor" e só aquela área. Usa a chave de
 * serviço (SUPABASE_SERVICE_ROLE_KEY), só no servidor. Chamada no login quando a conta da área ainda não entra.
 */
export async function ensureAreaAccount(area: AreaDoPainel): Promise<boolean> {
  const admin = createServiceClient();
  if (!admin) return false;
  const conta = areaAccount(area);
  try {
    let userId: string | null = null;
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      userId = data.users.find((u) => u.email?.toLowerCase() === conta.email)?.id ?? null;
      if (data.users.length < 200) break;
    }
    if (userId) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password: conta.password, email_confirm: true });
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: conta.email,
        password: conta.password,
        email_confirm: true,
        app_metadata: { painel_area: area },
      });
      if (error || !data.user) throw new Error(error?.message ?? "sem usuário");
      userId = data.user.id;
    }
    const { error } = await admin.from("admin_users").upsert({ user_id: userId, role: "editor", areas: [area] }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error(`painel: não foi possível preparar a conta da área ${area}`, e instanceof Error ? e.message : e);
    return false;
  }
}

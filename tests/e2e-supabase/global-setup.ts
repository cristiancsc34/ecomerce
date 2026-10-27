import { createClient } from "@supabase/supabase-js";
import { ACCOUNTS } from "./accounts";

/** Garante as contas de teste (admin, editor e um usuário fora da equipe). */
export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error("Os testes do painel rodam só contra o Supabase local (veja playwright.supabase.config.ts).");
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });

  for (const [role, account] of Object.entries(ACCOUNTS)) {
    let user = data.users.find((u) => u.email === account.email);
    if (!user) {
      const created = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
      if (created.error) throw created.error;
      user = created.data.user;
    } else {
      await admin.auth.admin.updateUserById(user.id, { password: account.password });
    }
    if (role === "outsider") {
      await admin.from("admin_users").delete().eq("user_id", user.id);
    } else {
      const { error } = await admin.from("admin_users").upsert({ user_id: user.id, role }, { onConflict: "user_id" });
      if (error) throw error;
    }
  }
}

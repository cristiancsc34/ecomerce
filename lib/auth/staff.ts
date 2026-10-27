import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isSupabaseConfigured } from "@/config/site";
import { createSessionClient } from "@/lib/supabase/server";

export type StaffRole = "admin" | "editor";

export type Staff = {
  userId: string;
  email: string | null;
  role: StaffRole;
};

/**
 * Usuário da equipe na requisição atual, ou null.
 * Usa getUser() (consulta o servidor de Auth, detecta sessão revogada) e o
 * vínculo em admin_users, lido com a sessão do próprio usuário (RLS).
 * Nunca confia em papel enviado pelo navegador.
 */
export const getStaff = cache(async (): Promise<Staff | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("admin_users").select("role").eq("user_id", user.id).maybeSingle();
  if (error || !data) return null;
  const role = data.role === "admin" ? "admin" : "editor";
  return { userId: user.id, email: user.email ?? null, role };
});

/** Para páginas: redireciona ao login se não houver sessão da equipe. */
export async function requireStaffPage(minRole: StaffRole = "editor"): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login?motivo=sem-acesso");
  if (minRole === "admin" && staff.role !== "admin") redirect("/admin?motivo=sem-permissao");
  return staff;
}

export class AuthorizationError extends Error {}

/** Para Server Actions: lança erro (sem redirecionar) se não autorizado. */
export async function requireStaffAction(minRole: StaffRole = "editor"): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) throw new AuthorizationError("Sua sessão expirou. Entre novamente.");
  if (minRole === "admin" && staff.role !== "admin") {
    throw new AuthorizationError("Somente administradores podem fazer isso.");
  }
  return staff;
}

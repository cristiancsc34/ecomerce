import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isSupabaseConfigured } from "@/config/site";
import { createSessionClient } from "@/lib/supabase/server";
import { ehArea, podeUsar, ROTULO_AREA, type AreaDoPainel } from "./areas";

export type StaffRole = "admin" | "editor";

export type Staff = {
  userId: string;
  email: string | null;
  role: StaffRole;
  /** Áreas do painel desta conta (lib/auth/areas.ts). Vazio = todas (contas antigas); admin = tudo. */
  areas: AreaDoPainel[];
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

  const { data, error } = await supabase.from("admin_users").select("role,areas").eq("user_id", user.id).maybeSingle();
  if (error || !data) return null;
  const role = data.role === "admin" ? "admin" : "editor";
  const areas = Array.isArray(data.areas) ? (data.areas as unknown[]).filter(ehArea) : [];
  return { userId: user.id, email: user.email ?? null, role, areas };
});

/**
 * Para páginas: redireciona ao login se não houver sessão da equipe; com `area`, manda quem não é daquela área de
 * volta ao início do painel.
 */
export async function requireStaffPage(minRole: StaffRole = "editor", area?: AreaDoPainel): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login?motivo=sem-acesso");
  if (minRole === "admin" && staff.role !== "admin") redirect("/admin?motivo=sem-permissao");
  if (area && !podeUsar(staff, area)) redirect(`/admin?motivo=sem-area&area=${area}`);
  return staff;
}

export class AuthorizationError extends Error {}

/** Para Server Actions: lança erro (sem redirecionar) se não autorizado. */
export async function requireStaffAction(minRole: StaffRole = "editor", area?: AreaDoPainel): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) throw new AuthorizationError("Sua sessão expirou. Entre novamente.");
  if (minRole === "admin" && staff.role !== "admin") {
    throw new AuthorizationError("Somente administradores podem fazer isso.");
  }
  if (area && !podeUsar(staff, area)) {
    throw new AuthorizationError(`Isso é da área "${ROTULO_AREA[area]}". Peça ao administrador um link de acesso dessa área.`);
  }
  return staff;
}

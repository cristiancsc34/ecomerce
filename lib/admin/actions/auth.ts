"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/config/site";
import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { createSessionClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null; email: string };

const loginSchema = z.object({
  email: z.email("Informe um e-mail válido.").max(254),
  password: z.string().min(1, "Informe a senha.").max(256),
});

/** Só permite voltar para rotas do próprio painel (evita redirecionamento aberto). */
function safeNext(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  return /^\/admin(\/[a-z0-9\-/]*)?$/i.test(value) && value !== "/admin/login" ? value : "/admin";
}

export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isSupabaseConfigured()) {
    return { error: "O painel ainda não está conectado ao Supabase. Veja o README.", email };
  }

  const parsed = loginSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", email };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
  // Limites por IP e por e-mail (melhor esforço; o Supabase Auth tem os próprios).
  const byIp = rateLimit(`login:ip:${ip}`, { limit: 20, windowMs: 15 * 60_000 });
  const byEmail = rateLimit(`login:email:${email}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!byIp.allowed || !byEmail.allowed) {
    const wait = Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds);
    return { error: `Muitas tentativas. Aguarde ${Math.ceil(wait / 60)} min e tente de novo.`, email };
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    // Mensagem genérica: não revela se o e-mail existe.
    return { error: "E-mail ou senha incorretos.", email };
  }

  const { data: staff } = await supabase.from("admin_users").select("role").eq("user_id", data.user.id).maybeSingle();
  if (!staff) {
    await supabase.auth.signOut();
    return { error: "Esta conta não tem acesso ao painel. Peça a um administrador.", email };
  }

  resetRateLimit(`login:email:${email}`);
  redirect(safeNext(formData.get("next")));
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createSessionClient();
    await supabase.auth.signOut();
  }
  redirect("/admin/login");
}

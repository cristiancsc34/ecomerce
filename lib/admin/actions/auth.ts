"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/config/site";
import { ensureAreaAccount } from "@/lib/admin/area-accounts";
import { acessoDaSenha, areaAccount, INICIO_DO_ACESSO, pinAccount, pinLoginEnabled } from "@/lib/admin/pin";
import { areaDoCaminho } from "@/lib/auth/areas";
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
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
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

export type PinState = { error: string | null };

/**
 * Entrada por senha de acesso (ver lib/admin/pin.ts): a senha geral abre tudo; a senha de uma área abre só ela.
 * Poucas tentativas por IP: uma senha curta é fácil de adivinhar.
 */
export async function pinSignInAction(_prev: PinState, formData: FormData): Promise<PinState> {
  if (!isSupabaseConfigured() || !pinLoginEnabled()) {
    return { error: "O acesso por senha não está ativado. Entre com e-mail e senha." };
  }
  const senha = String(formData.get("pin") ?? "").trim();

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
  const limited = rateLimit(`login:pin:${ip}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!limited.allowed) {
    return { error: `Muitas tentativas. Aguarde ${Math.ceil(limited.retryAfterSeconds / 60)} min e tente de novo.` };
  }
  const acesso = acessoDaSenha(senha);
  if (!acesso) return { error: "Senha incorreta." };

  const supabase = await createSessionClient();
  const conta = acesso.tipo === "geral" ? pinAccount() : areaAccount(acesso.area);
  let { data, error } = await supabase.auth.signInWithPassword(conta);
  if ((error || !data.user) && acesso.tipo === "area" && (await ensureAreaAccount(acesso.area))) {
    // Primeiro acesso da área (ou a senha da conta geral mudou): a conta foi criada ou acertada agora.
    ({ data, error } = await supabase.auth.signInWithPassword(conta));
  }
  if (error || !data.user) {
    console.error(
      acesso.tipo === "geral"
        ? "painel: a conta geral não conseguiu entrar (confira ADMIN_PIN_EMAIL/ADMIN_PIN_PASSWORD)"
        : `painel: a conta da área ${acesso.area} não conseguiu entrar (confira SUPABASE_SERVICE_ROLE_KEY)`,
    );
    return { error: "Não foi possível entrar agora. Use e-mail e senha." };
  }
  const { data: staff } = await supabase.from("admin_users").select("role,areas").eq("user_id", data.user.id).maybeSingle();
  const certo = staff && (acesso.tipo === "geral" || (Array.isArray(staff.areas) && staff.areas.length === 1 && staff.areas[0] === acesso.area));
  if (!certo) {
    await supabase.auth.signOut();
    return { error: "Esta senha não está ligada a uma conta da equipe. Use e-mail e senha." };
  }

  resetRateLimit(`login:pin:${ip}`);
  const next = safeNext(formData.get("next"));
  if (acesso.tipo === "geral") redirect(next);
  // Área: volta para onde ia só se for da mesma área; senão, para o início dela.
  redirect(areaDoCaminho(next) === acesso.area ? next : INICIO_DO_ACESSO[acesso.area]);
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createSessionClient();
    await supabase.auth.signOut();
  }
  redirect("/admin/login");
}

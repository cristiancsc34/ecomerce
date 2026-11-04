"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/config/site";
import { enderecoDoLink, hashDoCodigo, novoCodigo, prepararEntradaPeloLink, revogarLink, VALIDADES, vencimento, type Validade } from "@/lib/admin/access-links";
import { AREAS } from "@/lib/auth/areas";
import { rateLimit } from "@/lib/auth/rate-limit";
import { AuthorizationError, requireStaffAction } from "@/lib/auth/staff";
import { isUuid } from "@/lib/catalog/slug";
import { createSessionClient } from "@/lib/supabase/server";
import { friendlyDbError } from "../errors";
import type { ActionResult } from "../types";

/** Links de acesso ao painel por área (lib/admin/access-links.ts). Criar e revogar: só o administrador. */

const novoLinkSchema = z.object({
  label: z.string().trim().min(2, "Dê um nome, como \"Depósito do João\".").max(80, "Nome longo demais."),
  areas: z.array(z.enum(AREAS)).min(1, "Escolha pelo menos uma área.").max(3),
  validade: z.enum(Object.keys(VALIDADES) as [Validade, ...Validade[]]),
});
export type NovoLinkInput = z.input<typeof novoLinkSchema>;

async function soAdmin(): Promise<{ ok: false; error: string } | null> {
  try {
    await requireStaffAction("admin");
    return null;
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Sem permissão." };
  }
}

/** Cria o link e devolve o endereço completo (aparece só desta vez: o banco guarda o hash). */
export async function criarLinkDeAcessoAction(input: NovoLinkInput): Promise<ActionResult<{ url: string }>> {
  const negado = await soAdmin();
  if (negado) return negado;
  const parsed = novoLinkSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, error: "Revise os campos destacados.", fieldErrors };
  }
  const codigo = novoCodigo();
  const supabase = await createSessionClient();
  const { error } = await supabase.from("admin_access_links").insert({
    label: parsed.data.label,
    areas: [...new Set(parsed.data.areas)],
    token_hash: hashDoCodigo(codigo),
    expires_at: vencimento(parsed.data.validade),
  });
  if (error) return { ok: false, error: friendlyDbError(error, "Não foi possível criar o link.") };
  return { ok: true, data: { url: enderecoDoLink(codigo) } };
}

/** Revoga o link: deixa de abrir e quem entrou por ele sai na próxima tela. */
export async function revogarLinkDeAcessoAction(id: string): Promise<ActionResult> {
  const negado = await soAdmin();
  if (negado) return negado;
  if (!isUuid(id)) return { ok: false, error: "Link inválido." };
  const r = await revogarLink(id);
  return r.ok ? { ok: true } : { ok: false, error: r.erro };
}

export type EntradaPeloLinkState = { error: string | null };

const INICIO: Record<string, string> = { itens: "/admin/produtos", pedidos: "/admin/pedidos", entrega: "/admin/entrega" };

/** Entra pelo link (botão da página /acesso/[código]). Poucas tentativas por IP. */
export async function entrarPeloLinkAction(_prev: EntradaPeloLinkState, formData: FormData): Promise<EntradaPeloLinkState> {
  if (!isSupabaseConfigured()) return { error: "O painel ainda não está conectado." };
  const codigo = String(formData.get("codigo") ?? "");
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
  const limite = rateLimit(`acesso:${ip}`, { limit: 20, windowMs: 10 * 60_000 });
  if (!limite.allowed) return { error: `Muitas tentativas. Aguarde ${Math.ceil(limite.retryAfterSeconds / 60)} min.` };

  const preparo = await prepararEntradaPeloLink(codigo);
  if (!preparo.ok) return { error: preparo.erro };
  const supabase = await createSessionClient();
  // Troca o código de uso único do Supabase por uma sessão neste navegador (substitui a sessão que houver).
  let { error } = await supabase.auth.verifyOtp({ token_hash: preparo.tokenHash, type: "email" });
  if (error) ({ error } = await supabase.auth.verifyOtp({ token_hash: preparo.tokenHash, type: "magiclink" }));
  if (error) return { error: "Não foi possível entrar agora. Abra o link de novo." };
  redirect(preparo.areas.length === 1 ? INICIO[preparo.areas[0]!]! : "/admin");
}

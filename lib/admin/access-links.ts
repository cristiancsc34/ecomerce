import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteUrl } from "@/config/site";
import { ehArea, type AreaDoPainel } from "@/lib/auth/areas";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Links de acesso ao painel (instrução do dono, 04/11/2026). Ver docs/PAINEL.md, "Links de acesso".
 *
 * O administrador cria um link para uma ou mais áreas e manda para a pessoa. Quem abre o link entra numa conta própria
 * daquele link (papel "editor", só aquelas áreas), e o banco segura o resto (políticas por área). Revogar: o link
 * deixa de abrir, a conta perde o vínculo com a equipe (admin_users) e fica bloqueada no Auth, o que corta o acesso na
 * próxima tela ou ação. A conta não é apagada, para o histórico continuar dizendo quem fez cada alteração.
 *
 * O banco guarda só o hash do código; o link inteiro aparece uma vez, quando é criado.
 */

export const CODIGO = /^[A-Za-z0-9_-]{43}$/;

export const VALIDADES = { "7": "7 dias", "30": "30 dias", "90": "90 dias", sem: "Sem prazo" } as const;
export type Validade = keyof typeof VALIDADES;

export type SituacaoDoLink = "ativo" | "revogado" | "vencido";

export type LinkDeAcesso = {
  id: string;
  label: string;
  areas: AreaDoPainel[];
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  situacao: SituacaoDoLink;
};

export const novoCodigo = () => randomBytes(32).toString("base64url");
export const hashDoCodigo = (codigo: string) => createHash("sha256").update(codigo, "utf8").digest("hex");
export const enderecoDoLink = (codigo: string, site = siteUrl()) => `${site}/acesso/${codigo}`;

export function vencimento(validade: Validade, agora = new Date()): string | null {
  return validade === "sem" ? null : new Date(agora.getTime() + Number(validade) * 86_400_000).toISOString();
}

export function situacaoDoLink(l: { revoked_at: string | null; expires_at: string | null }, agora = new Date()): SituacaoDoLink {
  if (l.revoked_at) return "revogado";
  if (l.expires_at && new Date(l.expires_at).getTime() <= agora.getTime()) return "vencido";
  return "ativo";
}

type LinhaDoLink = {
  id: string;
  label: string;
  areas: string[];
  user_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
};

export function paraLink(l: LinhaDoLink, agora = new Date()): LinkDeAcesso {
  return {
    id: l.id,
    label: l.label,
    areas: (l.areas ?? []).filter(ehArea),
    createdAt: l.created_at,
    expiresAt: l.expires_at,
    revokedAt: l.revoked_at,
    lastUsedAt: l.last_used_at,
    useCount: l.use_count,
    situacao: situacaoDoLink(l, agora),
  };
}

/** E-mail (sem caixa de entrada; nada é enviado) da conta de um link. */
export function emailDaConta(linkId: string, site = siteUrl()): string {
  let host = "";
  try {
    host = new URL(site).hostname;
  } catch {
    host = "";
  }
  return `link-${linkId}@${host.includes(".") ? host : "painel.local"}`.toLowerCase();
}

/** O link do código, se existir (ativo ou não). Só no servidor, com a chave de serviço. */
export async function linkPeloCodigo(codigo: string, client?: SupabaseClient | null): Promise<(LinkDeAcesso & { userId: string | null }) | null> {
  if (!CODIGO.test(codigo)) return null;
  const admin = client === undefined ? createServiceClient() : client;
  if (!admin) return null;
  const { data } = await admin.from("admin_access_links").select("*").eq("token_hash", hashDoCodigo(codigo)).maybeSingle();
  if (!data) return null;
  const linha = data as LinhaDoLink;
  return { ...paraLink(linha), userId: linha.user_id };
}

/**
 * Prepara a entrada pelo link: confere que está ativo, cria (ou acerta) a conta do link com só aquelas áreas e devolve
 * um código de uso único do Supabase (token_hash) para a sessão do navegador trocar por login (verifyOtp).
 */
export async function prepararEntradaPeloLink(
  codigo: string,
  client?: SupabaseClient | null,
): Promise<{ ok: true; tokenHash: string; areas: AreaDoPainel[] } | { ok: false; erro: string }> {
  const admin = client === undefined ? createServiceClient() : client;
  if (!admin) return { ok: false, erro: "Os links de acesso ainda não estão configurados neste site." };
  const link = await linkPeloCodigo(codigo, admin);
  if (!link) return { ok: false, erro: "Este link não existe. Peça um novo ao administrador." };
  if (link.situacao === "revogado") return { ok: false, erro: "Este link foi revogado. Peça um novo ao administrador." };
  if (link.situacao === "vencido") return { ok: false, erro: "Este link venceu. Peça um novo ao administrador." };
  if (!link.areas.length) return { ok: false, erro: "Este link não abre nenhuma área." };

  const email = emailDaConta(link.id);
  let userId = link.userId;
  if (userId) {
    // Conta já existe: garante que não está bloqueada (link ativo) e que o e-mail é o dela.
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) userId = null;
  }
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { access_link: link.id } });
    if (error || !data.user) return { ok: false, erro: "Não foi possível preparar o acesso agora. Tente de novo." };
    userId = data.user.id;
    await admin.from("admin_access_links").update({ user_id: userId }).eq("id", link.id);
  }
  const vinculo = await admin.from("admin_users").upsert({ user_id: userId, role: "editor", areas: link.areas }, { onConflict: "user_id" });
  if (vinculo.error) return { ok: false, erro: "Não foi possível preparar o acesso agora. Tente de novo." };

  const { data: gerado, error: erroDoLink } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = gerado?.properties?.hashed_token;
  if (erroDoLink || !tokenHash) return { ok: false, erro: "Não foi possível preparar o acesso agora. Tente de novo." };

  await admin
    .from("admin_access_links")
    .update({ use_count: link.useCount + 1, last_used_at: new Date().toISOString() })
    .eq("id", link.id);
  return { ok: true, tokenHash, areas: link.areas };
}

/**
 * Revoga o link: não abre mais, a conta dele sai da equipe (admin_users) e fica bloqueada no Auth (não renova a sessão).
 * A conta não é apagada: o histórico continua dizendo quem fez cada alteração.
 */
export async function revogarLink(linkId: string, client?: SupabaseClient | null): Promise<{ ok: true } | { ok: false; erro: string }> {
  const admin = client === undefined ? createServiceClient() : client;
  if (!admin) return { ok: false, erro: "Falta a chave de serviço do Supabase (SUPABASE_SERVICE_ROLE_KEY) neste site." };
  const { data, error } = await admin
    .from("admin_access_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .is("revoked_at", null)
    .select("user_id")
    .maybeSingle();
  if (error) return { ok: false, erro: "Não foi possível revogar agora. Tente de novo." };
  const userId = (data as { user_id: string | null } | null)?.user_id ?? null;
  if (userId) {
    await admin.from("admin_users").delete().eq("user_id", userId);
    // ~100 anos: a conta não entra nem renova a sessão.
    await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  }
  return { ok: true };
}

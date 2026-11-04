import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AREAS, type AreaDoPainel } from "@/lib/auth/areas";

/**
 * Entrada no painel por senha de acesso (PIN). Ver docs/PAINEL.md.
 *
 * A senha NÃO substitui as contas da equipe: ao acertar, o servidor entra numa conta de verdade do Supabase (senha
 * forte que nunca vai ao navegador). Assim o RLS do banco e a auditoria ("quem fez o quê") continuam valendo.
 *
 *   ADMIN_PIN              senha geral: abre tudo (conta ADMIN_PIN_EMAIL / ADMIN_PIN_PASSWORD, administradora)
 *   ADMIN_SENHA_ITENS      só a área de itens (produtos, fotos e 3D, categorias)
 *   ADMIN_SENHA_PEDIDOS    só a área de pedidos (pedidos, fábrica e logística)
 *   ADMIN_SENHA_ENTREGA    só a área de entrega (formas de entrega e avisos)
 *
 * Cada área entra numa conta própria, derivada da conta geral (lib/admin/area-accounts.ts) e criada sozinha no
 * primeiro acesso. Desligado sem ADMIN_PIN_EMAIL e ADMIN_PIN_PASSWORD, ou sem nenhuma senha. Uma senha curta
 * (ex.: 1234) é fraca: serve para demonstração.
 */
type Env = Record<string, string | undefined>;

const SENHA_VALIDA = /^\S{4,64}$/;
const VARIAVEL_DA_AREA: Record<AreaDoPainel, string> = {
  itens: "ADMIN_SENHA_ITENS",
  pedidos: "ADMIN_SENHA_PEDIDOS",
  entrega: "ADMIN_SENHA_ENTREGA",
};

export type Acesso = { tipo: "geral" } | { tipo: "area"; area: AreaDoPainel };

const valor = (env: Env, nome: string) => {
  const v = env[nome]?.trim() ?? "";
  return SENHA_VALIDA.test(v) ? v : "";
};

/** Senhas configuradas (geral e por área). Senha repetida entre áreas não vale para nenhuma delas. */
export function senhasDeAcesso(env: Env = process.env): { acesso: Acesso; senha: string }[] {
  const lista: { acesso: Acesso; senha: string }[] = [];
  const geral = valor(env, "ADMIN_PIN");
  if (geral) lista.push({ acesso: { tipo: "geral" }, senha: geral });
  for (const area of AREAS) {
    const senha = valor(env, VARIAVEL_DA_AREA[area]);
    if (senha) lista.push({ acesso: { tipo: "area", area }, senha });
  }
  return lista.filter((item) => lista.filter((outro) => outro.senha === item.senha).length === 1);
}

export function pinAccountConfigured(env: Env = process.env): boolean {
  return Boolean(env.ADMIN_PIN_EMAIL?.trim() && env.ADMIN_PIN_PASSWORD?.trim());
}

export function pinLoginEnabled(env: Env = process.env): boolean {
  return pinAccountConfigured(env) && senhasDeAcesso(env).length > 0;
}

export function pinAccount(env: Env = process.env): { email: string; password: string } {
  return { email: env.ADMIN_PIN_EMAIL!.trim(), password: env.ADMIN_PIN_PASSWORD!.trim() };
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a.padEnd(64, " "));
  const y = Buffer.from(b.padEnd(64, " "));
  return x.length === y.length && timingSafeEqual(x, y) && a.length === b.length;
}

/** Qual acesso esta senha abre (compara com todas, em tempo constante). null = nenhuma. */
export function acessoDaSenha(candidata: string, env: Env = process.env): Acesso | null {
  if (!SENHA_VALIDA.test(candidata)) return null;
  let achado: Acesso | null = null;
  for (const { acesso, senha } of senhasDeAcesso(env)) {
    if (iguais(candidata, senha)) achado = acesso;
  }
  return achado;
}

/** Compatibilidade: confere só a senha geral (ADMIN_PIN). */
export function pinMatches(candidate: string, expected = process.env.ADMIN_PIN?.trim() ?? ""): boolean {
  if (!expected || !/^\d{4,12}$/.test(candidate)) return false;
  return iguais(candidate, expected);
}

/**
 * Conta do Supabase de cada área, derivada da conta geral: e-mail com "+área" (painel@loja.com →
 * painel+itens@loja.com) e senha = HMAC da senha da conta geral. Trocar ADMIN_PIN_PASSWORD troca também as das
 * áreas (o próximo acesso atualiza sozinho).
 */
export function areaAccount(area: AreaDoPainel, env: Env = process.env): { email: string; password: string } {
  const { email, password } = pinAccount(env);
  const [local, dominio] = email.split("@");
  const separador = local!.includes("+") ? "." : "+";
  return {
    email: `${local}${separador}${area}@${dominio}`.toLowerCase(),
    password: createHmac("sha256", password).update(`painel:area:${area}`).digest("base64url"),
  };
}

/** Para onde cada acesso vai depois de entrar. */
export const INICIO_DO_ACESSO: Record<AreaDoPainel, string> = {
  itens: "/admin/produtos",
  pedidos: "/admin/pedidos",
  entrega: "/admin/entrega",
};

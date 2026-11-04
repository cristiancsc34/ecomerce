import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Acesso rápido ao painel por PIN (MVP).
 *
 * O PIN NÃO substitui o login da equipe: ao acertar o PIN, o servidor entra na
 * conta configurada em ADMIN_PIN_EMAIL/ADMIN_PIN_PASSWORD (uma conta da equipe no
 * Supabase, com senha forte que nunca vai ao navegador). Assim o RLS do banco e a
 * auditoria ("quem fez o quê") continuam valendo.
 *
 * Desligado se qualquer uma das três variáveis faltar. Um PIN curto (ex.: 1234) é
 * fraco: serve para demonstração. Antes de vender de verdade, troque por um PIN
 * longo ou remova ADMIN_PIN para voltar ao login com e-mail e senha.
 */
export function pinLoginEnabled(): boolean {
  return Boolean(
    process.env.ADMIN_PIN?.trim() && process.env.ADMIN_PIN_EMAIL?.trim() && process.env.ADMIN_PIN_PASSWORD?.trim(),
  );
}

export function pinAccount(): { email: string; password: string } {
  return { email: process.env.ADMIN_PIN_EMAIL!.trim(), password: process.env.ADMIN_PIN_PASSWORD!.trim() };
}

/** Comparação em tempo constante (não revela quantos dígitos acertaram). */
export function pinMatches(candidate: string, expected = process.env.ADMIN_PIN?.trim() ?? ""): boolean {
  if (!expected || !/^\d{4,12}$/.test(candidate)) return false;
  const a = Buffer.from(candidate.padEnd(16, " "));
  const b = Buffer.from(expected.padEnd(16, " "));
  return a.length === b.length && timingSafeEqual(a, b) && candidate.length === expected.length;
}

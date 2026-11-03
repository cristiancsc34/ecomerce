"use server";

import { headers } from "next/headers";
import { catalogSource, isSupabaseConfigured } from "@/config/site";
import { friendlyDbError } from "@/lib/admin/errors";
import type { ActionResult } from "@/lib/admin/types";
import { rateLimit } from "@/lib/auth/rate-limit";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { checkoutInputSchema, checkoutToRpc, type CheckoutInput } from "@/lib/validation/checkout";

/**
 * Checkout do site (sem pagamento online). O pedido entra como "recebido" e a loja confirma o pagamento
 * (Pix ou link) e a entrega pelo WhatsApp. Preço e totais são calculados no banco (public.place_site_order).
 */

const TEN_MINUTES = 10 * 60_000;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Z]{2,5}-\d{1,10}$/;

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "sem-ip";
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Fecha o pedido feito no site e devolve o número e o link secreto de acompanhamento. */
export async function placeOrderAction(input: CheckoutInput): Promise<ActionResult<{ code: string; token: string }>> {
  const parsed = checkoutInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrors(parsed.error.issues) };
  }
  // Mesma regra da página /finalizar: precisa do banco e do catálogo real (não o de demonstração).
  if (!isSupabaseConfigured() || catalogSource() !== "supabase") {
    return { ok: false, error: "A compra pelo site ainda não está ativa. Fale com o atendimento." };
  }
  const limited = rateLimit(`checkout:${await clientIp()}`, { limit: 5, windowMs: TEN_MINUTES });
  if (!limited.allowed) {
    return { ok: false, error: "Muitos pedidos seguidos. Aguarde alguns minutos ou fale com o atendimento." };
  }
  try {
    const { data, error } = await createPublicSupabaseClient().rpc("place_site_order", { p_data: checkoutToRpc(parsed.data) });
    const result = data as { code?: unknown; token?: unknown } | null;
    if (error || !result || typeof result.code !== "string" || typeof result.token !== "string") {
      return { ok: false, error: friendlyDbError(error, "Não foi possível fazer o pedido. Tente de novo ou fale com o atendimento.") };
    }
    if (!CODE.test(result.code) || !TOKEN.test(result.token)) {
      return { ok: false, error: "Não foi possível fazer o pedido. Tente de novo ou fale com o atendimento." };
    }
    return { ok: true, data: { code: result.code, token: result.token } };
  } catch {
    return { ok: false, error: "Não foi possível fazer o pedido agora. Tente de novo ou fale com o atendimento." };
  }
}

/** Endereço pelo CEP (ViaCEP, gratuito), para o cliente no checkout. Feito no servidor, com limite por IP. */
export async function lookupCepPublicAction(
  cep: string,
): Promise<ActionResult<{ rua: string; bairro: string; cidade: string; uf: string }>> {
  const digits = String(cep ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return { ok: false, error: "CEP com 8 números." };
  if (!rateLimit(`cep:${await clientIp()}`, { limit: 30, windowMs: TEN_MINUTES }).allowed) {
    return { ok: false, error: "Muitas consultas de CEP seguidas. Preencha o endereço à mão." };
  }
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    const body = (await res.json().catch(() => null)) as Record<string, string> | null;
    if (!res.ok || !body || body.erro) return { ok: false, error: "CEP não encontrado. Preencha o endereço à mão." };
    return { ok: true, data: { rua: body.logradouro ?? "", bairro: body.bairro ?? "", cidade: body.localidade ?? "", uf: body.uf ?? "" } };
  } catch {
    return { ok: false, error: "Não foi possível consultar o CEP agora. Preencha o endereço à mão." };
  }
}

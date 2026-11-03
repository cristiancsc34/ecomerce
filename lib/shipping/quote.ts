import "server-only";
import { isSupabaseConfigured } from "@/config/site";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { ShippingOption } from "./types";

/**
 * Formas de entrega que atendem um CEP, como o dono cadastrou no painel (Entrega e avisos). A retirada, se ativa,
 * aparece para qualquer CEP. Lista vazia = a loja não definiu entrega para esse CEP (frete "a combinar").
 * Função pública do banco (shipping_options_for): o visitante não lê a tabela.
 */
export async function shippingOptionsForCep(cep: string): Promise<ShippingOption[]> {
  if (!isSupabaseConfigured()) return [];
  const digits = cep.replace(/\D/g, "");
  if (digits && digits.length !== 8) return [];
  const { data, error } = await createPublicSupabaseClient().rpc("shipping_options_for", { p_cep: digits });
  if (error || !Array.isArray(data)) return [];
  return data as ShippingOption[];
}

export type ShippingQuote = {
  optionId: string;
  label: string;
  /** null = a combinar. */
  cents: number | null;
  prazoDias: { min: number | null; max: number | null } | null;
};

/**
 * Frete da ENTREGA para um CEP (sem a retirada): a forma ativa mais barata que atende o CEP, ou null se nenhuma
 * atende (o checkout mantém "a combinar"). Para o cliente escolher entre várias, use shippingOptionsForCep.
 */
export async function quoteShipping(cep: string): Promise<ShippingQuote | null> {
  const options = (await shippingOptionsForCep(cep)).filter((o) => o.method !== "retirada");
  if (!options.length) return null;
  const best = [...options].sort((a, b) => (a.priceCents ?? Number.MAX_SAFE_INTEGER) - (b.priceCents ?? Number.MAX_SAFE_INTEGER))[0];
  return {
    optionId: best.id,
    label: best.name,
    cents: best.priceCents,
    prazoDias: best.daysMin === null && best.daysMax === null ? null : { min: best.daysMin, max: best.daysMax },
  };
}

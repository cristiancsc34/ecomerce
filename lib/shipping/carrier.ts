import "server-only";
import { isSupabaseConfigured } from "@/config/site";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceClient } from "@/lib/supabase/service";
import { melhorEnvioStatus, quoteMelhorEnvio, type CarrierQuote, type MelhorEnvioConfig, type PackedItem } from "./melhor-envio";
import { boxesFor } from "./packages";
import { carrierOptionId, type ShippingOption } from "./types";

/**
 * Frete por transportadora (Melhor Envio), "engatilhado": só funciona com
 *   1. as variáveis do Melhor Envio na Vercel (lib/shipping/melhor-envio.ts → melhorEnvioStatus);
 *   2. a migração 20261119000200_frete_transportadoras.sql aplicada (caixas dos produtos e cotações);
 *   3. as caixas (peso e medidas embaladas) cadastradas em TODOS os produtos da sacola.
 * Faltando qualquer peça, não há cotação de transportadora: a loja segue com as formas cadastradas ou "a combinar".
 */

export type CartLine = { productId: string; variantId: string | null; quantity: number };

type Deps = {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
};

const CAPABILITY_TTL = 5 * 60_000;
let capability: { value: boolean; at: number } | null = null;

/** A migração foi aplicada? (tabela de cotações existe). Guardado por 5 minutos. */
async function migrationApplied(): Promise<boolean> {
  if (capability && Date.now() - capability.at < CAPABILITY_TTL) return capability.value;
  const service = createServiceClient();
  if (!service) return false;
  const { error } = await service.from("shipping_carrier_quotes").select("id", { head: true }).limit(1);
  capability = { value: !error, at: Date.now() };
  return capability.value;
}

/** Só para testes. */
export function resetCarrierCapabilityCache() {
  capability = null;
}

/** Configuração pronta para cotar, ou null (desligado). */
async function readyConfig(env?: Record<string, string | undefined>): Promise<MelhorEnvioConfig | null> {
  const status = melhorEnvioStatus(env);
  if (!status.enabled || !isSupabaseConfigured()) return null;
  return (await migrationApplied()) ? status.config : null;
}

/**
 * Itens com preço do catálogo e caixas, lidos do banco (só produtos publicados, pelo RLS). Null se algum item não tem
 * caixas, não está à venda ou não tem preço: aí não se cota (frete "a combinar").
 */
async function packedItems(lines: CartLine[]): Promise<PackedItem[] | null> {
  if (!lines.length) return null;
  const supabase = createPublicSupabaseClient();
  const productIds = [...new Set(lines.map((l) => l.productId.toLowerCase()))];
  const variantIds = [...new Set(lines.map((l) => l.variantId?.toLowerCase()).filter((v): v is string => Boolean(v)))];
  const [products, variants] = await Promise.all([
    supabase.from("products").select("id, price_cents, shipping_packages").in("id", productIds),
    variantIds.length
      ? supabase.from("product_variants").select("id, product_id, price_cents, shipping_packages").in("id", variantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  // Sem a migração, a coluna não existe: erro aqui = não cota.
  if (products.error || variants.error || !products.data || !variants.data) return null;
  const productById = new Map(products.data.map((p) => [String(p.id).toLowerCase(), p]));
  const variantById = new Map(variants.data.map((v) => [String(v.id).toLowerCase(), v]));

  // Mesmo produto e variação em duas linhas: soma (como o banco faz no pedido).
  const merged = new Map<string, CartLine>();
  for (const l of lines) {
    const key = `${l.productId.toLowerCase()}:${l.variantId?.toLowerCase() ?? ""}`;
    const prev = merged.get(key);
    merged.set(key, { ...l, quantity: (prev?.quantity ?? 0) + l.quantity });
  }

  const out: PackedItem[] = [];
  for (const [key, line] of merged) {
    const product = productById.get(line.productId.toLowerCase());
    if (!product) return null;
    const variant = line.variantId ? variantById.get(line.variantId.toLowerCase()) : null;
    if (line.variantId && (!variant || String(variant.product_id).toLowerCase() !== String(product.id).toLowerCase())) return null;
    const price = (variant ? variant.price_cents : product.price_cents) as number | null;
    if (typeof price !== "number") return null;
    const boxes = boxesFor(product.shipping_packages, variant?.shipping_packages);
    if (!boxes.length) return null;
    out.push({ key, quantity: line.quantity, unitPriceCents: price, boxes });
  }
  return out;
}

async function quoteCart(cep: string, lines: CartLine[], deps: Deps): Promise<{ config: MelhorEnvioConfig; quotes: CarrierQuote[] } | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const config = await readyConfig(deps.env);
  if (!config) return null;
  const items = await packedItems(lines);
  if (!items) return null;
  const r = await quoteMelhorEnvio(config, digits, items, deps.fetchImpl);
  if (!r.ok) {
    console.warn(`[frete] Melhor Envio sem cotação (${r.reason}).`);
    return null;
  }
  return { config, quotes: r.quotes };
}

export function carrierQuoteToOption(q: CarrierQuote): ShippingOption {
  return {
    id: carrierOptionId(q.serviceId),
    name: `${q.company} ${q.service}`,
    method: "transportadora",
    priceCents: q.priceCents,
    daysMin: q.daysMin,
    daysMax: q.daysMax,
    details: null,
    carrier: { provider: "melhor_envio", serviceId: q.serviceId, company: q.company, service: q.service },
  };
}

/** Cotações das transportadoras para o CEP e a sacola (lista vazia = desligado, sem caixas ou sem atendimento). */
export async function carrierOptionsFor(cep: string, lines: CartLine[], deps: Deps = {}): Promise<ShippingOption[]> {
  try {
    const r = await quoteCart(cep, lines, deps);
    return r ? r.quotes.map(carrierQuoteToOption) : [];
  } catch {
    return [];
  }
}

export type ConfirmResult = { ok: true; quoteId: string; priceCents: number } | { ok: false; error: string };

/**
 * Na hora de fechar o pedido: cota DE NOVO no servidor (o valor do navegador nunca vale), confere se o serviço
 * escolhido continua disponível e com o mesmo valor que o cliente viu, e grava a cotação (válida por 30 min) para
 * o banco conferir em place_site_order.
 */
export async function confirmCarrierQuote(
  input: { cep: string; lines: CartLine[]; serviceId: number; expectedCents: number | null },
  deps: Deps = {},
): Promise<ConfirmResult> {
  const unavailable = "O frete da transportadora não está disponível agora. Calcule o frete de novo ou escolha outra forma de entrega.";
  try {
    const r = await quoteCart(input.cep, input.lines, deps);
    if (!r) return { ok: false, error: unavailable };
    const q = r.quotes.find((x) => x.serviceId === input.serviceId);
    if (!q) return { ok: false, error: "Esta transportadora não atende mais o seu CEP. Calcule o frete de novo." };
    if (input.expectedCents !== null && q.priceCents !== input.expectedCents) {
      const value = (q.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return { ok: false, error: `O frete da ${q.company} mudou para ${value}. Confira e envie o pedido de novo.` };
    }
    const service = createServiceClient();
    if (!service) return { ok: false, error: unavailable };
    const { data, error } = await service
      .from("shipping_carrier_quotes")
      .insert({
        provider: "melhor_envio",
        service_id: q.serviceId,
        service_name: q.service,
        company_name: q.company,
        cep: input.cep.replace(/\D/g, ""),
        items: input.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
        price_cents: q.priceCents,
        days_min: q.daysMin,
        days_max: q.daysMax,
      })
      .select("id")
      .single();
    if (error || !data?.id) return { ok: false, error: unavailable };
    return { ok: true, quoteId: String(data.id), priceCents: q.priceCents };
  } catch {
    return { ok: false, error: unavailable };
  }
}

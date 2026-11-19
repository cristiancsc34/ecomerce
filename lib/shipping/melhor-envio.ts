import "server-only";
import { brand } from "@/config/brand";
import { splitCents, type ShippingBox } from "./packages";

/**
 * Cotação de frete no Melhor Envio (plataforma que cota várias transportadoras de uma vez).
 * Seguindo a documentação oficial (https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos):
 *   POST {base}/api/v2/me/shipment/calculate
 *   base: https://melhorenvio.com.br (produção) ou https://sandbox.melhorenvio.com.br (testes)
 *   cabeçalhos: Accept e Content-Type application/json, Authorization: Bearer <token>,
 *               User-Agent com o nome da aplicação e um e-mail de contato técnico (obrigatório)
 *   corpo: from.postal_code, to.postal_code, products[] (id, width, height, length em cm inteiros; weight em kg;
 *          insurance_value em reais; quantity)
 *   resposta: lista de serviços (id, name, price, custom_price, delivery_time, delivery_range, custom_delivery_*,
 *             company { id, name })
 * DESLIGADO até o dono configurar as variáveis na Vercel (só no servidor, nunca NEXT_PUBLIC_). Ver
 * docs/FRETE-TRANSPORTADORAS.md.
 */

export const MELHOR_ENVIO_BASE = {
  producao: "https://melhorenvio.com.br",
  sandbox: "https://sandbox.melhorenvio.com.br",
} as const;

export type MelhorEnvioConfig = {
  token: string;
  baseUrl: string;
  ambiente: keyof typeof MELHOR_ENVIO_BASE;
  /** E-mail de contato técnico (vai no User-Agent, exigido pela API). */
  contato: string;
  /** CEP de onde sai a mercadoria (8 números). */
  cepOrigem: string;
  /** Só estes serviços (ids do Melhor Envio); vazio = todos os que a conta do dono tiver ativos. */
  servicos: number[];
};

/**
 * Validade do token: a documentação diz que o access_token vale 30 dias e que a validade está no campo `exp` do
 * token (JWT). Lê só a data (não confere assinatura); null se não der para ler.
 */
export function tokenExpiresAt(token: string): Date | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { exp?: unknown };
    return typeof json.exp === "number" && Number.isFinite(json.exp) ? new Date(json.exp * 1000) : null;
  } catch {
    return null;
  }
}

export type MelhorEnvioStatus =
  | { enabled: true; config: MelhorEnvioConfig }
  | { enabled: false; missing: string[] };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Lê a configuração do ambiente. Faltando qualquer peça, a integração fica desligada (e o motivo aparece no painel). */
export function melhorEnvioStatus(env: Record<string, string | undefined> = process.env): MelhorEnvioStatus {
  const token = env.MELHOR_ENVIO_TOKEN?.trim() ?? "";
  const contato = env.MELHOR_ENVIO_CONTATO?.trim() ?? "";
  const cepOrigem = (env.FRETE_CEP_ORIGEM ?? "").replace(/\D/g, "");
  const ambienteRaw = (env.MELHOR_ENVIO_AMBIENTE ?? "producao").trim().toLowerCase();
  const missing: string[] = [];
  if (!token) missing.push("MELHOR_ENVIO_TOKEN (token da conta do Melhor Envio)");
  if (!EMAIL.test(contato)) missing.push("MELHOR_ENVIO_CONTATO (e-mail de contato técnico)");
  if (cepOrigem.length !== 8) missing.push("FRETE_CEP_ORIGEM (CEP de onde sai a mercadoria, 8 números)");
  if (ambienteRaw !== "producao" && ambienteRaw !== "sandbox") missing.push('MELHOR_ENVIO_AMBIENTE ("producao" ou "sandbox")');
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY (para gravar a cotação no pedido)");
  if (missing.length) return { enabled: false, missing };
  const ambiente = ambienteRaw as MelhorEnvioConfig["ambiente"];
  const servicos = (env.MELHOR_ENVIO_SERVICOS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return { enabled: true, config: { token, contato, cepOrigem, ambiente, baseUrl: MELHOR_ENVIO_BASE[ambiente], servicos } };
}

/** Um item da sacola com o preço do catálogo (para o seguro) e as caixas cadastradas. */
export type PackedItem = { key: string; quantity: number; unitPriceCents: number; boxes: ShippingBox[] };

/** Corpo da cotação "por produtos": cada caixa vira um produto; o seguro (preço do catálogo) é dividido entre as caixas. */
export function buildMelhorEnvioRequest(cepOrigem: string, cepDestino: string, items: PackedItem[]) {
  const products = items.flatMap((item) => {
    const insurance = splitCents(item.unitPriceCents, item.boxes.length);
    return item.boxes.map((box, i) => ({
      id: item.boxes.length > 1 ? `${item.key}#${i + 1}` : item.key,
      // A API pede medidas em cm inteiros: arredonda para cima (nunca uma caixa menor que a real).
      width: Math.ceil(box.widthCm),
      height: Math.ceil(box.heightCm),
      length: Math.ceil(box.lengthCm),
      weight: box.weightKg,
      insurance_value: insurance[i] / 100,
      quantity: item.quantity,
    }));
  });
  return {
    from: { postal_code: cepOrigem },
    to: { postal_code: cepDestino },
    products,
    options: { receipt: false, own_hand: false },
  };
}

export type CarrierQuote = {
  serviceId: number;
  service: string;
  company: string;
  priceCents: number;
  daysMin: number | null;
  daysMax: number | null;
};

const asInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

function money(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function range(v: unknown): { min: number | null; max: number | null } | null {
  if (!v || typeof v !== "object") return null;
  const r = v as { min?: unknown; max?: unknown };
  const min = asInt(r.min);
  const max = asInt(r.max);
  return min === null && max === null ? null : { min, max };
}

/**
 * Lê a resposta. Fica só o serviço com valor válido; serviço com erro (ex.: trecho não atendido, caixa grande demais
 * para aquela transportadora) ou sem preço é descartado. Usa custom_price e custom_delivery_* quando vierem (refletem
 * as regras que o dono configurou na conta), como a documentação recomenda.
 */
export function parseMelhorEnvioResponse(body: unknown, servicos: number[] = []): CarrierQuote[] {
  if (!Array.isArray(body)) return [];
  const out: CarrierQuote[] = [];
  for (const raw of body) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    if (s.error) continue;
    const serviceId = asInt(s.id);
    if (!serviceId || (servicos.length && !servicos.includes(serviceId))) continue;
    const service = typeof s.name === "string" ? s.name.trim().slice(0, 80) : "";
    const companyObj = s.company && typeof s.company === "object" ? (s.company as Record<string, unknown>) : null;
    const company = typeof companyObj?.name === "string" ? companyObj.name.trim().slice(0, 80) : "";
    if (!service || !company) continue;
    const priceCents = money(s.custom_price) ?? money(s.price);
    if (priceCents === null) continue;
    const days =
      range(s.custom_delivery_range) ??
      range(s.delivery_range) ??
      (asInt(s.custom_delivery_time) !== null
        ? { min: null, max: asInt(s.custom_delivery_time) }
        : asInt(s.delivery_time) !== null
          ? { min: null, max: asInt(s.delivery_time) }
          : null);
    out.push({ serviceId, service, company, priceCents, daysMin: days?.min ?? null, daysMax: days?.max ?? null });
  }
  return out.sort((a, b) => a.priceCents - b.priceCents);
}

export type MelhorEnvioResult = { ok: true; quotes: CarrierQuote[] } | { ok: false; reason: string };

/** Cota no Melhor Envio. Nunca lança: erro de rede, token inválido ou resposta estranha = sem cotação (a combinar). */
export async function quoteMelhorEnvio(
  config: MelhorEnvioConfig,
  cepDestino: string,
  items: PackedItem[],
  fetchImpl: typeof fetch = fetch,
): Promise<MelhorEnvioResult> {
  if (!items.length || items.some((i) => !i.boxes.length)) return { ok: false, reason: "sem-embalagem" };
  try {
    const res = await fetchImpl(`${config.baseUrl}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
        "User-Agent": `${brand.name} loja (${config.contato})`,
      },
      body: JSON.stringify(buildMelhorEnvioRequest(config.cepOrigem, cepDestino, items)),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    const body = (await res.json().catch(() => null)) as unknown;
    return { ok: true, quotes: parseMelhorEnvioResponse(body, config.servicos) };
  } catch {
    return { ok: false, reason: "rede" };
  }
}

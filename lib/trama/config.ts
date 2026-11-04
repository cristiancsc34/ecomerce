/**
 * Ligação com o Trama (fábrica e logística). Só no servidor: a chave e o segredo nunca vão para o navegador.
 *
 *   TRAMA_API_URL          endereço do Trama, ex.: https://trama.suaempresa.com.br (sem /api/v1)
 *   TRAMA_API_KEY          chave da integração criada no Trama (Configurações → Integrações), começa com trm_live_
 *   TRAMA_WEBHOOK_SEGREDO  segredo dos webhooks da mesma integração (confere a assinatura X-Trama-Assinatura)
 *
 * Sem URL e chave, a integração fica desligada: os pedidos confirmados esperam na fila e o painel mostra isso.
 */
export type TramaConfig = { baseUrl: string; apiKey: string };
type Env = Record<string, string | undefined>;

/** http só para o próprio computador (desenvolvimento); fora dele, só https. */
function urlValida(raw: string): string | null {
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export function tramaConfig(env: Env = process.env): TramaConfig | null {
  const baseUrl = urlValida(env.TRAMA_API_URL?.trim() ?? "");
  const apiKey = env.TRAMA_API_KEY?.trim() ?? "";
  if (!baseUrl || !/^trm_[a-z]+_[A-Za-z0-9_-]{16,}$/.test(apiKey)) return null;
  return { baseUrl, apiKey };
}

export const tramaLigada = (env: Env = process.env) => tramaConfig(env) !== null;

export function tramaWebhookSegredo(env: Env = process.env): string | null {
  const segredo = env.TRAMA_WEBHOOK_SEGREDO?.trim() ?? "";
  return segredo.length >= 16 ? segredo : null;
}

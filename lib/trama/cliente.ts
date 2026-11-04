import { ErroDaTrama, PedidoConsultadoNaTrama, PedidoCriadoNaTrama, type PedidoParaTrama } from "./contrato";
import type { TramaConfig } from "./config";

/**
 * Chamadas à API v1 do Trama. Nunca lança: devolve o resultado classificado para a fila decidir.
 *   * ok        → deu certo;
 *   * corrigir  → o Trama recusou o conteúdo (SKU, preço, chave): precisa de alguém, não adianta repetir;
 *   * repetir   → rede, tempo esgotado, limite de requisições ou erro do Trama: tenta de novo mais tarde.
 */
export type Resposta<T> =
  | { tipo: "ok"; http: number; dados: T }
  | { tipo: "corrigir"; http: number; codigo: string; mensagem: string }
  | { tipo: "repetir"; http: number | null; mensagem: string; esperarSegundos?: number };

export type Fetch = typeof fetch;

const TEMPO_LIMITE_MS = 15_000;

function mensagemDeErro(http: number, corpo: unknown): { codigo: string; mensagem: string } {
  const erro = ErroDaTrama.safeParse(corpo);
  if (erro.success) {
    const campos = erro.data.erro.campos ? Object.entries(erro.data.erro.campos).map(([k, v]) => `${k}: ${v}`) : [];
    const detalhe = campos.length && !erro.data.erro.mensagem.includes(campos[0]!) ? ` (${campos.slice(0, 3).join("; ")})` : "";
    return { codigo: erro.data.erro.codigo, mensagem: `${erro.data.erro.mensagem}${detalhe}`.slice(0, 480) };
  }
  if (http === 401) return { codigo: "nao_autorizado", mensagem: "O Trama recusou a chave da integração (confira TRAMA_API_KEY e se a integração está ativa)." };
  if (http === 404) return { codigo: "nao_encontrado", mensagem: "O Trama não encontrou o pedido." };
  return { codigo: `http_${http}`, mensagem: `O Trama respondeu ${http}.` };
}

async function chamar<T>(
  config: TramaConfig,
  caminho: string,
  init: { method: "GET" | "POST"; body?: unknown },
  validar: (corpo: unknown) => T | null,
  fetcher: Fetch,
): Promise<Resposta<T>> {
  let res: Response;
  try {
    res = await fetcher(`${config.baseUrl}/api/v1${caminho}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch (e) {
    const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { tipo: "repetir", http: null, mensagem: tempo ? "O Trama demorou para responder." : "Não foi possível falar com o Trama (rede)." };
  }
  const corpo: unknown = await res.json().catch(() => null);
  if (res.ok) {
    const dados = validar(corpo);
    return dados === null
      ? { tipo: "repetir", http: res.status, mensagem: "O Trama respondeu num formato inesperado." }
      : { tipo: "ok", http: res.status, dados };
  }
  if (res.status === 429) {
    const espera = Number(res.headers.get("retry-after"));
    return { tipo: "repetir", http: 429, mensagem: "Limite de requisições do Trama.", esperarSegundos: Number.isFinite(espera) && espera > 0 ? espera : 60 };
  }
  if (res.status >= 500 || res.status === 408) {
    return { tipo: "repetir", http: res.status, mensagem: mensagemDeErro(res.status, corpo).mensagem };
  }
  return { tipo: "corrigir", http: res.status, ...mensagemDeErro(res.status, corpo) };
}

const validarCom =
  <T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }) =>
  (corpo: unknown): T | null => {
    const r = schema.safeParse(corpo);
    return r.success ? r.data : null;
  };

const ref = (referencia: string) => encodeURIComponent(referencia);

/** POST /api/v1/pedidos (idempotente pela referência: repetir o mesmo corpo devolve o mesmo pedido). */
export const criarPedidoNaTrama = (config: TramaConfig, pedido: PedidoParaTrama, fetcher: Fetch = fetch) =>
  chamar(config, "/pedidos", { method: "POST", body: pedido }, validarCom(PedidoCriadoNaTrama), fetcher);

/** GET /api/v1/pedidos/{referencia}: etapa atual, situação do pagamento e a entrega agendada. */
export const consultarPedidoNaTrama = (config: TramaConfig, referencia: string, fetcher: Fetch = fetch) =>
  chamar(config, `/pedidos/${ref(referencia)}`, { method: "GET" }, validarCom(PedidoConsultadoNaTrama), fetcher);

/** POST /api/v1/pedidos/{referencia}/cancelamento. 409 = já em produção ou a caminho (a loja resolve no Trama). */
export const cancelarPedidoNaTrama = (config: TramaConfig, referencia: string, motivo: string, fetcher: Fetch = fetch) =>
  chamar(config, `/pedidos/${ref(referencia)}/cancelamento`, { method: "POST", body: { motivo } }, () => ({}), fetcher);

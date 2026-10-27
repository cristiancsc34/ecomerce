import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { fromPriceCents, model3d } from "@/lib/catalog/product-helpers";
import type { Product } from "@/lib/catalog/types";
import { checkAnswer, SAFE_FALLBACK_ANSWER } from "./guard";
import { buildKnowledge, productCard, type AssistantProductCard } from "./knowledge";
import { assistantRules } from "./prompt";
import type { AssistantMessage, AssistantNextStep } from "./types";

export const DEFAULT_ASSISTANT_MODEL = "claude-haiku-5-5";

export function assistantModel(): string {
  return process.env.ASSISTANT_MODEL?.trim() || DEFAULT_ASSISTANT_MODEL;
}

/** Só o que o serviço usa do cliente da Anthropic (permite um cliente falso nos testes). */
export type AssistantClient = { messages: Pick<Anthropic["messages"], "parse"> };

const NEXT_STEPS = ["nenhum", "ver_produto", "girar_3d", "adicionar_sacola", "falar_atendimento"] as const;

/** Formato da resposta: "produtos" só aceita slugs que existem no catálogo. */
export function replySchema(slugs: string[]) {
  const produtos = slugs.length
    ? z.array(z.enum(slugs as [string, ...string[]])).max(3)
    : z.array(z.string()).max(0);
  return z.object({
    resposta: z.string(),
    produtos,
    proximo_passo: z.enum(NEXT_STEPS),
  });
}

export type AssistantReply = {
  answer: string;
  products: AssistantProductCard[];
  nextStep: AssistantNextStep;
  /** true quando a trava trocou a resposta do modelo pela resposta segura. */
  guarded: boolean;
  reasons: string[];
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number } | null;
};

const REFUSAL_ANSWER =
  "Por aqui eu só consigo ajudar com os produtos da loja e com a sua compra. Quer que eu te mostre as opções?";
const ERROR_ANSWER = "Não consegui montar a resposta agora. Pode perguntar de novo?";

function fallback(answer: string, reasons: string[], usage: AssistantReply["usage"]): AssistantReply {
  return { answer, products: [], nextStep: "falar_atendimento", guarded: true, reasons, usage };
}

/** Próximo passo coerente com o catálogo (sem 3D ou sem preço, o botão não aparece). */
function sanitizeNextStep(step: AssistantNextStep, products: Product[]): AssistantNextStep {
  if (step === "girar_3d" && !products.some((p) => model3d(p))) return products.length ? "ver_produto" : "nenhum";
  if (step === "adicionar_sacola" && !products.some((p) => fromPriceCents(p) !== null)) {
    return products.length ? "ver_produto" : "falar_atendimento";
  }
  if (step === "ver_produto" && !products.length) return "nenhum";
  return step;
}

/** Tira caminhos de página do texto ("fale com o atendimento em /atendimento"): os botões já levam lá. */
export function stripPaths(answer: string): string {
  return answer
    .replace(/(?:\s+(?:na\s+página|pela\s+página|no\s+link|em))?\s+\/[a-z][\w\-/#]*/gi, "")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

const ASKED_ABOUT_DETAILS =
  /pre[çc]o|cust|valor|quanto|medida|tamanho|altura|largura|profund|cabe|material|tecido|garantia|frete|entrega|prazo|pag|parcel|estoque|dispon/i;
const CAVEAT = /n[aã]o (foi|foram|est[aá]|est[aã]o) (confirmad|definid)|ainda n[aã]o (tem|temos|h[aá])|ainda n[aã]o (foi|foram)/i;
const CAVEAT_TOPIC = /pre[çc]o|valor|medida|material|garantia|frete|prazo|pagamento|parcel/i;

/**
 * Venda sem balde de água fria: se a pessoa NÃO perguntou por preço, medidas,
 * materiais, frete etc., some a frase que só avisa que isso não foi confirmado.
 * Tirar um aviso não cria informação falsa; quando perguntam, o aviso fica.
 */
export function dropUnaskedCaveats(answer: string, lastQuestion: string): string {
  if (ASKED_ABOUT_DETAILS.test(lastQuestion)) return answer;
  const sentences = answer.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !(CAVEAT.test(s) && CAVEAT_TOPIC.test(s)));
  return kept.length ? kept.join(" ") : answer;
}

export async function askAssistant({
  client,
  catalog,
  history,
  viewingSlug,
}: {
  client: AssistantClient;
  catalog: Product[];
  history: AssistantMessage[];
  /** Produto da página aberta (vem da URL; só vale se existir no catálogo). */
  viewingSlug?: string;
}): Promise<AssistantReply> {
  const knowledge = buildKnowledge(catalog);
  const bySlug = new Map(catalog.map((p) => [p.slug, p]));
  const viewing = viewingSlug ? bySlug.get(viewingSlug) : undefined;

  const response = await client.messages.parse({
    model: assistantModel(),
    // Folga para o raciocínio adaptativo + a resposta curta em JSON.
    max_tokens: 4096,
    // Chat de vendas: "low" responde rápido e barato; o raciocínio continua ligado.
    output_config: { effort: "low", format: zodOutputFormat(replySchema([...bySlug.keys()])) },
    system: [
      { type: "text", text: assistantRules() },
      {
        type: "text",
        text: `<base_de_conhecimento>\n${knowledge}\n</base_de_conhecimento>`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      // Contexto da página como mensagem de sistema (canal do operador, não do cliente);
      // o nome vem do catálogo, nunca do navegador.
      ...(viewing
        ? [
            {
              role: "system" as const,
              content: `Contexto da página: o cliente está vendo agora o produto "${viewing.name}" (código ${viewing.slug}).`,
            },
          ]
        : []),
    ],
  });

  const u = response.usage;
  const usage = {
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };

  // Recusa e corte por tamanho vêm antes de qualquer leitura do conteúdo.
  if (response.stop_reason === "refusal") return fallback(REFUSAL_ANSWER, ["recusa do modelo"], usage);
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    return fallback(ERROR_ANSWER, [`resposta incompleta (${response.stop_reason})`], usage);
  }

  const out = response.parsed_output;
  const lastQuestion = history.findLast((m) => m.role === "user")?.content ?? "";
  const answer = dropUnaskedCaveats(stripPaths(out.resposta), lastQuestion);
  const check = checkAnswer(answer, knowledge);
  if (!check.ok) return fallback(SAFE_FALLBACK_ANSWER, check.reasons, usage);

  const products = [...new Set(out.produtos)].flatMap((slug) => bySlug.get(slug) ?? []);
  return {
    answer,
    products: products.map(productCard),
    nextStep: sanitizeNextStep(out.proximo_passo, products),
    guarded: false,
    reasons: [],
    usage,
  };
}

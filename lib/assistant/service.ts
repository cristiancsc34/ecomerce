import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { fromPriceCents, model3d } from "@/lib/catalog/product-helpers";
import type { Product } from "@/lib/catalog/types";
import { checkAnswer, SAFE_FALLBACK_ANSWER } from "./guard";
import { buildKnowledge, productCard, type AssistantProductCard } from "./knowledge";
import { assistantRules } from "./prompt";
import { spaceResultForModel, verificarEspaco } from "./space";
import { SPACE_TOOL_NAME } from "./types";
import type { AssistantMessage, AssistantNextStep } from "./types";

export const DEFAULT_ASSISTANT_MODEL = "claude-haiku-5-5";

export function assistantModel(): string {
  return process.env.ASSISTANT_MODEL?.trim() || DEFAULT_ASSISTANT_MODEL;
}

/** Só o que o serviço usa do cliente da Anthropic (permite um cliente falso nos testes). */
export type AssistantClient = { messages: Pick<Anthropic["messages"], "create"> };

const NEXT_STEPS = ["nenhum", "ver_produto", "girar_3d", "adicionar_sacola", "falar_atendimento"] as const;

/** Máximo de produtos sugeridos por resposta (vendedor consultivo: poucas opções). */
export const MAX_SUGGESTIONS = 3;
/** Rodadas de ferramenta por resposta (ex.: conferir a poltrona e depois a cadeira). */
const MAX_TOOL_ROUNDS = 3;

/** Formato da resposta: "produtos" só aceita slugs que existem no catálogo, cada um com o motivo. */
export function replySchema(slugs: string[]) {
  const produto = slugs.length ? z.enum(slugs as [string, ...string[]]) : z.never();
  return z.object({
    resposta: z.string(),
    produtos: z.array(z.object({ produto, motivo: z.string() })).max(slugs.length ? MAX_SUGGESTIONS : 0),
    proximo_passo: z.enum(NEXT_STEPS),
  });
}

const spaceInputSchema = z.object({
  produto: z.string(),
  largura: z.number(),
  profundidade: z.number(),
  altura: z.number().nullable(),
  unidade: z.enum(["cm", "m"]),
});

/** Ferramenta "cabe no espaço": o modelo pede, o servidor faz a conta (lib/assistant/space.ts). */
export function spaceTool(slugs: string[]): Anthropic.Tool {
  return {
    name: SPACE_TOOL_NAME,
    description:
      "Confere se um produto do catálogo cabe no espaço do cliente, comparando com as medidas do catálogo. " +
      "Use sempre que o cliente perguntar se uma peça cabe e já tiver dito a largura e a profundidade do espaço; nunca faça a conta você mesmo. " +
      "Passe os números exatamente como o cliente disse e a unidade que ele usou. " +
      "A resposta diz se cabe, se cabe justo ou se não cabe, quanto sobra ou falta em cada medida e uma recomendação de circulação.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        produto: { type: "string", enum: slugs, description: "Código (slug) do produto." },
        largura: { type: "number", description: "Largura do espaço, como o cliente informou." },
        profundidade: { type: "number", description: "Profundidade do espaço, como o cliente informou." },
        altura: { type: ["number", "null"], description: "Altura disponível, só se o cliente informou; senão null." },
        unidade: { type: "string", enum: ["cm", "m"], description: "Unidade que o cliente usou." },
      },
      required: ["produto", "largura", "profundidade", "altura", "unidade"],
      additionalProperties: false,
    },
  };
}

export type AssistantReply = {
  answer: string;
  products: AssistantProductCard[];
  nextStep: AssistantNextStep;
  /** true quando a trava trocou a resposta do modelo pela resposta segura. */
  guarded: boolean;
  reasons: string[];
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number } | null;
  /** Quantas vezes o modelo pediu a conta de espaço (para métricas). */
  toolCalls: number;
};

const REFUSAL_ANSWER =
  "Por aqui eu só consigo ajudar com os produtos da loja e com a sua compra. Quer que eu te mostre as opções?";
const ERROR_ANSWER = "Não consegui montar a resposta agora. Pode perguntar de novo?";

function fallback(answer: string, reasons: string[], usage: AssistantReply["usage"], toolCalls = 0): AssistantReply {
  return { answer, products: [], nextStep: "falar_atendimento", guarded: true, reasons, usage, toolCalls };
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
  const slugs = [...bySlug.keys()].sort();
  const viewing = viewingSlug ? bySlug.get(viewingSlug) : undefined;
  const format = zodOutputFormat(replySchema(slugs));

  const messages: Anthropic.MessageParam[] = [
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
  ];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  /** Respostas da ferramenta: números que o modelo pode repetir (entram na trava). */
  const toolFacts: string[] = [];
  let toolCalls = 0;
  let finalText: string | null = null;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: assistantModel(),
      // Folga para o raciocínio adaptativo + a resposta curta em JSON.
      max_tokens: 4096,
      // Chat de vendas: "low" responde rápido e barato; o raciocínio continua ligado.
      output_config: { effort: "low", format },
      ...(slugs.length ? { tools: [spaceTool(slugs)] } : {}),
      system: [
        { type: "text", text: assistantRules() },
        {
          type: "text",
          text: `<base_de_conhecimento>\n${knowledge}\n</base_de_conhecimento>`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });

    const u = response.usage;
    usage.input += u.input_tokens;
    usage.output += u.output_tokens;
    usage.cacheRead += u.cache_read_input_tokens ?? 0;
    usage.cacheWrite += u.cache_creation_input_tokens ?? 0;

    // Recusa e corte por tamanho vêm antes de qualquer leitura do conteúdo.
    if (response.stop_reason === "refusal") return fallback(REFUSAL_ANSWER, ["recusa do modelo"], usage, toolCalls);
    if (response.stop_reason === "max_tokens") {
      return fallback(ERROR_ANSWER, [`resposta incompleta (${response.stop_reason})`], usage, toolCalls);
    }

    if (response.stop_reason === "tool_use") {
      if (round === MAX_TOOL_ROUNDS) return fallback(ERROR_ANSWER, ["ferramenta chamada vezes demais"], usage, toolCalls);
      // A conversa leva a resposta inteira de volta (inclui o raciocínio, que precisa voltar igual).
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        toolCalls++;
        const input = spaceInputSchema.safeParse(block.input);
        if (block.name !== SPACE_TOOL_NAME || !input.success) {
          results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: "Pedido inválido para a ferramenta." });
          continue;
        }
        const text = spaceResultForModel(verificarEspaco(bySlug.get(input.data.produto), input.data));
        toolFacts.push(text);
        results.push({ type: "tool_result", tool_use_id: block.id, content: text });
      }
      // Todas as respostas juntas, numa mensagem só.
      messages.push({ role: "user", content: results });
      continue;
    }

    finalText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    break;
  }

  let out: z.infer<ReturnType<typeof replySchema>>;
  try {
    out = format.parse(finalText ?? "");
  } catch {
    return fallback(ERROR_ANSWER, ["resposta fora do formato"], usage, toolCalls);
  }

  const lastQuestion = history.findLast((m) => m.role === "user")?.content ?? "";
  // A trava conhece o catálogo e as contas feitas pelo servidor (nada além disso).
  const facts = [knowledge, ...toolFacts].join("\n");
  const answer = dropUnaskedCaveats(stripPaths(out.resposta), lastQuestion);
  const picks = [...new Map(out.produtos.map((p) => [p.produto, p])).values()].slice(0, MAX_SUGGESTIONS);
  const reasonsBySlug = new Map(picks.map((p) => [p.produto, stripPaths(p.motivo).slice(0, 200)]));
  const check = checkAnswer([answer, ...reasonsBySlug.values()].join("\n"), facts);
  if (!check.ok) return fallback(SAFE_FALLBACK_ANSWER, check.reasons, usage, toolCalls);

  const products = picks.flatMap((p) => bySlug.get(p.produto) ?? []);
  return {
    answer,
    products: products.map((p) => productCard(p, reasonsBySlug.get(p.slug) || null)),
    nextStep: sanitizeNextStep(out.proximo_passo, products),
    guarded: false,
    reasons: [],
    usage,
    toolCalls,
  };
}

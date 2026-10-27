import "server-only";
import { z } from "zod";
import type { Product } from "@/lib/catalog/types";

/**
 * Sugestão de textos da loja com a API da OpenAI (modelo com visão).
 *
 * Entra: só o que a equipe confirmou (nome, categoria, medidas, materiais…) e as
 * fotos do produto. Sai: SUGESTÕES — nada é salvo sem uma pessoa aplicar.
 * Regras: não inventar medidas, materiais, garantia, certificações ou
 * benefícios; o que não foi confirmado é descrito só pela aparência.
 */

export const DEFAULT_TEXT_MODEL = "gpt-5.1";

export const copySuggestionSchema = z.object({
  nameSuggestions: z.array(z.string().trim().min(2).max(60)).min(1).max(3),
  shortDescription: z.string().trim().min(10).max(240),
  description: z.string().trim().min(40).max(1500),
  seoTitle: z.string().trim().min(10).max(70),
  seoDescription: z.string().trim().min(30).max(170),
});

export type CopySuggestion = z.infer<typeof copySuggestionSchema> & {
  /** Números citados que não estão nos dados confirmados (para a equipe revisar). */
  unconfirmedNumbers: string[];
};

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nameSuggestions", "shortDescription", "description", "seoTitle", "seoDescription"],
  properties: {
    nameSuggestions: { type: "array", items: { type: "string" }, description: "3 nomes curtos e comerciais em português" },
    shortDescription: { type: "string", description: "1 frase, até 200 caracteres" },
    description: { type: "string", description: "2 ou 3 parágrafos curtos separados por linha em branco, até 1200 caracteres" },
    seoTitle: { type: "string", description: "até 60 caracteres" },
    seoDescription: { type: "string", description: "até 155 caracteres" },
  },
} as const;

/** Dados confirmados pela equipe que podem ser citados. */
export function confirmedFacts(product: Product) {
  const a = product.attributes;
  const d = product.dimensions;
  return {
    nomeAtual: product.name,
    categoria: product.category?.name ?? null,
    medidasCm: { altura: d.heightCm ?? null, largura: d.widthCm ?? null, profundidade: d.lengthCm ?? null },
    pesoKg: d.weightKg ?? null,
    materiais: a.materials ?? [],
    tecido: a.fabric ?? null,
    garantia: a.warranty ?? null,
    cuidados: a.care ?? [],
    outrasEspecificacoes: a.extraSpecs ?? [],
  };
}

const INSTRUCTIONS = `Você escreve textos de vitrine para uma loja online brasileira de móveis e colchões.
Escreva em português do Brasil, tom acolhedor e direto, frases curtas, sem exageros nem clichês.

Regras obrigatórias:
- Use SOMENTE os dados confirmados (JSON) e o que é claramente visível nas fotos.
- Não invente medidas, peso, materiais, densidade, garantia, prazo, certificações, origem, marca ou benefícios de saúde.
- Se um material não estiver nos dados confirmados, descreva só a aparência (ex.: "estrutura em tom de madeira clara",
  "estofado azul-marinho com costuras verticais"), nunca afirme do que é feito.
- Não use números, a não ser os que estão nos dados confirmados.
- Sem emojis, sem CAIXA ALTA, sem preço, sem promoções.
- Os nomes sugeridos devem ser curtos (2 ou 3 palavras), em português, começando pelo tipo do móvel (ex.: "Poltrona ...").`;

export async function suggestCopy({
  product,
  images,
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
}: {
  product: Product;
  images: { mime: string; bytes: Uint8Array }[];
  apiKey?: string;
  model?: string;
}): Promise<CopySuggestion> {
  if (!apiKey) throw new Error("A chave da OpenAI não está configurada no servidor.");
  const facts = confirmedFacts(product);

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      instructions: INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: `Dados confirmados (JSON):\n${JSON.stringify(facts, null, 2)}\n\nFotos do produto a seguir.` },
            ...images.map((img) => ({
              type: "input_image",
              image_url: `data:${img.mime};base64,${Buffer.from(img.bytes).toString("base64")}`,
            })),
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "textos_da_loja", strict: true, schema: JSON_SCHEMA } },
    }),
  });
  const body = (await res.json().catch(() => null)) as { error?: { message?: string }; output?: unknown[] } | null;
  if (!res.ok) throw new Error(`OpenAI: ${body?.error?.message ?? `erro ${res.status}`}`.slice(0, 300));

  const text = outputText(body);
  const parsed = copySuggestionSchema.safeParse(safeJson(text));
  if (!parsed.success) throw new Error("A IA devolveu um texto fora do formato. Tente de novo.");
  return { ...parsed.data, unconfirmedNumbers: unconfirmedNumbers(parsed.data, facts) };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function outputText(body: { output?: unknown[] } | null): string {
  for (const item of body?.output ?? []) {
    const content = (item as { type?: string; content?: { type?: string; text?: string }[] }).content;
    if ((item as { type?: string }).type !== "message" || !content) continue;
    for (const part of content) if (part.type === "output_text" && part.text) return part.text;
  }
  return "";
}

/** Números no texto que não aparecem nos dados confirmados. */
export function unconfirmedNumbers(copy: z.infer<typeof copySuggestionSchema>, facts: unknown): string[] {
  const allowed = new Set((JSON.stringify(facts).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".")));
  const text = [copy.shortDescription, copy.description, copy.seoTitle, copy.seoDescription, ...copy.nameSuggestions].join(" ");
  const found = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
  return [...new Set(found.filter((n) => !allowed.has(n)))];
}

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/auth/rate-limit";
import { assistantEnabled, supportUrl } from "@/lib/assistant/config";
import { askAssistant } from "@/lib/assistant/service";
import { assistantRequestSchema } from "@/lib/assistant/request";
import type { AssistantApiResponse } from "@/lib/assistant/types";
import { getVisibleProducts } from "@/lib/catalog/queries";

const MAX_BODY_BYTES = 24 * 1024;
/** Por IP: 20 mensagens a cada 10 minutos (custo e abuso). */
const LIMIT = { limit: 20, windowMs: 10 * 60_000 };

const BUSY = "O assistente está com muita procura agora. Tente de novo em instantes ou fale com o nosso atendimento.";

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anon";
}

/**
 * Assistente de vendas: recebe a conversa, responde com base SÓ no catálogo.
 * A chave da Anthropic fica no servidor; preços e produtos citados vêm do
 * catálogo (o navegador não define nada).
 */
export async function POST(request: Request) {
  if (!assistantEnabled()) {
    return NextResponse.json({ error: "Assistente indisponível." }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ error: "Envie JSON." }, { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Conversa grande demais. Comece uma nova." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 422 });
  }

  const limited = rateLimit(`assistente:${clientIp(request)}`, LIMIT);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Muitas mensagens em pouco tempo. Aguarde um pouco e tente de novo." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  try {
    const catalog = await getVisibleProducts();
    const client = new Anthropic({ maxRetries: 1, timeout: 25_000 });
    const reply = await askAssistant({
      client,
      catalog,
      history: parsed.data.messages,
      viewingSlug: parsed.data.pagina?.produto,
    });

    // Só métricas, nunca o texto da conversa (privacidade).
    console.info(
      JSON.stringify({ evento: "assistente", guardado: reply.guarded, motivos: reply.reasons, uso: reply.usage }),
    );

    const payload: AssistantApiResponse = {
      answer: reply.answer,
      products: reply.products,
      nextStep: reply.nextStep,
      supportUrl: supportUrl(),
    };
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: BUSY }, { status: 503, headers: { "Retry-After": "20" } });
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error("assistente: chave da Anthropic inválida ou sem permissão");
      return NextResponse.json({ error: BUSY }, { status: 503 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`assistente: erro da API ${error.status ?? "?"}`);
      return NextResponse.json({ error: BUSY }, { status: 503 });
    }
    console.error("assistente: falha inesperada", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: BUSY }, { status: 500 });
  }
}

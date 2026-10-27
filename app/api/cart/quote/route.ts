import { NextResponse } from "next/server";
import { quoteCart } from "@/lib/cart/quote";
import { cartQuoteRequestSchema } from "@/lib/cart/types";
import { getVisibleProducts } from "@/lib/catalog/queries";

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Recalcula a sacola no servidor: preço, disponibilidade e existência dos
 * itens vêm do catálogo, nunca do navegador. Só aceita ids e quantidades.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ error: "Envie JSON." }, { status: 415 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Requisição grande demais." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = cartQuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Itens da sacola inválidos." }, { status: 422 });
  }

  try {
    const products = await getVisibleProducts();
    const quote = quoteCart(parsed.data.items, products);
    return NextResponse.json(quote, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Sem detalhes internos na resposta.
    return NextResponse.json({ error: "Não foi possível calcular a sacola agora." }, { status: 503 });
  }
}

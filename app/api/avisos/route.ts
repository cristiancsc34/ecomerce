import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processOrderNotifications } from "@/lib/notifications/order-dispatch";

/**
 * Envia os avisos de pedido que estão na fila (novas tentativas incluídas). Chamada pelo agendador da Vercel
 * (vercel.json → crons) com "Authorization: Bearer <CRON_SECRET>". Sem CRON_SECRET configurado, fica fechada.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const result = await processOrderNotifications({ limit: 50 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

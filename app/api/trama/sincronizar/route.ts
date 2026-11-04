import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { atualizarPedidosAbertos, enviarAvisosDasEtapas, processarFilaDoTrama } from "@/lib/trama/sincronizar";

/**
 * Rede de segurança da integração com o Trama: envia o que ficou na fila (novas tentativas) e confere no Trama os
 * pedidos abertos, caso algum webhook não tenha chegado. Chamada pelo agendador da Vercel (vercel.json → crons) com
 * "Authorization: Bearer <CRON_SECRET>". Sem CRON_SECRET configurado, fica fechada.
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
  const fila = await processarFilaDoTrama({ limit: 50 });
  const abertos = await atualizarPedidosAbertos({ limit: 30 });
  if (fila.etapas || abertos.etapas) await enviarAvisosDasEtapas();
  return NextResponse.json({ fila, abertos }, { headers: { "Cache-Control": "no-store" } });
}

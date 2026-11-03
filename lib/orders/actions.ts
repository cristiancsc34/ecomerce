"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/auth/rate-limit";
import { findOrderToken } from "./tracking";

export type TrackLookupState = { error: string | null; code: string; phone: string };

/** "Acompanhar pedido": número do pedido + celular de quem comprou. */
export async function trackOrderAction(_prev: TrackLookupState, form: FormData): Promise<TrackLookupState> {
  const code = String(form.get("codigo") ?? "").trim().toUpperCase().slice(0, 20);
  const phone = String(form.get("celular") ?? "").slice(0, 30);
  const state = { code, phone };
  if (!code || phone.replace(/\D/g, "").length < 10) {
    return { ...state, error: "Informe o número do pedido e o celular com DDD." };
  }
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
  if (!rateLimit(`acompanhar:${ip}`, { limit: 10, windowMs: 10 * 60_000 }).allowed) {
    return { ...state, error: "Muitas tentativas seguidas. Aguarde alguns minutos." };
  }
  const token = await findOrderToken(code, phone);
  if (!token) return { ...state, error: "Não encontramos um pedido com esse número e esse celular. Confira os dados ou fale com o atendimento." };
  redirect(`/pedido/${encodeURIComponent(code)}?t=${token}`);
}

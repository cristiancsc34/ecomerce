"use server";

import { AuthorizationError, requireStaffAction } from "@/lib/auth/staff";
import { isUuid } from "@/lib/catalog/slug";
import { createSessionClient } from "@/lib/supabase/server";
import { orderInputSchema, orderStatusInputSchema, orderToRpc, type OrderInput, type OrderStatusInput } from "@/lib/validation/order";
import { friendlyDbError } from "../errors";
import type { ActionResult } from "../types";

async function guard(): Promise<{ ok: false; error: string } | null> {
  try {
    await requireStaffAction();
    return null;
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Sem permissão." };
  }
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Registra um pedido fechado pelo atendimento. */
export async function createOrderAction(input: OrderInput): Promise<ActionResult<{ id: string }>> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = orderInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrors(parsed.error.issues) };
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("create_order", { p_data: orderToRpc(parsed.data) });
  if (error || !data) return { ok: false, error: friendlyDbError(error, "Não foi possível registrar o pedido.") };
  return { ok: true, data: { id: data as string } };
}

/** Edita os dados do pedido (itens só antes do envio; o banco confere). */
export async function updateOrderAction(orderId: string, input: OrderInput, includeItems: boolean): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(orderId)) return { ok: false, error: "Pedido inválido." };
  const parsed = orderInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrors(parsed.error.issues) };
  const payload: Record<string, unknown> = orderToRpc(parsed.data);
  delete payload.status;
  if (!includeItems) delete payload.items;
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("update_order", { p_order_id: orderId, p_data: payload });
  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true };
}

/** Avança o pedido para a próxima etapa (o banco confere se a ordem é válida). */
export async function setOrderStatusAction(orderId: string, input: OrderStatusInput): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!isUuid(orderId)) return { ok: false, error: "Pedido inválido." };
  const parsed = orderStatusInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { status, publicNote, internalNote, delivery } = parsed.data;
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_order_status", {
    p_order_id: orderId,
    p_status: status,
    p_public_note: publicNote || null,
    p_internal_note: internalNote || null,
    p_delivery: delivery,
  });
  if (error) return { ok: false, error: friendlyDbError(error, "Não foi possível mudar a etapa.") };
  return { ok: true };
}

/** Endereço pelo CEP (ViaCEP, gratuito). Feito no servidor: o navegador não fala com terceiros. */
export async function lookupCepAction(
  cep: string,
): Promise<ActionResult<{ rua: string; bairro: string; cidade: string; uf: string }>> {
  const denied = await guard();
  if (denied) return denied;
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return { ok: false, error: "CEP com 8 dígitos." };
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    const body = (await res.json().catch(() => null)) as Record<string, string> | null;
    if (!res.ok || !body || body.erro) return { ok: false, error: "CEP não encontrado. Preencha o endereço à mão." };
    return { ok: true, data: { rua: body.logradouro ?? "", bairro: body.bairro ?? "", cidade: body.localidade ?? "", uf: body.uf ?? "" } };
  } catch {
    return { ok: false, error: "Não foi possível consultar o CEP agora. Preencha o endereço à mão." };
  }
}

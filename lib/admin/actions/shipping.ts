"use server";

import { AuthorizationError, requireStaffAction } from "@/lib/auth/staff";
import { isUuid } from "@/lib/catalog/slug";
import { providerStatus } from "@/lib/notifications/providers";
import { createSessionClient } from "@/lib/supabase/server";
import { notificationSettingsSchema, shippingOptionSchema, type NotificationSettingsInput, type ShippingOptionInput } from "@/lib/validation/shipping";
import { friendlyDbError } from "../errors";
import type { ActionResult } from "../types";

/**
 * Entrega e avisos: mudam o administrador e quem entrou com a senha da área de entrega (o banco confere de novo pelo
 * RLS, private.has_explicit_area).
 */
async function adminOnly(): Promise<{ ok: false; error: string } | null> {
  try {
    const staff = await requireStaffAction("editor", "entrega");
    if (staff.role !== "admin" && !staff.areas.includes("entrega")) {
      throw new AuthorizationError("Somente a administração geral ou a área de entrega mudam isso.");
    }
    return null;
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Sem permissão." };
  }
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) out[issue.path.map(String).join(".")] ??= issue.message;
  return out;
}

export async function saveNotificationSettingsAction(input: NotificationSettingsInput): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = notificationSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  // Aviso automático só liga com o provedor configurado: senão a fila acumularia mensagens que nunca saem.
  const ready = providerStatus();
  if (parsed.data.notifyEmail && !ready.email) return { ok: false, error: "Configure o e-mail (RESEND_API_KEY e EMAIL_FROM) antes de ligar os avisos por e-mail." };
  if (parsed.data.notifyWhatsapp && !ready.whatsapp) {
    return { ok: false, error: "Configure o WhatsApp (WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID) antes de ligar os avisos por WhatsApp." };
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("notification_settings")
    .update({ notify_email: parsed.data.notifyEmail, notify_whatsapp: parsed.data.notifyWhatsapp })
    .eq("id", true)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Somente administradores podem fazer isso." };
  return { ok: true };
}

export async function saveShippingOptionAction(id: string | null, input: ShippingOptionInput): Promise<ActionResult<{ id: string }>> {
  const denied = await adminOnly();
  if (denied) return denied;
  if (id !== null && !isUuid(id)) return { ok: false, error: "Forma de entrega inválida." };
  const parsed = shippingOptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrors(parsed.error.issues) };
  const supabase = await createSessionClient();
  const query = id
    ? supabase.from("shipping_options").update(parsed.data).eq("id", id).select("id")
    : supabase.from("shipping_options").insert(parsed.data).select("id");
  const { data, error } = await query;
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Forma de entrega não encontrada." };
  return { ok: true, data: { id: data[0].id as string } };
}

export async function deleteShippingOptionAction(id: string): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  if (!isUuid(id)) return { ok: false, error: "Forma de entrega inválida." };
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("shipping_options").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Forma de entrega não encontrada." };
  return { ok: true };
}

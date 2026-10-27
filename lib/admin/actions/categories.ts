"use server";

import { updateTag } from "next/cache";
import { AuthorizationError, requireStaffAction } from "@/lib/auth/staff";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { isUuid } from "@/lib/catalog/slug";
import { createSessionClient } from "@/lib/supabase/server";
import { categorySaveSchema } from "@/lib/validation/product";
import { friendlyDbError } from "../errors";
import type { ActionResult } from "../types";

export type CategoryFormState = { ok: boolean; error: string | null; fieldErrors?: Record<string, string>; savedAt?: number };

export async function saveCategoryAction(_prev: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  try {
    await requireStaffAction();
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Sem permissão." };
  }
  const id = String(formData.get("id") ?? "");
  const parsed = categorySaveSchema.safeParse({
    name: formData.get("name") ?? "",
    slug: formData.get("slug") ?? "",
    description: formData.get("description") ?? "",
    sortOrder: formData.get("sortOrder") ?? "0",
    requires3d: formData.get("requires3d") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, error: "Revise os campos.", fieldErrors };
  }
  const row = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    description: parsed.data.description,
    sort_order: parsed.data.sortOrder,
    requires_3d: parsed.data.requires3d,
  };
  const supabase = await createSessionClient();
  const { error } = id && isUuid(id)
    ? await supabase.from("categories").update(row).eq("id", id)
    : await supabase.from("categories").insert(row);
  if (error) return { ok: false, error: friendlyDbError(error) };
  updateTag(CATALOG_TAG);
  return { ok: true, error: null, savedAt: Date.now() };
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  try {
    await requireStaffAction("admin");
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Sem permissão." };
  }
  if (!isUuid(id)) return { ok: false, error: "Categoria inválida." };
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("categories").delete().eq("id", id).select("id");
  if (error) {
    return {
      ok: false,
      error: error.code === "23503" ? "Há produtos nesta categoria. Mova-os antes de excluir." : friendlyDbError(error),
    };
  }
  if (!data?.length) return { ok: false, error: "Categoria não encontrada ou sem permissão." };
  updateTag(CATALOG_TAG);
  return { ok: true };
}

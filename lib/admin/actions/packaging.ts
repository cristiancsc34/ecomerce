"use server";

import { z } from "zod";
import { AuthorizationError, requireStaffAction } from "@/lib/auth/staff";
import { isUuid } from "@/lib/catalog/slug";
import { shippingBoxesSchema } from "@/lib/shipping/packages";
import { createSessionClient } from "@/lib/supabase/server";
import { friendlyDbError } from "../errors";
import type { ActionResult } from "../types";

/**
 * Caixas da embalagem (peso e medidas do produto embalado), para cotar o frete com a transportadora.
 * Salva à parte do formulário do produto: assim o resto do cadastro funciona mesmo sem a migração aplicada.
 * Quem pode: a equipe do catálogo; o banco (RLS) só deixa editor mudar rascunho/revisão, como no resto do produto.
 */

const inputSchema = z.object({
  product: shippingBoxesSchema,
  variants: z
    .array(z.object({ id: z.uuid(), boxes: shippingBoxesSchema.nullable() }))
    .max(20),
});

export type PackagingInput = z.input<typeof inputSchema>;

const MISSING_MIGRATION =
  "O cadastro da embalagem ainda não está ativo no banco (falta aplicar a migração 20261119000200_frete_transportadoras.sql).";

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204" || /shipping_packages/.test(error.message ?? "")));
}

export async function saveProductPackagingAction(productId: string, input: PackagingInput): Promise<ActionResult> {
  try {
    await requireStaffAction("editor", "itens");
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Sem permissão." };
  }
  if (!isUuid(productId)) return { ok: false, error: "Produto inválido." };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.map(String).join(".")] ??= issue.message;
    return { ok: false, error: "Revise as medidas destacadas.", fieldErrors };
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("products")
    .update({ shipping_packages: parsed.data.product })
    .eq("id", productId)
    .select("id");
  if (isMissingColumn(error)) return { ok: false, error: MISSING_MIGRATION };
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Produto não encontrado ou sem permissão para alterar (publicado: só administradores)." };

  for (const v of parsed.data.variants) {
    const r = await supabase
      .from("product_variants")
      .update({ shipping_packages: v.boxes && v.boxes.length ? v.boxes : null })
      .eq("id", v.id)
      .eq("product_id", productId)
      .select("id");
    if (isMissingColumn(r.error)) return { ok: false, error: MISSING_MIGRATION };
    if (r.error) return { ok: false, error: friendlyDbError(r.error) };
  }
  return { ok: true };
}

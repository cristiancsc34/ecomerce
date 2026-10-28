"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { AuthorizationError, requireStaffAction } from "@/lib/auth/staff";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { isUuid, slugify } from "@/lib/catalog/slug";
import type { ProductStatus } from "@/lib/catalog/types";
import { createSessionClient } from "@/lib/supabase/server";
import { productSaveSchema, publishIssues, statusSchema } from "@/lib/validation/product";
import { getAdminProduct } from "../data";
import { friendlyDbError } from "../errors";
import { removeOrphanFiles } from "../storage";
import type { ActionResult } from "../types";

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof AuthorizationError) return { ok: false, error: error.message };
  return { ok: false, error: "Algo deu errado. Tente novamente." };
}

/** Converte os caminhos de erro do Zod (formato salvo) para os campos do formulário. */
function toFormField(path: PropertyKey[]): string {
  const p = path.map(String);
  const map: Record<string, string> = {
    priceCents: "price",
    compareAtPriceCents: "compareAtPrice",
    "dimensions.heightCm": "heightCm",
    "dimensions.widthCm": "widthCm",
    "dimensions.lengthCm": "lengthCm",
    "dimensions.weightKg": "weightKg",
    "attributes.firmness": "firmness",
    "attributes.materials": "materialsText",
    "attributes.layers": "layersText",
    "attributes.care": "careText",
    "attributes.fabric": "fabric",
    "attributes.warranty": "warranty",
  };
  const joined = p.join(".");
  if (map[joined]) return map[joined];
  if (p[0] === "variants" && p[2] === "priceCents") return `variants.${p[1]}.price`;
  return joined;
}

export async function saveProductAction(productId: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireStaffAction();
  } catch (e) {
    return fail(e);
  }
  if (productId !== null && !isUuid(productId)) return { ok: false, error: "Produto inválido." };

  const parsed = productSaveSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = toFormField(issue.path);
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: "Revise os campos destacados.", fieldErrors };
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("save_product", { p_product_id: productId, p_data: parsed.data });
  if (error || typeof data !== "string") {
    const message = friendlyDbError(error);
    const fieldErrors: Record<string, string> | undefined = message.includes("slug")
      ? { slug: message }
      : message.includes("SKU")
        ? { sku: message }
        : undefined;
    return { ok: false, error: message, fieldErrors };
  }
  updateTag(CATALOG_TAG);
  return { ok: true, data: { id: data } };
}

const ALLOWED_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  draft: ["review", "published", "archived"],
  review: ["draft", "published", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"],
};

export async function changeStatusAction(
  productId: string,
  nextStatus: string,
): Promise<ActionResult<{ issues?: string[] }>> {
  const parsedStatus = statusSchema.safeParse(nextStatus);
  if (!parsedStatus.success || !isUuid(productId)) return { ok: false, error: "Pedido inválido." };
  const to = parsedStatus.data;
  try {
    // Publicar, arquivar e mexer em produto publicado/arquivado: só administradores.
    await requireStaffAction(to === "published" || to === "archived" ? "admin" : "editor");
  } catch (e) {
    return fail(e);
  }

  const product = await getAdminProduct(productId);
  if (!product) return { ok: false, error: "Produto não encontrado." };
  if (!ALLOWED_TRANSITIONS[product.status].includes(to)) {
    return { ok: false, error: "Essa mudança de status não é permitida." };
  }
  if (to === "published") {
    const issues = publishIssues(product);
    if (issues.length) return { ok: false, error: "Ainda falta algo para publicar.", fieldErrors: Object.fromEntries(issues.map((i, n) => [`${i.field}.${n}`, i.message])) };
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.from("products").update({ status: to }).eq("id", productId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  updateTag(CATALOG_TAG);
  return { ok: true, data: {} };
}

export async function duplicateProductAction(productId: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireStaffAction();
  } catch (e) {
    return fail(e);
  }
  if (!isUuid(productId)) return { ok: false, error: "Produto inválido." };
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("duplicate_product", { p_product_id: productId });
  if (error || typeof data !== "string") return { ok: false, error: friendlyDbError(error, "Não foi possível duplicar.") };
  return { ok: true, data: { id: data } };
}

/** Converte demonstração em produto real (só admin, com confirmação explícita na interface). */
export async function markAsRealProductAction(productId: string): Promise<ActionResult> {
  try {
    await requireStaffAction("admin");
  } catch (e) {
    return fail(e);
  }
  if (!isUuid(productId)) return { ok: false, error: "Produto inválido." };
  const supabase = await createSessionClient();
  const { error } = await supabase.from("products").update({ is_demo: false }).eq("id", productId).eq("status", "draft");
  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true };
}

/** Exclui rascunhos/arquivados (só admin) e limpa arquivos que ficaram sem uso. */
export async function deleteProductAction(productId: string): Promise<ActionResult> {
  try {
    await requireStaffAction("admin");
  } catch (e) {
    return fail(e);
  }
  if (!isUuid(productId)) return { ok: false, error: "Produto inválido." };
  const supabase = await createSessionClient();

  const { data: media } = await supabase.from("product_media").select("storage_path").eq("product_id", productId);
  const { data: deleted, error } = await supabase.from("products").delete().eq("id", productId).select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!deleted?.length) {
    return { ok: false, error: "Só é possível excluir rascunhos ou arquivados. Despublique antes." };
  }

  await removeOrphanFiles((media ?? []).map((m) => m.storage_path as string));
  updateTag(CATALOG_TAG);
  return { ok: true };
}

const draftSchema = z.object({
  name: z.string().trim().min(2, "Escreva o nome do produto.").max(120, "Use no máximo 120 caracteres."),
  categoryId: z.union([z.uuid(), z.literal("")]),
});

/**
 * Cadastro em um passo: só nome e categoria. O resto (fotos, preço, detalhes)
 * é preenchido depois, na página do produto. Se o endereço já existir, tenta
 * "-2", "-3"… para a pessoa não precisar pensar em slug.
 */
export async function createProductDraftAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireStaffAction();
  } catch (e) {
    return fail(e);
  }
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "Revise os campos destacados.", fieldErrors };
  }
  // Nome só com símbolos ("!!") ainda ganha um endereço válido.
  const base = slugify(parsed.data.name) || "produto";

  const supabase = await createSessionClient();
  for (let attempt = 1; attempt <= 20; attempt++) {
    const slug = attempt === 1 ? base : `${base.slice(0, 76)}-${attempt}`;
    const data = productSaveSchema.parse({
      name: parsed.data.name,
      slug,
      shortDescription: null,
      description: null,
      categoryId: parsed.data.categoryId || null,
      priceCents: null,
      compareAtPriceCents: null,
      sku: null,
      stockQuantity: null,
      dimensions: {},
      attributes: {},
      faq: [],
      seoTitle: null,
      seoDescription: null,
      variants: [],
    });
    const { data: id, error } = await supabase.rpc("save_product", { p_product_id: null, p_data: data });
    if (!error && typeof id === "string") {
      updateTag(CATALOG_TAG);
      return { ok: true, data: { id } };
    }
    const text = `${error?.message ?? ""} ${error?.details ?? ""}`;
    if (!text.includes("products_slug_key")) return { ok: false, error: friendlyDbError(error) };
  }
  return { ok: false, error: "Não foi possível criar um endereço único. Tente outro nome." };
}

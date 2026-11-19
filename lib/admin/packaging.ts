import "server-only";
import { createSessionClient } from "@/lib/supabase/server";
import { parseBoxes, type ShippingBox } from "@/lib/shipping/packages";

/** Caixas da embalagem de um produto e das variações, para o painel (aba Preço). Ver docs/FRETE-TRANSPORTADORAS.md. */
export type ProductPackaging =
  | { available: false }
  | {
      available: true;
      product: ShippingBox[];
      /** boxes null = a variação usa as caixas do produto. */
      variants: { id: string; name: string; boxes: ShippingBox[] | null }[];
    };

/** Sem a migração 20261119000200 aplicada, as colunas não existem: o painel avisa em vez de quebrar. */
export async function getProductPackaging(productId: string): Promise<ProductPackaging> {
  try {
    const supabase = await createSessionClient();
    const [product, variants] = await Promise.all([
      supabase.from("products").select("shipping_packages").eq("id", productId).maybeSingle(),
      supabase.from("product_variants").select("id, name, shipping_packages").eq("product_id", productId).order("sort_order"),
    ]);
    if (product.error || variants.error || !product.data) return { available: false };
    return {
      available: true,
      product: parseBoxes(product.data.shipping_packages),
      variants: (variants.data ?? []).map((v) => {
        const own = parseBoxes(v.shipping_packages);
        return { id: String(v.id), name: String(v.name), boxes: own.length ? own : null };
      }),
    };
  } catch {
    return { available: false };
  }
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminProduct } from "@/lib/admin/data";
import { requireStaffPage } from "@/lib/auth/staff";
import { STATUS_LABELS } from "@/lib/catalog/types";
import { ProductView } from "@/components/product/product-view";

export const metadata: Metadata = { title: "Pré-visualização", robots: { index: false, follow: false } };

export default async function PreviewPage({ params }: PageProps<"/admin/produtos/[id]/preview">) {
  await requireStaffPage();
  const { id } = await params;
  const product = await getAdminProduct(id);
  if (!product) notFound();

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-10 lg:-my-10">
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 bg-deep-fjord px-4 py-3 text-sm text-white sm:px-6">
        <p>
          <strong>Pré-visualização</strong> — status: {STATUS_LABELS[product.status]}. Visitantes{" "}
          {product.status === "published" ? "veem esta página." : "não veem esta página."}
        </p>
        <Link href={`/admin/produtos/${product.id}`} className="inline-flex min-h-10 items-center font-semibold underline underline-offset-2">
          Voltar à edição
        </Link>
      </div>
      <div className="bg-cloud">
        <ProductView product={product} related={[]} preview />
      </div>
    </div>
  );
}

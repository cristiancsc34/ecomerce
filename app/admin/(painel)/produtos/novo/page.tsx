import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "@/config/site";
import { listAdminCategories } from "@/lib/admin/data";
import { requireStaffPage } from "@/lib/auth/staff";
import { ProductForm } from "@/components/admin/product-form";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  await requireStaffPage();
  const categories = await listAdminCategories();
  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/admin/produtos" className="link text-sm">
        ← Produtos
      </Link>
      <h1 className="text-3xl font-bold">Novo produto</h1>
      <Notice tone="info" title="O produto começa como rascunho">
        Rascunhos não aparecem na loja. Depois de criar, você envia as fotos e, quando tudo estiver verificado, publica.
      </Notice>
      <ProductForm product={null} categories={categories} canEdit siteUrl={siteUrl()} />
    </div>
  );
}

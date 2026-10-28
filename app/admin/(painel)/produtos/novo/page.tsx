import type { Metadata } from "next";
import Link from "next/link";
import { listAdminCategories } from "@/lib/admin/data";
import { requireStaffPage } from "@/lib/auth/staff";
import { NewProductForm } from "@/components/admin/new-product-form";
import { PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Novo produto" };

const STEPS = [
  "Dê um nome (pode mudar depois).",
  "Envie as fotos do celular: o fundo é limpo e o 3D é gerado.",
  "Preencha preço e descrição e publique.",
];

export default async function NewProductPage() {
  await requireStaffPage();
  const categories = await listAdminCategories();
  return (
    <div className="mx-auto max-w-xl">
      <Link href="/admin/produtos" className="link text-sm">
        ← Produtos
      </Link>
      <div className="mt-3">
        <PageHeader title="Novo produto" subtitle="Começa como rascunho: só aparece na loja depois de publicado." />
      </div>
      <ol className="mb-5 space-y-2">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-start gap-3 text-sm text-ink">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-deep-fjord text-xs font-bold text-white">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <NewProductForm categories={categories} />
    </div>
  );
}

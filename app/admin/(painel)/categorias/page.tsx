import type { Metadata } from "next";
import { listAdminCategories } from "@/lib/admin/data";
import { requireStaffPage } from "@/lib/auth/staff";
import { CategoryForm } from "@/components/admin/category-form";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriesPage() {
  const staff = await requireStaffPage();
  const categories = await listAdminCategories();
  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Categorias</h1>
        <p className="mt-1 text-muted">Categorias sem produtos publicados não aparecem na loja.</p>
      </header>

      <section aria-labelledby="nova-categoria" className="rounded-[1.25rem] border border-line bg-white p-5 sm:p-6">
        <h2 id="nova-categoria" className="mb-4 text-lg font-bold">
          Nova categoria
        </h2>
        <CategoryForm canDelete={false} />
      </section>

      <section aria-labelledby="lista-categorias" className="space-y-4">
        <h2 id="lista-categorias" className="text-lg font-bold">
          Existentes
        </h2>
        {categories.map((c) => (
          <div key={c.id} className="rounded-[1.25rem] border border-line bg-white p-5 sm:p-6">
            <p className="mb-3 text-sm text-muted">
              {c.productCount} {c.productCount === 1 ? "produto" : "produtos"}
            </p>
            <CategoryForm category={c} canDelete={staff.role === "admin"} />
          </div>
        ))}
      </section>
    </div>
  );
}

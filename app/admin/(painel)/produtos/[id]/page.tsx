import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteUrl } from "@/config/site";
import { getAdminProduct, listAdminCategories, listAuditEvents } from "@/lib/admin/data";
import { requireStaffPage } from "@/lib/auth/staff";
import { publishIssues } from "@/lib/validation/product";
import { AuditList } from "@/components/admin/audit-list";
import { MediaManager } from "@/components/admin/media-manager";
import { ProductForm } from "@/components/admin/product-form";
import { StatusActions } from "@/components/admin/status-actions";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/produtos/[id]">) {
  const staff = await requireStaffPage();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [product, categories, events] = await Promise.all([
    getAdminProduct(id),
    listAdminCategories(),
    listAuditEvents({ productId: id, limit: 15 }),
  ]);
  if (!product) notFound();

  // Editores trabalham em rascunho/revisão; publicados e arquivados são do admin (o banco garante o mesmo).
  const canEdit = staff.role === "admin" || product.status === "draft" || product.status === "review";
  const issues = publishIssues(product).map((i) => i.message);

  return (
    <div className="space-y-6">
      <Link href="/admin/produtos" className="link text-sm">
        ← Produtos
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{product.name}</h1>
        {product.isDemo ? <Badge tone="demo">Demonstração</Badge> : null}
      </header>

      {sp.criado ? (
        <Notice tone="success" role="status" title="Rascunho criado">
          Agora envie as fotos abaixo. O produto só aparece na loja depois de publicado.
        </Notice>
      ) : null}
      {sp.duplicado ? (
        <Notice tone="success" role="status" title="Cópia criada como rascunho">
          Revise nome, endereço e SKU antes de publicar.
        </Notice>
      ) : null}
      {product.isDemo ? (
        <Notice tone="demo" title="Produto de demonstração">
          Os dados são ilustrativos e o banco impede a publicação. Use-o para testar o painel ou substitua tudo por dados
          reais e converta.
        </Notice>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <ProductForm product={product} categories={categories} canEdit={canEdit} siteUrl={siteUrl()} />
          <MediaManager productId={product.id} media={product.media} canEdit={canEdit} />
        </div>
        <aside className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:self-start">
          <StatusActions
            productId={product.id}
            slug={product.slug}
            status={product.status}
            isDemo={product.isDemo}
            role={staff.role}
            publishIssues={issues}
          />
          <section aria-labelledby="historico-titulo">
            <h2 id="historico-titulo" className="mb-3 text-lg font-bold">
              Histórico
            </h2>
            <AuditList events={events} linkProducts={false} />
          </section>
        </aside>
      </div>
    </div>
  );
}

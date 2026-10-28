import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteUrl } from "@/config/site";
import { getAiStudioSnapshot } from "@/lib/admin/ai";
import { getAdminProduct, listAdminCategories, listAuditEvents } from "@/lib/admin/data";
import { isProductTab, readiness } from "@/lib/admin/readiness";
import { requireStaffPage } from "@/lib/auth/staff";
import { publishIssues } from "@/lib/validation/product";
import { AiStudio } from "@/components/admin/ai-studio";
import { AuditList } from "@/components/admin/audit-list";
import { MediaManager } from "@/components/admin/media-manager";
import { ProductEditor } from "@/components/admin/product-editor";
import { ProductThumb } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { ExternalIcon, EyeIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/produtos/[id]">) {
  const staff = await requireStaffPage();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [product, categories, events, studio] = await Promise.all([
    getAdminProduct(id),
    listAdminCategories(),
    listAuditEvents({ productId: id, limit: 15 }),
    getAiStudioSnapshot(id),
  ]);
  if (!product) notFound();

  // Editores trabalham em rascunho/revisão; publicados e arquivados são do admin (o banco garante o mesmo).
  const canEdit = staff.role === "admin" || product.status === "draft" || product.status === "review";
  const issues = publishIssues(product).map((i) => i.message);
  const initialTab = isProductTab(sp.aba) ? sp.aba : "fotos";

  return (
    <div>
      <Link href="/admin/produtos" className="link text-sm">
        ← Produtos
      </Link>
      <header className="mb-4 mt-3 flex items-center gap-3">
        <ProductThumb product={product} size="sm" />
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 text-xl font-bold leading-tight sm:text-3xl">{product.name}</h1>
          <p className="truncate text-sm text-muted">{product.category?.name ?? "Sem categoria"}</p>
        </div>
        {product.isDemo ? <Badge tone="demo">Demonstração</Badge> : null}
        <div className="flex gap-2">
          {/* No celular só o ícone, para o nome do produto caber. */}
          <Link href={`/admin/produtos/${product.id}/preview`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <EyeIcon className="h-4 w-4" /> <span className="sr-only sm:not-sr-only">Pré-visualizar</span>
          </Link>
          {product.status === "published" ? (
            <a href={`/produtos/${product.slug}`} target="_blank" rel="noopener" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <ExternalIcon className="h-4 w-4" /> <span className="sr-only sm:not-sr-only">Ver na loja</span>
            </a>
          ) : null}
        </div>
      </header>

      <div className="space-y-3 empty:hidden">
        {sp.criado ? (
          <Notice tone="success" role="status" title="Produto criado como rascunho">
            Comece pelas fotos tiradas no celular. Ele só aparece na loja depois de publicado.
          </Notice>
        ) : null}
        {sp.duplicado ? (
          <Notice tone="success" role="status" title="Cópia criada como rascunho">
            Revise o nome, o endereço e o SKU antes de publicar.
          </Notice>
        ) : null}
        {product.isDemo ? (
          <Notice tone="demo" title="Produto de demonstração">
            Os dados são ilustrativos e o banco impede a publicação. Substitua tudo por dados reais e converta.
          </Notice>
        ) : null}
      </div>

      <div className="mt-4">
        <ProductEditor
          product={product}
          categories={categories}
          canEdit={canEdit}
          siteUrl={siteUrl()}
          role={staff.role}
          initialTab={initialTab}
          readiness={readiness(product)}
          publishIssues={issues}
          photos={
            <>
              <AiStudio
                productId={product.id}
                productName={product.name}
                canEdit={canEdit}
                requires3d={product.category?.requires3d ?? false}
                hasGalleryPhoto={product.media.some((m) => m.type === "image" && !m.pendingReview)}
                aiMedia={product.media.filter((m) => m.aiGenerated).sort((a, b) => a.sortOrder - b.sortOrder)}
                copyEnabled={Boolean(process.env.OPENAI_API_KEY)}
                initial={studio}
              />
              <MediaManager productId={product.id} media={product.media} canEdit={canEdit} />
            </>
          }
          history={
            <section aria-label="Histórico" className="rounded-2xl border border-line bg-white p-4">
              <h2 className="mb-3 font-bold text-deep-fjord">Histórico</h2>
              <AuditList events={events} linkProducts={false} />
            </section>
          }
        />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { listAdminProducts } from "@/lib/admin/data";
import { requireStaffPage } from "@/lib/auth/staff";
import { formatPrice } from "@/lib/catalog/money";
import { fromPriceCents, primaryImage } from "@/lib/catalog/product-helpers";
import { PRODUCT_STATUSES, STATUS_LABELS, type ProductStatus } from "@/lib/catalog/types";
import { StatusBadge } from "@/components/admin/status-badge";
import { ProductImage } from "@/components/product/product-image";
import { Badge } from "@/components/ui/badge";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { controlClasses } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Produtos" };

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/produtos">) {
  await requireStaffPage();
  const params = await searchParams;
  const status = (PRODUCT_STATUSES as readonly string[]).includes(String(params.status))
    ? (params.status as ProductStatus)
    : null;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const products = await listAdminProducts({ status, q });

  const tabs: { label: string; value: ProductStatus | null }[] = [
    { label: "Todos", value: null },
    ...PRODUCT_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s })),
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold">Produtos</h1>
        <ButtonLink href="/admin/produtos/novo">Novo produto</ButtonLink>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Filtrar por status">
          <ul className="flex flex-wrap gap-2">
            {tabs.map((t) => {
              const active = t.value === status;
              const href = t.value ? `/admin/produtos?status=${t.value}` : "/admin/produtos";
              return (
                <li key={t.label}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className="inline-flex min-h-10 items-center rounded-full border border-line bg-white px-4 text-sm font-medium text-ink hover:border-deep-fjord aria-[current=page]:border-deep-fjord aria-[current=page]:bg-deep-fjord aria-[current=page]:text-white"
                  >
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <form action="/admin/produtos" method="get" role="search" className="flex gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label htmlFor="admin-q" className="sr-only">
            Buscar produtos
          </label>
          <input id="admin-q" name="q" type="search" defaultValue={q} placeholder="Nome, slug ou SKU" className={`${controlClasses} w-56`} />
          <button type="submit" className={buttonClasses({ variant: "secondary" })}>
            Buscar
          </button>
        </form>
      </div>

      {products.length ? (
        <div className="overflow-x-auto rounded-[1.25rem] border border-line bg-white" tabIndex={0} role="region" aria-label="Lista de produtos">
          <table className="w-full min-w-[44rem] text-left text-[0.9375rem]">
            <caption className="sr-only">Lista de produtos</caption>
            <thead className="bg-pale-blue text-deep-fjord">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Produto</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Preço</th>
                <th scope="col" className="px-4 py-3 font-semibold">Mídia</th>
                <th scope="col" className="px-4 py-3 font-semibold">Atualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((p) => {
                const price = fromPriceCents(p);
                return (
                  <tr key={p.id} className="hover:bg-cloud">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductImage media={primaryImage(p)} sizes="64px" className="w-16 shrink-0 rounded-lg" showIllustrativeBadge={false} />
                        <div className="min-w-0">
                          <Link href={`/admin/produtos/${p.id}`} className="font-semibold text-deep-fjord hover:underline">
                            {p.name}
                          </Link>
                          <p className="truncate text-sm text-muted">/{p.slug}</p>
                          {p.isDemo ? <Badge tone="demo" className="mt-1">Demonstração</Badge> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3">{price !== null ? formatPrice(price) : <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3 text-muted">{p.media.length}</td>
                    <td className="px-4 py-3 text-muted">{dateFormat.format(new Date(p.updatedAt))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={q || status ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
          action={<ButtonLink href="/admin/produtos/novo">Cadastrar produto</ButtonLink>}
        >
          {q || status ? "Tente outro filtro." : "Comece cadastrando o primeiro produto como rascunho."}
        </EmptyState>
      )}
    </div>
  );
}

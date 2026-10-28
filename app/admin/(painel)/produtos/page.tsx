import type { Metadata } from "next";
import Link from "next/link";
import { listAdminProducts } from "@/lib/admin/data";
import { missingLabel, pendingAiPhotos, readinessSummary } from "@/lib/admin/readiness";
import { requireStaffPage } from "@/lib/auth/staff";
import { formatPrice } from "@/lib/catalog/money";
import { fromPriceCents } from "@/lib/catalog/product-helpers";
import { normalizeText } from "@/lib/catalog/query";
import { PRODUCT_STATUSES, STATUS_LABELS, type ProductStatus } from "@/lib/catalog/types";
import { StatusBadge } from "@/components/admin/status-badge";
import { PageHeader, ProductThumb, ReadinessMeter } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ChevronRightIcon, SearchIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Produtos" };

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/produtos">) {
  await requireStaffPage();
  const params = await searchParams;
  const status = (PRODUCT_STATUSES as readonly string[]).includes(String(params.status))
    ? (params.status as ProductStatus)
    : null;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";

  // Uma leitura só: contagem por status e filtro em memória (catálogo pequeno).
  const all = await listAdminProducts();
  const term = normalizeText(q);
  const matchesQ = all.filter((p) => !term || normalizeText(`${p.name} ${p.slug} ${p.sku ?? ""} ${p.category?.name ?? ""}`).includes(term));
  const products = status ? matchesQ.filter((p) => p.status === status) : matchesQ;
  const countFor = (s: ProductStatus | null) => (s ? matchesQ.filter((p) => p.status === s).length : matchesQ.length);

  const href = (s: ProductStatus | null) => {
    const sp = new URLSearchParams();
    if (s) sp.set("status", s);
    if (q) sp.set("q", q);
    const qs = sp.toString();
    return qs ? `/admin/produtos?${qs}` : "/admin/produtos";
  };

  return (
    <div>
      <PageHeader
        title="Produtos"
        subtitle={`${all.length} produto(s) no catálogo`}
        actions={<ButtonLink href="/admin/produtos/novo">Novo produto</ButtonLink>}
      />

      <div className="mb-4 space-y-3">
        <form action="/admin/produtos" method="get" role="search" className="relative">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label htmlFor="admin-q" className="sr-only">
            Buscar produtos
          </label>
          <input
            id="admin-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Buscar por nome, categoria ou SKU"
            className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-4 text-base text-ink placeholder:text-muted"
          />
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        </form>
        <nav aria-label="Filtrar por status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-2">
            {[null, ...PRODUCT_STATUSES].map((s) => (
              <li key={s ?? "todos"} className="shrink-0">
                <Link
                  href={href(s)}
                  aria-current={s === status ? "page" : undefined}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-medium text-ink hover:border-deep-fjord aria-[current=page]:border-deep-fjord aria-[current=page]:bg-deep-fjord aria-[current=page]:text-white"
                >
                  {s ? STATUS_LABELS[s] : "Todos"}
                  <span className="text-xs opacity-70">{countFor(s)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {products.length ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {/* Cabeçalho só no computador; no celular cada linha vira um cartão. */}
          <div className="hidden grid-cols-[minmax(0,2.4fr)_8rem_8rem_minmax(0,1.6fr)_5rem_1.5rem] gap-4 border-b border-line bg-pale-blue px-4 py-3 text-sm font-semibold text-deep-fjord md:grid">
            <span>Produto</span>
            <span>Status</span>
            <span>Preço</span>
            <span>Pronto para vender</span>
            <span>Editado</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {products.map((p) => {
              const price = fromPriceCents(p);
              const r = readinessSummary(p);
              const pending = pendingAiPhotos(p);
              return (
                <li key={p.id}>
                  <Link
                    href={`/admin/produtos/${p.id}`}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-cloud md:grid-cols-[minmax(0,2.4fr)_8rem_8rem_minmax(0,1.6fr)_5rem_1.5rem] md:gap-4"
                  >
                    <span className="row-span-2 flex min-w-0 items-center gap-3 md:row-span-1">
                      <ProductThumb product={p} />
                      <span className="hidden min-w-0 md:block">
                        <span className="block truncate font-semibold text-deep-fjord">{p.name}</span>
                        <span className="block truncate text-sm text-muted">{p.category?.name ?? "Sem categoria"}</span>
                      </span>
                    </span>
                    {/* Celular: nome, status e preço ao lado da foto. */}
                    <span className="min-w-0 md:hidden">
                      <span className="block truncate font-semibold text-deep-fjord">{p.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                        <StatusBadge status={p.status} />
                        <span className="text-ink">{price !== null ? formatPrice(price) : "Sem preço"}</span>
                      </span>
                    </span>
                    <span className="hidden md:block">
                      <StatusBadge status={p.status} />
                      {p.isDemo ? <Badge tone="demo" className="ml-1">Demo</Badge> : null}
                    </span>
                    <span className="hidden text-ink md:block">{price !== null ? formatPrice(price) : <span className="text-muted">—</span>}</span>
                    <span className="col-start-2 min-w-0 text-sm md:col-start-auto">
                      {p.status === "published" ? (
                        <span className="font-medium text-success">Na loja</span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-x-2">
                          <ReadinessMeter done={r.done} total={r.total} />
                          <span className="truncate text-muted">{r.next ? missingLabel(r.next) : "Pronto para publicar"}</span>
                        </span>
                      )}
                      {pending ? <span className="block font-semibold text-[#8a4b0f]">{pending} foto(s) para conferir</span> : null}
                    </span>
                    <span className="hidden text-sm text-muted md:block">{dateFormat.format(new Date(p.updatedAt))}</span>
                    <ChevronRightIcon className="col-start-3 row-span-2 row-start-1 h-5 w-5 text-muted md:col-start-auto md:row-span-1 md:row-start-auto" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <EmptyState
          title={q || status ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
          action={<ButtonLink href="/admin/produtos/novo">Cadastrar produto</ButtonLink>}
        >
          {q || status ? "Tente outra busca ou outro filtro." : "Comece pelas fotos do celular: o painel cuida do resto."}
        </EmptyState>
      )}
    </div>
  );
}

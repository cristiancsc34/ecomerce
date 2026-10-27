import type { Metadata } from "next";
import Link from "next/link";
import { getDashboardStats, listAdminProducts, listAuditEvents } from "@/lib/admin/data";
import { requireStaffPage } from "@/lib/auth/staff";
import { STATUS_LABELS, type ProductStatus } from "@/lib/catalog/types";
import { AuditList } from "@/components/admin/audit-list";
import { StatusBadge } from "@/components/admin/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Visão geral" };

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const staff = await requireStaffPage();
  const [stats, recent, events, params] = await Promise.all([
    getDashboardStats(),
    listAdminProducts(),
    listAuditEvents({ limit: 8 }),
    searchParams,
  ]);
  const order: ProductStatus[] = ["published", "review", "draft", "archived"];

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Visão geral</h1>
          <p className="mt-1 text-muted">Catálogo e últimas alterações.</p>
        </div>
        <ButtonLink href="/admin/produtos/novo">Novo produto</ButtonLink>
      </header>

      {params.motivo === "sem-permissao" ? (
        <Notice tone="warning" role="alert" title="Sem permissão">
          Essa área é só para administradores.
        </Notice>
      ) : null}

      {stats.demo > 0 ? (
        <Notice tone="demo" title={`${stats.demo} produto(s) de demonstração`}>
          Eles servem para testar o painel e não podem ser publicados. Cadastre os produtos reais com fotos, preços e
          especificações verificados.
        </Notice>
      ) : null}

      <section aria-labelledby="resumo-titulo">
        <h2 id="resumo-titulo" className="sr-only">
          Resumo por status
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {order.map((s) => (
            <li key={s}>
              <Link
                href={`/admin/produtos?status=${s}`}
                className="block rounded-[1.25rem] border border-line bg-white p-5 hover:border-deep-fjord"
              >
                <span className="text-sm font-medium text-muted">{STATUS_LABELS[s]}</span>
                <span className="mt-1 block text-3xl font-bold text-deep-fjord">{stats.byStatus[s]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-10 xl:grid-cols-2">
        <section aria-labelledby="recentes-titulo" className="min-w-0">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="recentes-titulo" className="text-xl font-bold">
              Editados recentemente
            </h2>
            <Link href="/admin/produtos" className="link text-sm">
              Ver todos
            </Link>
          </div>
          {recent.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-white">
              {recent.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/produtos/${p.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-cloud">
                    <span className="min-w-0 truncate font-medium text-deep-fjord">{p.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {p.isDemo ? <span className="text-xs font-semibold text-muted">DEMO</span> : null}
                      <StatusBadge status={p.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Nenhum produto ainda.</p>
          )}
        </section>

        <section aria-labelledby="atividade-titulo" className="min-w-0">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="atividade-titulo" className="text-xl font-bold">
              Atividade
            </h2>
            <Link href="/admin/atividade" className="link text-sm">
              Ver histórico
            </Link>
          </div>
          <AuditList events={events} />
        </section>
      </div>

      {staff.role !== "admin" ? (
        <p className="text-sm text-muted">
          Você é editor: pode criar e editar rascunhos e enviá-los para revisão. Publicar e arquivar é com os
          administradores.
        </p>
      ) : null}
    </div>
  );
}

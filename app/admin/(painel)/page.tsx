import type { Metadata } from "next";
import Link from "next/link";
import { getAiWorkerOnline } from "@/lib/admin/ai";
import { listAdminProducts, listAuditEvents } from "@/lib/admin/data";
import { missingLabel, pendingAiPhotos, readinessSummary } from "@/lib/admin/readiness";
import { requireStaffPage } from "@/lib/auth/staff";
import { STATUS_LABELS, type Product, type ProductStatus } from "@/lib/catalog/types";
import { AuditList } from "@/components/admin/audit-list";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, PageHeader, ProductThumb } from "@/components/admin/ui";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { CameraIcon, CheckIcon, ChevronRightIcon, ExternalIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Início" };

type Todo = { product: Product; text: string; href: string; tone: "action" | "ready" | "review" };

/** "O que fazer agora": o próximo passo de cada produto, do mais urgente ao mais simples. */
function todos(products: Product[]): Todo[] {
  const list: Todo[] = [];
  for (const p of products) {
    if (p.isDemo || p.status === "archived") continue;
    const base = `/admin/produtos/${p.id}`;
    const pending = pendingAiPhotos(p);
    if (pending) {
      list.push({ product: p, tone: "review", text: `${pending} foto(s) de catálogo esperando a sua conferência`, href: `${base}?aba=fotos` });
    }
    if (p.status === "published") continue;
    const r = readinessSummary(p);
    if (r.next) {
      list.push({ product: p, tone: "action", text: r.next.hint ?? missingLabel(r.next), href: `${base}?aba=${r.next.tab}` });
    } else {
      list.push({ product: p, tone: "ready", text: "Tudo pronto: já pode publicar", href: base });
    }
  }
  const order = { review: 0, ready: 1, action: 2 };
  return list.sort((a, b) => order[a.tone] - order[b.tone]);
}

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  await requireStaffPage();
  const [products, events, workerOnline, params] = await Promise.all([
    listAdminProducts(),
    listAuditEvents({ limit: 6 }),
    getAiWorkerOnline(),
    searchParams,
  ]);
  const count = (s: ProductStatus) => products.filter((p) => p.status === s && !p.isDemo).length;
  const tasks = todos(products);
  const order: ProductStatus[] = ["published", "draft", "review", "archived"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Início"
        subtitle="O que precisa da sua atenção na loja."
        actions={
          <>
            <a href="/" target="_blank" rel="noopener" className={buttonClasses({ variant: "secondary" })}>
              <ExternalIcon className="h-4 w-4" /> Ver loja
            </a>
            <ButtonLink href="/admin/produtos/novo">Novo produto</ButtonLink>
          </>
        }
      />

      {params.motivo === "sem-permissao" ? (
        <Notice tone="warning" role="alert" title="Sem permissão">
          Essa área é só para administradores.
        </Notice>
      ) : null}

      <ul aria-label="Produtos por status" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {order.map((s) => (
          <li key={s}>
            <Link
              href={`/admin/produtos?status=${s}`}
              className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3 hover:border-deep-fjord"
            >
              <span className="text-sm font-medium text-muted">{STATUS_LABELS[s]}</span>
              <span className="text-2xl font-bold text-deep-fjord">{count(s)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card id="afazer" title="O que fazer agora" description="O próximo passo de cada produto. Toque para resolver.">
          {tasks.length ? (
            <ul className="-mx-2 divide-y divide-line">
              {tasks.map((t, i) => (
                <li key={`${t.product.id}-${i}`}>
                  <Link href={t.href} className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-cloud">
                    <ProductThumb product={t.product} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-deep-fjord">{t.product.name}</span>
                      <span
                        className={`block text-sm ${t.tone === "ready" ? "font-semibold text-success" : t.tone === "review" ? "font-semibold text-[#8a4b0f]" : "text-muted"}`}
                      >
                        {t.tone === "ready" ? <CheckIcon className="mr-1 inline h-4 w-4 align-[-3px]" /> : null}
                        {t.text}
                      </span>
                    </span>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 font-medium text-success">
              <CheckIcon className="h-5 w-5" /> Tudo em dia.
            </p>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Cadastrar com o celular">
            <Link href="/admin/produtos/novo" className="flex items-center gap-4 rounded-xl bg-pale-blue p-4 hover:bg-sky-mist">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-deep-fjord text-white">
                <CameraIcon className="h-6 w-6" />
              </span>
              <span className="text-sm text-ink">
                <strong className="block text-base text-deep-fjord">Novo produto</strong>
                Envie as fotos tiradas no celular: o fundo é limpo, as fotos de catálogo e o 3D são feitos pela IA.
              </span>
            </Link>
            <p className="mt-3 flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${workerOnline ? "bg-success" : "bg-line"}`} aria-hidden="true" />
              {workerOnline ? "IA de fotos e 3D pronta." : "IA de fotos e 3D ainda não configurada (as fotos ficam na fila)."}
            </p>
          </Card>

          <Card
            title="Atividade recente"
            actions={
              <Link href="/admin/atividade" className="link text-sm">
                Ver tudo
              </Link>
            }
          >
            <AuditList events={events} />
          </Card>
        </div>
      </div>

      {products.length ? (
        <Card
          title="Produtos"
          actions={
            <Link href="/admin/produtos" className="link text-sm">
              Ver todos
            </Link>
          }
        >
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products
              .filter((p) => !p.isDemo)
              .slice(0, 8)
              .map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/produtos/${p.id}`} className="block rounded-xl border border-line p-2 hover:border-deep-fjord">
                    <ProductThumb product={p} size="md" />
                    <span className="mt-2 block truncate text-sm font-semibold text-deep-fjord">{p.name}</span>
                    <span className="mt-1 block">
                      <StatusBadge status={p.status} />
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

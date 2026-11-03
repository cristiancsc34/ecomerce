import type { Metadata } from "next";
import Link from "next/link";
import { listOrders, type OrderSummary } from "@/lib/admin/orders";
import { requireStaffPage } from "@/lib/auth/staff";
import { formatPrice } from "@/lib/catalog/money";
import { formatDeliveryDate } from "@/lib/orders/messages";
import { DELIVERY_LABEL, isOpen } from "@/lib/orders/status";
import { OrderSourceBadge, OrderStatusBadge } from "@/components/admin/order-status-badge";
import { PageHeader } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { ChevronRightIcon, TruckIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Pedidos" };

const FILTERS = {
  abertos: { label: "Em andamento", match: (o: OrderSummary) => isOpen(o.status) },
  entregues: { label: "Entregues", match: (o: OrderSummary) => o.status === "entregue" },
  encerrados: { label: "Cancelados e devolvidos", match: (o: OrderSummary) => o.status === "cancelado" || o.status === "devolvido" },
  todos: { label: "Todos", match: () => true },
} as const;
type Filter = keyof typeof FILTERS;

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/pedidos">) {
  await requireStaffPage();
  const params = await searchParams;
  const filter: Filter = String(params.filtro) in FILTERS ? (String(params.filtro) as Filter) : "abertos";
  const all = await listOrders();
  const orders = all.filter(FILTERS[filter].match);

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle="Pedidos do site e do atendimento, do registro até a entrega, etapa por etapa."
        actions={<ButtonLink href="/admin/pedidos/novo">Novo pedido</ButtonLink>}
      />
      <nav aria-label="Filtrar pedidos" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {(Object.keys(FILTERS) as Filter[]).map((key) => (
            <li key={key} className="shrink-0">
              <Link
                href={key === "abertos" ? "/admin/pedidos" : `/admin/pedidos?filtro=${key}`}
                aria-current={key === filter ? "page" : undefined}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-medium text-ink hover:border-deep-fjord aria-[current=page]:border-deep-fjord aria-[current=page]:bg-deep-fjord aria-[current=page]:text-white"
              >
                {FILTERS[key].label}
                <span className="text-xs opacity-70">{all.filter(FILTERS[key].match).length}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {orders.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white" data-testid="lista-pedidos">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/pedidos/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cloud">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-deep-fjord">{o.code}</span>
                    <OrderStatusBadge status={o.status} />
                    <OrderSourceBadge source={o.source} />
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-ink">
                    {o.customerName} · {o.itemCount} {o.itemCount === 1 ? "item" : "itens"} · {formatPrice(o.totalCents)}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {DELIVERY_LABEL[o.deliveryMethod]}
                    {o.scheduledDate ? ` · entrega ${formatDeliveryDate(o.scheduledDate)}` : ""} · criado em{" "}
                    {dateFormat.format(new Date(o.createdAt))}
                  </span>
                </span>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<TruckIcon className="h-7 w-7" />}
          title={filter === "abertos" ? "Nenhum pedido em andamento" : "Nenhum pedido aqui"}
          action={<ButtonLink href="/admin/pedidos/novo">Registrar um pedido</ButtonLink>}
        >
          Fechou uma venda pelo WhatsApp ou telefone? Registre o pedido para acompanhar pagamento, preparação e entrega, e
          avisar o cliente a cada etapa.
        </EmptyState>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { brand } from "@/config/brand";
import { siteUrl } from "@/config/site";
import { getOrder, orderProductOptions } from "@/lib/admin/orders";
import { listOrderNotifications } from "@/lib/admin/shipping";
import { requireStaffPage } from "@/lib/auth/staff";
import { formatPrice } from "@/lib/catalog/money";
import { formatDeliveryDate, trackingLink } from "@/lib/orders/messages";
import { DELIVERY_LABEL, formatAddress, formatPhone, PAYMENT_LABEL, STATUS_LABEL } from "@/lib/orders/status";
import { OrderForm } from "@/components/admin/order-form";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { OrderSteps } from "@/components/admin/order-steps";
import { OrderNotificationsList } from "@/components/admin/order-notifications";
import { Card } from "@/components/admin/ui";
import { ExternalIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Pedido" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function OrderPage({ params }: PageProps<"/admin/pedidos/[id]">) {
  await requireStaffPage();
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();
  const [products, notifications] = await Promise.all([orderProductOptions(), listOrderNotifications(order.id)]);
  const link = trackingLink(siteUrl(), order.code, order.publicToken);
  const lastNote = [...order.events].reverse().find((e) => e.status === order.status)?.publicNote ?? null;
  const itemsLocked = !["recebido", "pago", "em_preparacao"].includes(order.status);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/pedidos" className="link text-sm">
        ← Pedidos
      </Link>
      <header className="mb-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{order.code}</h1>
        <OrderStatusBadge status={order.status} />
        <p className="w-full text-sm text-muted">
          {order.customerName} · {formatPrice(order.totalCents)} · criado em {dateTime.format(new Date(order.createdAt))}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <OrderSteps
            orderId={order.id}
            status={order.status}
            deliveryMethod={order.deliveryMethod}
            customerPhone={order.customerPhone}
            whatsappOptIn={order.whatsappOptIn}
            canEdit
            delivery={{
              carrier: order.carrier ?? "",
              trackingCode: order.trackingCode ?? "",
              trackingUrl: order.trackingUrl ?? "",
              scheduledDate: order.scheduledDate ?? "",
              scheduledWindow: order.scheduledWindow ?? "",
            }}
            message={{
              brandName: brand.name,
              code: order.code,
              customerName: order.customerName,
              status: order.status,
              deliveryMethod: order.deliveryMethod,
              trackingLink: link,
              items: order.items,
              totalCents: order.totalCents,
              carrier: order.carrier,
              trackingCode: order.trackingCode,
              trackingUrl: order.trackingUrl,
              scheduledDate: order.scheduledDate,
              scheduledWindow: order.scheduledWindow,
              publicNote: lastNote,
            }}
          />

          <Card title="Itens">
            <ul className="divide-y divide-line">
              {order.items.map((i, index) => (
                <li key={index} className="flex justify-between gap-4 py-2 text-sm">
                  <span>
                    {i.quantity}× {i.name}
                    {i.variantName ? <span className="text-muted"> · {i.variantName}</span> : null}
                  </span>
                  <span className="shrink-0">{formatPrice(i.unitPriceCents * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Frete</dt>
                <dd>{order.shippingCents === null ? "A combinar" : formatPrice(order.shippingCents)}</dd>
              </div>
              {order.discountCents ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Desconto</dt>
                  <dd>− {formatPrice(order.discountCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 text-base font-bold">
                <dt>Total</dt>
                <dd>{formatPrice(order.totalCents)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Pagamento</dt>
                <dd>
                  {order.paymentMethod ? PAYMENT_LABEL[order.paymentMethod] : "Forma não definida"}
                  {order.paidAt ? ` · confirmado em ${dateTime.format(new Date(order.paidAt))}` : " · aguardando"}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Linha do tempo">
            <ol className="space-y-3" data-testid="linha-do-tempo">
              {[...order.events].reverse().map((e) => (
                <li key={e.id} className="border-l-2 border-sky-mist pl-3 text-sm">
                  <p className="font-semibold text-deep-fjord">{STATUS_LABEL[e.status]}</p>
                  <p className="text-xs text-muted">{dateTime.format(new Date(e.createdAt))}</p>
                  {e.publicNote ? <p className="mt-1">Recado ao cliente: {e.publicNote}</p> : null}
                  {e.internalNote ? <p className="mt-1 text-muted">Nota interna: {e.internalNote}</p> : null}
                </li>
              ))}
            </ol>
          </Card>

          <details className="group rounded-2xl border border-line bg-white">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold sm:px-6">Editar dados do pedido</summary>
            <div className="border-t border-line p-2 sm:p-4">
              <OrderForm
                products={products}
                orderId={order.id}
                itemsLocked={itemsLocked}
                initial={{
                  customerName: order.customerName,
                  customerPhone: order.customerPhone,
                  customerEmail: order.customerEmail,
                  whatsappOptIn: order.whatsappOptIn,
                  address: order.address,
                  deliveryMethod: order.deliveryMethod,
                  deliveryNotes: order.deliveryNotes,
                  assembly: order.assembly,
                  shippingCents: order.shippingCents,
                  discountCents: order.discountCents,
                  paymentMethod: order.paymentMethod,
                  internalNotes: order.internalNotes,
                  items: order.items,
                }}
              />
            </div>
          </details>
        </div>

        <aside className="min-w-0 space-y-4">
          <Card title="Cliente">
            <p className="font-semibold">{order.customerName}</p>
            {order.customerPhone ? <p className="text-sm">{formatPhone(order.customerPhone)}</p> : null}
            {order.customerEmail ? <p className="break-all text-sm">{order.customerEmail}</p> : null}
            <p className="mt-1 text-xs text-muted">{order.whatsappOptIn ? "Aceita avisos pelo WhatsApp" : "Não marcou avisos pelo WhatsApp"}</p>
          </Card>
          <Card title="Entrega">
            <p className="text-sm font-semibold">{DELIVERY_LABEL[order.deliveryMethod]}</p>
            {order.deliveryMethod !== "retirada" ? <p className="mt-1 whitespace-pre-line text-sm">{formatAddress(order.address)}</p> : null}
            {order.address.referencia ? <p className="mt-1 text-sm text-muted">Referência: {order.address.referencia}</p> : null}
            {order.scheduledDate ? (
              <p className="mt-2 text-sm">
                Agendada: <strong>{formatDeliveryDate(order.scheduledDate)}</strong>
                {order.scheduledWindow ? `, ${order.scheduledWindow}` : ""}
              </p>
            ) : null}
            {order.carrier ? <p className="mt-2 text-sm">Transportadora: {order.carrier}</p> : null}
            {order.trackingCode ? <p className="text-sm">Rastreio: {order.trackingCode}</p> : null}
            {order.trackingUrl ? (
              <a href={order.trackingUrl} target="_blank" rel="noopener" className="link text-sm">
                Abrir rastreio
              </a>
            ) : null}
            {order.deliveryNotes ? <p className="mt-2 rounded-lg bg-cloud p-2 text-sm">Acesso: {order.deliveryNotes}</p> : null}
            {order.assembly ? <p className="mt-2 text-sm font-semibold">Inclui montagem</p> : null}
          </Card>
          <Card title="Acompanhamento do cliente" description="O link que vai nas mensagens. Quem tem o link vê as etapas, sem o endereço completo.">
            <a href={link} target="_blank" rel="noopener" className="link inline-flex items-center gap-1 break-all text-sm">
              Abrir a página do cliente <ExternalIcon className="h-4 w-4 shrink-0" />
            </a>
          </Card>
          <OrderNotificationsList notifications={notifications} />
          {order.internalNotes ? (
            <Card title="Observações internas">
              <p className="whitespace-pre-line text-sm">{order.internalNotes}</p>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

import Link from "next/link";
import { brand, whatsappHref } from "@/config/brand";
import { formatPrice } from "@/lib/catalog/money";
import { formatDeliveryDate } from "@/lib/orders/messages";
import { CUSTOMER_STATUS_TEXT, customerSteps, DELIVERY_LABEL, STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import type { OrderTracking } from "@/lib/orders/tracking";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { CheckIcon, TruckIcon } from "@/components/ui/icons";

const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** O pedido como o cliente vê: etapas, entrega, histórico, itens e ajuda. */
export function OrderView({ order }: { order: OrderTracking }) {
  const steps = customerSteps(order.deliveryMethod);
  const off = order.status === "cancelado" || order.status === "devolucao_solicitada" || order.status === "devolvido";
  const reached = new Set<OrderStatus>(order.events.map((e) => e.status));
  const currentIndex = steps.indexOf(order.status);
  const whatsapp = brand.contact.whatsapp ? whatsappHref(brand.contact.whatsapp) : null;
  const place = [order.place.bairro, [order.place.cidade, order.place.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wider text-air-blue-ink">Pedido {order.code}</p>
          <h1 className="mt-1 text-3xl font-bold">{STATUS_LABEL[order.status]}</h1>
          <p className="mt-2 max-w-prose text-ink">
            {order.customerFirstName ? `${order.customerFirstName}, ` : ""}
            {CUSTOMER_STATUS_TEXT[order.status].charAt(0).toLowerCase() + CUSTOMER_STATUS_TEXT[order.status].slice(1)}
          </p>
        </header>

        {off ? null : (
          <ol aria-label="Etapas do pedido" className="rounded-2xl border border-line bg-white p-4 sm:p-6" data-testid="etapas-pedido">
            {steps.map((step, index) => {
              const done = reached.has(step) || index < currentIndex;
              const current = step === order.status;
              return (
                <li key={step} className="relative flex gap-3 pb-5 last:pb-0" aria-current={current ? "step" : undefined}>
                  {index < steps.length - 1 ? (
                    <span aria-hidden="true" className={`absolute left-[0.9375rem] top-8 h-[calc(100%-2rem)] w-0.5 ${done && !current ? "bg-success" : "bg-line"}`} />
                  ) : null}
                  <span
                    className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                      current ? "border-air-blue bg-pale-blue text-air-blue-ink" : done ? "border-success bg-success text-white" : "border-line bg-white text-muted"
                    }`}
                  >
                    {done && !current ? <CheckIcon className="h-4 w-4" /> : current ? <TruckIcon className="h-4 w-4" /> : <span className="text-xs">{index + 1}</span>}
                  </span>
                  <span className="min-w-0 pt-1">
                    <span className={`block font-semibold ${current ? "text-deep-fjord" : done ? "text-ink" : "text-muted"}`}>{STATUS_LABEL[step]}</span>
                    {current ? <span className="block text-sm text-muted">Etapa atual</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <section aria-labelledby="entrega-titulo" className="rounded-2xl border border-line bg-white p-4 sm:p-6">
          <h2 id="entrega-titulo" className="text-lg font-bold">
            Entrega
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-muted">Forma</dt>
              <dd className="font-semibold">{DELIVERY_LABEL[order.deliveryMethod]}</dd>
            </div>
            {place && order.deliveryMethod !== "retirada" ? (
              <div>
                <dt className="text-muted">Endereço</dt>
                <dd>{place}</dd>
              </div>
            ) : null}
            {order.scheduledDate ? (
              <div>
                <dt className="text-muted">Data combinada</dt>
                <dd className="font-semibold">
                  {formatDeliveryDate(order.scheduledDate)}
                  {order.scheduledWindow ? `, ${order.scheduledWindow}` : ""}
                </dd>
              </div>
            ) : null}
            {order.carrier ? (
              <div>
                <dt className="text-muted">Transportadora</dt>
                <dd>
                  {order.carrier}
                  {order.trackingCode ? ` · código ${order.trackingCode}` : ""}
                </dd>
              </div>
            ) : null}
            {order.assembly ? (
              <div>
                <dt className="text-muted">Montagem</dt>
                <dd>Incluída</dd>
              </div>
            ) : null}
          </dl>
          {order.trackingUrl ? (
            <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", className: "mt-4" })}>
              Rastrear na transportadora
            </a>
          ) : null}
          {order.deliveryMethod !== "retirada" && !off && order.status !== "entregue" ? (
            <div className="mt-4 rounded-xl bg-cloud p-3 text-sm">
              <p className="font-semibold">No dia da entrega</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>Deixe alguém maior de idade no endereço para receber.</li>
                <li>Confira o produto antes de assinar. Se houver avaria, anote no comprovante e fotografe.</li>
                <li>Móvel grande: confira se passa pela porta, escada ou elevador.</li>
              </ul>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="historico-titulo" className="rounded-2xl border border-line bg-white p-4 sm:p-6">
          <h2 id="historico-titulo" className="text-lg font-bold">
            Histórico
          </h2>
          <ol className="mt-3 space-y-3">
            {[...order.events].reverse().map((e, i) => (
              <li key={`${e.at}-${i}`} className="border-l-2 border-sky-mist pl-3 text-sm">
                <p className="font-semibold">{STATUS_LABEL[e.status]}</p>
                <p className="text-xs text-muted">{dateTime.format(new Date(e.at))}</p>
                {e.note ? <p className="mt-1">{e.note}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="min-w-0 space-y-4">
        <section aria-labelledby="itens-titulo" className="rounded-2xl border border-line bg-white p-4">
          <h2 id="itens-titulo" className="font-bold">
            Itens
          </h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {order.items.map((i, index) => (
              <li key={index} className="flex justify-between gap-3 py-2">
                <span>
                  {i.quantity}× {i.name}
                  {i.variantName ? <span className="text-muted"> · {i.variantName}</span> : null}
                </span>
                <span className="shrink-0">{formatPrice(i.unitPriceCents * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Frete</dt>
              <dd>{order.shippingCents === null ? "A combinar" : order.shippingCents === 0 ? "Sem custo" : formatPrice(order.shippingCents)}</dd>
            </div>
            {order.discountCents ? (
              <div className="flex justify-between">
                <dt className="text-muted">Desconto</dt>
                <dd>− {formatPrice(order.discountCents)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold">
              <dt>Total</dt>
              <dd>{formatPrice(order.totalCents)}</dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="ajuda-pedido" className="rounded-2xl border border-line bg-white p-4 text-sm">
          <h2 id="ajuda-pedido" className="font-bold">
            Precisa de ajuda?
          </h2>
          <p className="mt-1 text-muted">Fale com a {brand.name} informando o número {order.code}.</p>
          <div className="mt-3 flex flex-col gap-2">
            {whatsapp ? (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClasses()}>
                Falar no WhatsApp
              </a>
            ) : (
              <ButtonLink href="/atendimento">Ver canais de atendimento</ButtonLink>
            )}
            <Link href="/politicas/trocas-e-devolucoes" className="link">
              Trocas e devoluções
            </Link>
          </div>
        </section>
      </aside>
    </div>
  );
}

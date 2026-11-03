import Link from "next/link";
import { brand, whatsappHref } from "@/config/brand";
import { siteUrl } from "@/config/site";
import { formatPrice } from "@/lib/catalog/money";
import { formatDeliveryDate, trackingLink } from "@/lib/orders/messages";
import {
  CUSTOMER_STATUS_TEXT,
  customerSteps,
  DELIVERY_LABEL,
  STATUS_LABEL,
  type DeliveryMethod,
  type OrderStatus,
} from "@/lib/orders/status";
import type { OrderTracking } from "@/lib/orders/tracking";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { ChatIcon, CheckIcon, ClockIcon, TruckIcon } from "@/components/ui/icons";
import { CopyOrderLink } from "@/components/orders/copy-order-link";

const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** O que acontece em cada etapa que ainda não chegou (só o processo; nenhum prazo). */
function upcomingText(step: OrderStatus, method: DeliveryMethod): string | null {
  switch (step) {
    case "pago":
      return "A loja confirma o pagamento com você.";
    case "em_preparacao":
      return "Separamos e embalamos o seu pedido.";
    case "enviado":
      return method === "transportadora"
        ? "O pedido vai para a transportadora. O rastreio aparece nesta página."
        : "Combinamos com você a data e o período da entrega.";
    case "saiu_para_entrega":
      return "No dia combinado, o pedido sai para entrega.";
    case "entregue":
      return method === "retirada" ? "Você retira o pedido na loja." : "O pedido chega no endereço combinado.";
    default:
      return null;
  }
}

/** Link do WhatsApp da loja com a mensagem pronta (ou null quando a loja ainda não tem WhatsApp configurado). */
function storeWhatsapp(text: string): string | null {
  const base = brand.contact.whatsapp ? whatsappHref(brand.contact.whatsapp) : null;
  return base ? `${base}?text=${encodeURIComponent(text)}` : null;
}

/**
 * O pedido como o cliente vê: aviso de pedido enviado (logo após a compra no site), etapas com o que acontece em cada
 * uma, entrega prevista (só a data que a loja agendou), histórico, itens e ajuda.
 */
export function OrderView({ order, token, isNew = false }: { order: OrderTracking; token: string; isNew?: boolean }) {
  const steps = customerSteps(order.deliveryMethod);
  const off = order.status === "cancelado" || order.status === "devolucao_solicitada" || order.status === "devolvido";
  const finished = off || order.status === "entregue";
  const reached = new Map<OrderStatus, string>();
  // Os eventos vêm em ordem; se uma etapa se repetiu (ex.: entrega reagendada), vale a última vez.
  for (const e of order.events) reached.set(e.status, e.at);
  const currentIndex = steps.indexOf(order.status);
  const place = [order.place.bairro, [order.place.cidade, order.place.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  const pickup = order.deliveryMethod === "retirada";
  // Logo após a compra, o título da página é "Pedido enviado!"; a etapa vira subtítulo.
  const StatusHeading = isNew ? "h2" : "h1";

  const path = `/pedido/${encodeURIComponent(order.code)}?t=${token}`;
  const link = trackingLink(siteUrl(), order.code, token);
  const confirmHref = storeWhatsapp(`Olá! Acabei de fazer o pedido ${order.code} pelo site.\n${link}`);
  const changeHref = storeWhatsapp(`Olá! Preciso mudar algo no pedido ${order.code}.\n${link}`);
  const helpHref = storeWhatsapp(`Olá! Tenho uma dúvida sobre o pedido ${order.code}.\n${link}`);
  const when = order.scheduledDate
    ? `${formatDeliveryDate(order.scheduledDate)}${order.scheduledWindow ? `, ${order.scheduledWindow}` : ""}`
    : null;

  return (
    <div className="mt-4 space-y-6">
      {isNew ? (
        <section
          aria-labelledby="pedido-enviado"
          className="rounded-2xl border border-[#BFDCCB] bg-[#E3F2EA] p-4 sm:p-6"
          data-testid="pedido-enviado"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success text-white" aria-hidden="true">
              <CheckIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 id="pedido-enviado" className="text-2xl font-bold text-deep-fjord sm:text-3xl">
                Pedido enviado!
              </h1>
              <p className="mt-1 text-ink">
                O número do seu pedido é <strong className="whitespace-nowrap">{order.code}</strong>.
              </p>
            </div>
          </div>

          <h3 className="mt-5 font-semibold">O que acontece agora</h3>
          <ol className="mt-2 space-y-2 text-sm">
            {[
              "A loja fala com você pelo WhatsApp para confirmar o pagamento e o frete.",
              "Preparamos o seu pedido.",
              pickup ? "Combinamos a retirada com você." : "Agendamos a entrega com você.",
            ].map((text, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-deep-fjord" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="pt-0.5">
                  <span className="sr-only">{i + 1}. </span>
                  {text}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
            {confirmHref ? (
              <a href={confirmHref} target="_blank" rel="noopener noreferrer" className={buttonClasses()}>
                <ChatIcon className="h-5 w-5" /> Confirmar pelo WhatsApp
              </a>
            ) : (
              <ButtonLink href="/atendimento">Ver canais de atendimento</ButtonLink>
            )}
            <CopyOrderLink path={path} />
          </div>
          <p className="mt-3 text-sm text-ink">
            <strong>Guarde o link desta página:</strong> é por ele que você acompanha o pedido. Você também pode consultar
            com o número do pedido e o celular em “Acompanhar pedido”, no rodapé da loja.
          </p>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <header>
            <p className="text-sm font-semibold uppercase tracking-wider text-air-blue-ink">Pedido {order.code}</p>
            <StatusHeading className="mt-1 text-3xl font-bold">{STATUS_LABEL[order.status]}</StatusHeading>
            <p className="mt-2 max-w-prose text-ink">
              {off
                ? `${order.customerFirstName ? `${order.customerFirstName}, ` : ""}${
                    order.customerFirstName
                      ? CUSTOMER_STATUS_TEXT[order.status].charAt(0).toLowerCase() + CUSTOMER_STATUS_TEXT[order.status].slice(1)
                      : CUSTOMER_STATUS_TEXT[order.status]
                  }`
                : `${order.customerFirstName ? `Olá, ${order.customerFirstName}! ` : ""}Veja abaixo em que etapa está o seu pedido e o que acontece em seguida.`}
            </p>
          </header>

          {when && !finished ? (
            <div className="flex items-center gap-3 rounded-2xl border border-sky-mist bg-pale-blue p-4" data-testid="entrega-prevista">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-deep-fjord text-white" aria-hidden="true">
                <ClockIcon className="h-5 w-5" />
              </span>
              <p className="min-w-0">
                <span className="block text-sm text-muted">{pickup ? "Retirada prevista" : "Entrega prevista"}</span>
                <span className="block text-lg font-bold text-deep-fjord first-letter:uppercase">{when}</span>
              </p>
            </div>
          ) : null}

          {off ? null : (
            <ol aria-label="Etapas do pedido" className="rounded-2xl border border-line bg-white p-4 sm:p-6" data-testid="etapas-pedido">
              {steps.map((step, index) => {
                const done = reached.has(step) || index < currentIndex;
                const current = step === order.status;
                const at = reached.get(step);
                const upcoming = !done && !current ? upcomingText(step, order.deliveryMethod) : null;
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
                      <span className={`block font-semibold ${current ? "text-deep-fjord" : done ? "text-ink" : "text-muted"}`}>
                        {STATUS_LABEL[step]}
                        {done && !current ? <span className="sr-only"> (concluída)</span> : null}
                      </span>
                      {current ? (
                        <span className="mt-1 block rounded-xl bg-pale-blue px-3 py-2 text-sm text-ink">
                          <span className="block text-xs font-semibold uppercase tracking-wider text-air-blue-ink">Agora</span>
                          {CUSTOMER_STATUS_TEXT[step]}
                        </span>
                      ) : null}
                      {done && !current && at ? <span className="block text-xs text-muted">{dateTime.format(new Date(at))}</span> : null}
                      {upcoming ? <span className="block text-sm text-muted">{upcoming}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          <section aria-labelledby="entrega-titulo" className="rounded-2xl border border-line bg-white p-4 sm:p-6">
            <h2 id="entrega-titulo" className="text-lg font-bold">
              {pickup ? "Retirada" : "Entrega"}
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-muted">Forma</dt>
                <dd className="font-semibold">{DELIVERY_LABEL[order.deliveryMethod]}</dd>
              </div>
              {place && !pickup ? (
                <div>
                  <dt className="text-muted">Endereço</dt>
                  <dd>{place}</dd>
                </div>
              ) : null}
              {when && finished ? (
                <div>
                  <dt className="text-muted">Data combinada</dt>
                  <dd className="font-semibold first-letter:uppercase">{when}</dd>
                </div>
              ) : !when && !finished && order.deliveryMethod !== "transportadora" ? (
                <div>
                  <dt className="text-muted">Data</dt>
                  <dd>{pickup ? "A loja combina o dia da retirada com você." : "A loja combina a data da entrega com você."}</dd>
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
            {!pickup && !finished ? (
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

          {!finished ? (
            <section aria-labelledby="mudar-titulo" className="rounded-2xl border border-line bg-white p-4 sm:p-6" data-testid="mudar-pedido">
              <h2 id="mudar-titulo" className="text-lg font-bold">
                Precisa mudar algo?
              </h2>
              <p className="mt-1 text-sm text-ink">
                {`Para ${pickup ? "mudar o dia da retirada" : "reagendar a entrega, trocar o endereço"} ou corrigir algum dado, fale com a ${brand.name}${
                  changeHref ? " pelo WhatsApp" : ""
                } informando o número `}
                <strong className="whitespace-nowrap">{order.code}</strong>.
              </p>
              <div className="mt-3">
                {changeHref ? (
                  <a href={changeHref} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary" })}>
                    <ChatIcon className="h-5 w-5" /> Pedir mudança no WhatsApp
                  </a>
                ) : (
                  <ButtonLink href="/atendimento" variant="secondary">
                    Ver canais de atendimento
                  </ButtonLink>
                )}
              </div>
            </section>
          ) : null}

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
            {order.shippingCents === null ? <p className="mt-2 text-xs text-muted">O total ainda não inclui o frete, que a loja confirma com você.</p> : null}
          </section>
          <section aria-labelledby="ajuda-pedido" className="rounded-2xl border border-line bg-white p-4 text-sm">
            <h2 id="ajuda-pedido" className="font-bold">
              Precisa de ajuda?
            </h2>
            <p className="mt-1 text-muted">Fale com a {brand.name} informando o número {order.code}.</p>
            <div className="mt-3 flex flex-col gap-2">
              {helpHref ? (
                <a href={helpHref} target="_blank" rel="noopener noreferrer" className={buttonClasses()}>
                  Falar no WhatsApp
                </a>
              ) : (
                <ButtonLink href="/atendimento">Ver canais de atendimento</ButtonLink>
              )}
              {!isNew ? <CopyOrderLink path={path} /> : null}
              <Link href="/politicas/trocas-e-devolucoes" className="link">
                Trocas e devoluções
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

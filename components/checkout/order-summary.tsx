import Image from "next/image";
import type { ReactNode } from "react";
import type { CartQuote } from "@/lib/cart/types";
import { formatPrice } from "@/lib/catalog/money";
import { ChevronDownIcon } from "@/components/ui/icons";

/** Frete escolhido: forma de entrega (valor null = a combinar), "retirada" (sem custo) ou null (ainda sem escolha). */
export type SummaryShipping = { label: string; cents: number | null } | "retirada" | null;

/** Contas do resumo (só exibição): os valores vêm da cotação do servidor e da forma de entrega escolhida. */
function summaryTotals(quote: CartQuote, shipping: SummaryShipping) {
  const count = quote.lines.reduce((sum, l) => sum + l.quantity, 0);
  const shippingCents = shipping === "retirada" ? 0 : (shipping?.cents ?? null);
  const complete = shippingCents !== null;
  const shippingText =
    shipping === "retirada" ? "Retirada na loja (sem custo)" : shippingCents === null ? "A combinar" : shippingCents === 0 ? "Grátis" : formatPrice(shippingCents);
  return { count, complete, shippingText, totalCents: quote.subtotalCents + (shippingCents ?? 0) };
}

const itemsLabel = (count: number) => `${count} ${count === 1 ? "item" : "itens"}`;

/** Lista de itens e valores do resumo; usada no resumo lateral e no resumo recolhível do celular. */
function SummaryLines({ quote, shipping }: { quote: CartQuote; shipping: SummaryShipping }) {
  const { count, complete, shippingText, totalCents } = summaryTotals(quote, shipping);
  return (
    <>
      <ul className="divide-y divide-line" aria-label={itemsLabel(count)}>
        {quote.lines.map((line) => (
          <li key={`${line.productId}:${line.variantId}`} className="flex gap-3 py-3 first:pt-0">
            <div className="relative aspect-square w-14 shrink-0 self-start overflow-hidden rounded-md bg-pale-blue">
              {line.imageUrl ? (
                <Image
                  src={line.imageUrl}
                  alt={line.imageAlt}
                  fill
                  sizes="56px"
                  unoptimized={line.imageUrl.endsWith(".svg")}
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold break-words text-ink">{line.name}</p>
              {line.variantName ? <p className="text-muted">{line.variantName}</p> : null}
              <p className="text-muted">
                {line.quantity} × {formatPrice(line.unitPriceCents)}
              </p>
            </div>
            <p className="shrink-0 text-sm font-bold text-air-blue-ink">{formatPrice(line.lineTotalCents)}</p>
          </li>
        ))}
      </ul>
      <dl className="space-y-2 border-t border-line pt-3 text-[0.9375rem]">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Subtotal</dt>
          <dd className="font-semibold text-ink">{formatPrice(quote.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Frete</dt>
          <dd className="text-right text-ink">
            {shippingText}
            {shipping && shipping !== "retirada" ? <span className="block text-xs text-muted">{shipping.label}</span> : null}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-line pt-2">
          <dt className="font-semibold text-ink">{complete ? "Total" : "Total parcial"}</dt>
          <dd className="text-lg font-bold text-air-blue-ink">{formatPrice(totalCents)}</dd>
        </div>
      </dl>
    </>
  );
}

/**
 * Resumo do pedido com os valores recalculados pelo servidor. O frete vem da forma de entrega escolhida (cadastrada
 * pelo dono); sem escolha ou sem valor cadastrado, fica "a combinar" e o total é parcial.
 */
export function OrderSummary({
  quote,
  shipping = null,
  children,
}: {
  quote: CartQuote;
  shipping?: SummaryShipping;
  children?: ReactNode;
}) {
  const { complete } = summaryTotals(quote, shipping);
  return (
    <div className="space-y-4 rounded-lg bg-white p-4 shadow-[var(--shadow-soft)] sm:p-5">
      <h2 id="resumo-titulo" className="text-lg font-bold">
        Resumo do pedido
      </h2>
      <SummaryLines quote={quote} shipping={shipping} />
      <p className="text-xs text-muted">
        {complete
          ? "Valores conferidos pela loja agora. O frete é recalculado no servidor ao enviar o pedido."
          : "Valores conferidos pela loja agora. O total parcial ainda não inclui o frete, que é combinado com você pelo WhatsApp."}
      </p>
      {children}
    </div>
  );
}

/**
 * Celular: resumo recolhível no topo da finalização, para conferir itens e total sem rolar até o fim do formulário.
 * Abre e fecha pelo teclado (Enter/Espaço) por ser um <details> nativo. Some no desktop, onde o resumo lateral fica fixo.
 */
export function MobileOrderSummary({ quote, shipping = null }: { quote: CartQuote; shipping?: SummaryShipping }) {
  const { count, complete, totalCents } = summaryTotals(quote, shipping);
  return (
    <details className="group rounded-lg bg-white p-4 lg:hidden">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-[0.9375rem] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          Resumo do pedido · {itemsLabel(count)} · {complete ? "Total" : "Total parcial"}{" "}
          <span className="whitespace-nowrap text-air-blue-ink">{formatPrice(totalCents)}</span>
        </span>
        <ChevronDownIcon className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-4">
        <SummaryLines quote={quote} shipping={shipping} />
      </div>
    </details>
  );
}

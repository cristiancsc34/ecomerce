import Image from "next/image";
import type { ReactNode } from "react";
import type { CartQuote } from "@/lib/cart/types";
import { formatPrice } from "@/lib/catalog/money";

/** Resumo do pedido com os valores recalculados pelo servidor. Frete sempre “a combinar”. */
export function OrderSummary({ quote, children }: { quote: CartQuote; children?: ReactNode }) {
  const count = quote.lines.reduce((sum, l) => sum + l.quantity, 0);
  return (
    <div className="space-y-4 rounded-lg bg-white p-4 shadow-[var(--shadow-soft)] sm:p-5">
      <h2 id="resumo-titulo" className="text-lg font-bold">
        Resumo do pedido
      </h2>
      <ul className="divide-y divide-line" aria-label={`${count} ${count === 1 ? "item" : "itens"}`}>
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
          <dd className="text-right text-ink">A combinar</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-line pt-2">
          <dt className="font-semibold text-ink">Total parcial</dt>
          <dd className="text-lg font-bold text-air-blue-ink">{formatPrice(quote.subtotalCents)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted">
        Valores conferidos pela loja agora. O total parcial ainda não inclui o frete, que é combinado com você pelo WhatsApp.
      </p>
      {children}
    </div>
  );
}

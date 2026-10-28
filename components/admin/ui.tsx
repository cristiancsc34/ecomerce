import type { ReactNode } from "react";
import { primaryImage } from "@/lib/catalog/product-helpers";
import type { Product } from "@/lib/catalog/types";
import { ProductImage } from "@/components/product/product-image";

/** Peças visuais comuns do painel (cabeçalho de página, cartão, miniatura, medidor). */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  id,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={title && id ? `${id}-titulo` : undefined} className={`rounded-2xl border border-line bg-white p-4 sm:p-6 ${className}`}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id={id ? `${id}-titulo` : undefined} className="text-lg font-bold">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ProductThumb({ product, size = "md" }: { product: Product; size?: "sm" | "md" }) {
  const w = size === "sm" ? "w-12" : "w-16";
  return (
    <ProductImage
      media={primaryImage(product)}
      sizes="64px"
      aspect="aspect-square"
      className={`${w} shrink-0 rounded-lg`}
      showIllustrativeBadge={false}
    />
  );
}

/** Barrinha "4 de 6 prontos". */
export function ReadinessMeter({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const complete = done === total;
  return (
    <span className="inline-flex items-center gap-2" title={`${done} de ${total} itens prontos`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <span className={`block h-full rounded-full ${complete ? "bg-success" : "bg-air-blue"}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`text-xs font-semibold ${complete ? "text-success" : "text-muted"}`}>
        {done}/{total}
      </span>
    </span>
  );
}

import Link from "next/link";
import { DELIVERY_STEPS } from "@/content/cidades";
import { SECTIONS } from "@/lib/catalog/sections";

/** Bloco branco das páginas de entrega (mesmo estilo das páginas de produto e categoria). */
export function LocalBlock({ id, title, children, className = "" }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`bg-white px-4 py-5 sm:rounded-lg sm:px-6 ${className}`}>
      <h2 id={id} className="mb-3 text-base font-bold uppercase tracking-wide text-deep-fjord">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Passo a passo da entrega (o mesmo em todas as cidades atendidas). */
export function DeliverySteps({ id = "como-funciona-titulo" }: { id?: string }) {
  return (
    <LocalBlock id={id} title="Como funciona a entrega">
      <ol className="space-y-3 text-[0.9375rem] leading-relaxed text-ink sm:text-base">
        {DELIVERY_STEPS.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pale-blue text-sm font-bold text-deep-fjord"
            >
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-muted">
        Regras completas na <Link href="/politicas/entrega" className="link">política de entrega</Link>.
      </p>
    </LocalBlock>
  );
}

const SECTION_LABELS: Record<string, string> = { colchoes: "Colchões", estofados: "Sofás e estofados", moveis: "Móveis" };

/** Atalhos para as seções da loja (liga as páginas locais às categorias). */
export function ShopBySection({ id = "comprar-titulo", title = "Compre por categoria" }: { id?: string; title?: string }) {
  return (
    <LocalBlock id={id} title={title}>
      <ul className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <li key={s.key}>
            <Link
              href={s.path}
              className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink hover:border-air-blue hover:bg-pale-blue hover:text-deep-fjord"
            >
              {SECTION_LABELS[s.key] ?? s.name}
            </Link>
          </li>
        ))}
      </ul>
    </LocalBlock>
  );
}

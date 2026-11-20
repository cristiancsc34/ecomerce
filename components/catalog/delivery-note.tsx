import Link from "next/link";
import { TruckIcon } from "@/components/ui/icons";
import { CITY_PAGES } from "@/content/cidades";

/**
 * Aviso de entrega das listagens: frete grátis nas cidades atendidas do
 * Paraná, saída de Maringá, e links para as páginas de cidade e a lista
 * completa (ligação interna entre categorias e páginas locais).
 */
export function DeliveryNote({ className = "" }: { className?: string }) {
  return (
    <aside aria-labelledby="entrega-titulo" className={`bg-white px-4 py-4 sm:rounded-lg sm:px-6 ${className}`}>
      <h2 id="entrega-titulo" className="flex items-center gap-2 text-base font-bold text-deep-fjord">
        <TruckIcon className="h-5 w-5 shrink-0 text-air-blue-ink" />
        Frete grátis para as cidades atendidas no Paraná
      </h2>
      <p className="mt-1 text-[0.9375rem] text-muted">Os pedidos saem de Maringá. Veja se a sua cidade está na lista.</p>
      <ul className="mt-2 flex flex-wrap gap-x-4">
        {CITY_PAGES.map((c) => (
          <li key={c.slug}>
            <Link href={`/entrega/${c.slug}`} className="link inline-flex min-h-11 items-center text-sm">
              Entrega em {c.name}
            </Link>
          </li>
        ))}
        <li>
          <Link href="/entrega" className="link inline-flex min-h-11 items-center text-sm font-semibold">
            Todas as cidades atendidas
          </Link>
        </li>
      </ul>
    </aside>
  );
}

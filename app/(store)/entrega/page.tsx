import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { isDemoMode } from "@/config/site";
import { CITY_PAGES, DELIVERY_HUB } from "@/content/cidades";
import { DeliverySteps, LocalBlock, ShopBySection } from "@/components/local/local-blocks";
import { PageBreadcrumbs } from "@/components/seo/page-breadcrumbs";
import { MapPinIcon } from "@/components/ui/icons";
import { OPEN_GRAPH_BASE } from "@/lib/seo/metadata";
import { pageRobots } from "@/lib/seo/robots";
import { normalizeCityName, SERVED_CITIES } from "@/lib/shipping/served-cities";

const PATH = "/entrega";

export function generateMetadata(): Metadata {
  const robots = pageRobots(true);
  return {
    title: DELIVERY_HUB.title,
    description: DELIVERY_HUB.description,
    alternates: { canonical: PATH },
    ...(robots ? { robots } : {}),
    openGraph: { ...OPEN_GRAPH_BASE, type: "website", title: DELIVERY_HUB.title, description: DELIVERY_HUB.description, url: PATH },
  };
}

/** Cidades atendidas em ordem alfabética (ignorando acento), agrupadas pela inicial. */
function citiesByLetter() {
  const sorted = [...SERVED_CITIES].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const groups = new Map<string, string[]>();
  for (const c of sorted) {
    const letter = normalizeCityName(c.name).charAt(0).toUpperCase();
    groups.set(letter, [...(groups.get(letter) ?? []), c.name]);
  }
  return [...groups.entries()];
}

const pageOf = new Map(CITY_PAGES.map((c) => [normalizeCityName(c.name), c.slug]));

/**
 * Cidades atendidas no Paraná: a lista completa (a mesma da regra de frete
 * grátis), o passo a passo da entrega e links para as páginas de cada cidade
 * e para as categorias.
 */
export default function DeliveryHubPage() {
  const total = SERVED_CITIES.length;
  return (
    <div className="mx-auto w-full max-w-[80rem] space-y-2 px-1.5 pt-2 sm:space-y-4 sm:px-6 sm:pt-6 lg:px-8">
      <PageBreadcrumbs
        items={[
          { name: "Início", path: "/" },
          { name: "Entrega no Paraná", path: PATH },
        ]}
        structured={!isDemoMode()}
        className="px-2.5 sm:px-0"
      />

      <header className="bg-white px-4 py-5 sm:rounded-lg sm:px-6">
        <h1 className="text-2xl font-bold text-deep-fjord sm:text-3xl">{DELIVERY_HUB.h1}</h1>
        <div className="mt-3 max-w-3xl space-y-2 text-[0.9375rem] leading-relaxed text-ink sm:text-base">
          <p>
            A {brand.name} vende só para o Paraná. Os pedidos saem de Maringá e o frete é grátis para as {total} cidades da
            lista abaixo.
          </p>
          <p>Se a sua cidade não aparece aqui, ainda não entregamos nela.</p>
        </div>
      </header>

      <LocalBlock id="cidades-destaque-titulo" title="Entrega nas principais cidades">
        <ul className="grid gap-2 sm:grid-cols-2">
          {CITY_PAGES.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/entrega/${c.slug}`}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-line px-4 py-3 hover:border-air-blue hover:bg-pale-blue"
              >
                <MapPinIcon className="h-5 w-5 shrink-0 text-air-blue-ink" />
                <span>
                  <span className="block font-semibold text-deep-fjord">Entrega em {c.name}</span>
                  <span className="text-sm text-muted">Frete grátis e como funciona</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </LocalBlock>

      <DeliverySteps />

      <LocalBlock id="lista-cidades-titulo" title={`Todas as cidades atendidas (${total})`}>
        <div className="columns-2 gap-6 sm:columns-3 lg:columns-4">
          {citiesByLetter().map(([letter, names]) => (
            <div key={letter} className="mb-4 break-inside-avoid">
              <h3 className="text-sm font-bold text-air-blue-ink">{letter}</h3>
              <ul className="mt-1 space-y-1 text-[0.9375rem] text-ink">
                {names.map((name) => {
                  const slug = pageOf.get(normalizeCityName(name));
                  return (
                    <li key={name}>
                      {slug ? (
                        <Link href={`/entrega/${slug}`} className="link inline-flex min-h-11 items-center font-semibold">
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </LocalBlock>

      <ShopBySection />
    </div>
  );
}

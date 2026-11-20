import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoMode } from "@/config/site";
import { CITY_PAGES, cityPageBySlug } from "@/content/cidades";
import { DeliverySteps, LocalBlock, ShopBySection } from "@/components/local/local-blocks";
import { PageBreadcrumbs } from "@/components/seo/page-breadcrumbs";
import { TruckIcon } from "@/components/ui/icons";
import { OPEN_GRAPH_BASE } from "@/lib/seo/metadata";
import { pageRobots } from "@/lib/seo/robots";
import { normalizeCityName } from "@/lib/shipping/served-cities";

export function generateStaticParams() {
  return CITY_PAGES.map((c) => ({ cidade: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/entrega/[cidade]">): Promise<Metadata> {
  const city = cityPageBySlug((await params).cidade);
  if (!city) notFound();
  const path = `/entrega/${city.slug}`;
  const robots = pageRobots(true);
  return {
    title: city.title,
    description: city.description,
    alternates: { canonical: path },
    ...(robots ? { robots } : {}),
    openGraph: { ...OPEN_GRAPH_BASE, type: "website", title: city.title, description: city.description, url: path },
  };
}

const pageOf = new Map(CITY_PAGES.map((c) => [normalizeCityName(c.name), c.slug]));

/**
 * Página local de uma cidade atendida: texto próprio da cidade, como a entrega
 * chega até ela, cidades vizinhas atendidas e atalhos para as categorias.
 */
export default async function CityPage({ params }: PageProps<"/entrega/[cidade]">) {
  const city = cityPageBySlug((await params).cidade);
  if (!city) notFound();
  const others = CITY_PAGES.filter((c) => c.slug !== city.slug);

  return (
    <div className="mx-auto w-full max-w-[80rem] space-y-2 px-1.5 pt-2 sm:space-y-4 sm:px-6 sm:pt-6 lg:px-8">
      <PageBreadcrumbs
        items={[
          { name: "Início", path: "/" },
          { name: "Entrega no Paraná", path: "/entrega" },
          { name: city.name, path: `/entrega/${city.slug}` },
        ]}
        structured={!isDemoMode()}
        className="px-2.5 sm:px-0"
      />

      <header className="bg-white px-4 py-5 sm:rounded-lg sm:px-6">
        <h1 className="text-2xl font-bold text-deep-fjord sm:text-3xl">{city.h1}</h1>
        <div className="mt-3 max-w-3xl space-y-2 text-[0.9375rem] leading-relaxed text-ink sm:text-base">
          {city.intro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </header>

      <LocalBlock id="frete-cidade-titulo" title={`Frete grátis em ${city.name}`}>
        <p className="flex gap-3 text-[0.9375rem] leading-relaxed text-ink sm:text-base">
          <TruckIcon className="mt-0.5 h-5 w-5 shrink-0 text-air-blue-ink" />
          <span>{city.delivery}</span>
        </p>
      </LocalBlock>

      <DeliverySteps />

      <LocalBlock id="vizinhas-titulo" title={`Perto de ${city.name}, também com frete grátis`}>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem] text-ink">
          {city.nearby.map((name) => {
            const slug = pageOf.get(normalizeCityName(name));
            return (
              <li key={name} className="inline-flex min-h-11 items-center">
                {slug ? (
                  <Link href={`/entrega/${slug}`} className="link">
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-sm">
          <Link href="/entrega" className="link inline-flex min-h-11 items-center font-semibold">
            Ver todas as cidades atendidas no Paraná
          </Link>
        </p>
      </LocalBlock>

      <ShopBySection />

      {others.length ? (
        <nav aria-labelledby="outras-cidades-titulo" className="bg-white px-4 py-4 sm:rounded-lg sm:px-6">
          <h2 id="outras-cidades-titulo" className="text-sm font-bold uppercase tracking-wide text-deep-fjord">
            Outras cidades
          </h2>
          <ul className="mt-1 flex flex-wrap gap-x-4">
            {others.map((c) => (
              <li key={c.slug}>
                <Link href={`/entrega/${c.slug}`} className="link inline-flex min-h-11 items-center text-sm">
                  Entrega em {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

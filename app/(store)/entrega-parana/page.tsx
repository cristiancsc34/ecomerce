import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { isDemoMode } from "@/config/site";
import { DELIVERY_CITIES, normalizeCityName } from "@/content/cidades-atendidas";
import { PageBreadcrumbs } from "@/components/seo/page-breadcrumbs";
import { OPEN_GRAPH_BASE } from "@/lib/seo/metadata";

const PATH = "/entrega-parana";
const TITLE = "Entrega no Paraná";
const DESCRIPTION = `A ${brand.name} vende para clientes do Paraná. Veja a lista de cidades de entrega.`;

/**
 * Entrega no Paraná (issue #31): fica com `noindex` e fora do sitemap mesmo
 * com a trava de indexação aberta, até o Cristian aprovar a lista de cidades e
 * a logística fechar o frete (decisões 1 e 5).
 */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  robots: { index: false, follow: true },
  openGraph: { ...OPEN_GRAPH_BASE, type: "website", title: TITLE, description: DESCRIPTION, url: PATH },
};

/** Cidades confirmadas, em ordem alfabética, agrupadas pela inicial (sem acento). */
function citiesByLetter() {
  const sorted = DELIVERY_CITIES.filter((c) => c.confirmed)
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const groups = new Map<string, string[]>();
  for (const name of sorted) {
    const letter = normalizeCityName(name).charAt(0).toUpperCase();
    groups.set(letter, [...(groups.get(letter) ?? []), name]);
  }
  return [...groups.entries()];
}

export default function DeliveryParanaPage() {
  const groups = citiesByLetter();
  const total = groups.reduce((n, [, names]) => n + names.length, 0);
  return (
    <div className="container-page py-6 sm:py-10">
      <PageBreadcrumbs
        items={[
          { name: "Início", path: "/" },
          { name: TITLE, path: PATH },
        ]}
        structured={!isDemoMode()}
      />
      <article className="mt-4 max-w-4xl">
        <h1 className="text-3xl font-bold sm:text-4xl">{TITLE}</h1>
        <p className="mt-3 text-lg text-ink/85">
          A {brand.name} vende para clientes do Paraná. Estas são as {total} cidades da nossa lista de entrega.
        </p>
        {/* TODO(Cristian, issues #28 e #31): texto de frete e de como funciona a entrega, quando a logística fechar. */}

        <section aria-labelledby="lista-cidades-titulo" className="mt-8">
          <h2 id="lista-cidades-titulo" className="text-xl font-bold">
            Cidades de entrega
          </h2>
          <div className="mt-4 columns-2 gap-6 sm:columns-3 lg:columns-4">
            {groups.map(([letter, names]) => (
              <div key={letter} className="mb-4 break-inside-avoid">
                <h3 className="text-sm font-bold text-air-blue-ink">{letter}</h3>
                <ul className="mt-1 space-y-1 text-[0.9375rem] text-ink">
                  {names.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-6 text-[0.9375rem] text-ink">
          Dúvidas sobre o seu endereço? Fale com o <Link href="/atendimento" className="link">atendimento</Link> ou veja a{" "}
          <Link href="/politicas/entrega" className="link">política de entrega</Link>.
        </p>
      </article>
    </div>
  );
}

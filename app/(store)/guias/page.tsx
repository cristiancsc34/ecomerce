import type { Metadata } from "next";
import Link from "next/link";
import { isDemoMode } from "@/config/site";
import { GUIAS } from "@/content/guias";
import { PageBreadcrumbs } from "@/components/seo/page-breadcrumbs";
import { OPEN_GRAPH_BASE } from "@/lib/seo/metadata";
import { pageRobots } from "@/lib/seo/robots";

const PATH = "/guias";
const TITLE = "Guias de compra";
const DESCRIPTION = "Guias para escolher colchões, sofás, poltronas, mesas e cadeiras: medidas, materiais e cuidados.";

export function generateMetadata(): Metadata {
  // Índice vazio não vai para o Google (issue #31); com guia publicado, segue a trava (#17).
  const robots = pageRobots(GUIAS.length > 0);
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PATH },
    ...(robots ? { robots } : {}),
    openGraph: { ...OPEN_GRAPH_BASE, type: "website", title: TITLE, description: DESCRIPTION, url: PATH },
  };
}

/** Índice dos guias: lista só o que já foi publicado. */
export default function GuidesPage() {
  return (
    <div className="container-page py-6 sm:py-10">
      <PageBreadcrumbs
        items={[
          { name: "Início", path: "/" },
          { name: TITLE, path: PATH },
        ]}
        structured={!isDemoMode()}
      />
      <div className="mt-4 max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">{TITLE}</h1>
        {GUIAS.length ? (
          <ul className="mt-6 space-y-3">
            {GUIAS.map((g) => (
              <li key={g.slug}>
                <Link href={`/guias/${g.slug}`} className="block rounded-lg border border-line bg-white p-4 hover:border-air-blue">
                  <span className="block text-lg font-semibold text-deep-fjord">{g.title}</span>
                  <span className="mt-1 block text-muted">{g.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-lg text-ink/85">
            Os guias ainda estão sendo escritos. Enquanto isso, veja os <Link href="/produtos" className="link">produtos</Link> ou fale
            com o <Link href="/atendimento" className="link">atendimento</Link>.
          </p>
        )}
      </div>
    </div>
  );
}

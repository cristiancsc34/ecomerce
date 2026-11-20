import Link from "next/link";
import { isDemoMode, siteUrl } from "@/config/site";
import { JsonLd } from "@/components/seo/json-ld";
import { PageBreadcrumbs } from "@/components/seo/page-breadcrumbs";
import { Paragraphs } from "@/components/ui/paragraphs";
import type { ListingView } from "@/lib/seo/listing";
import { productStructuredDataAllowed } from "@/lib/seo/robots";
import { itemListJsonLd } from "@/lib/seo/structured-data";
import { DeliveryNote } from "./delivery-note";
import { ProductSection } from "./product-section";

/** Pílulas de atalho (subcategorias, outras seções), com alvo de toque de 44 px. */
function LinkPills({ id, title, links }: { id: string; title: string; links: { path: string; name: string; count?: number }[] }) {
  if (!links.length) return null;
  return (
    <nav aria-labelledby={id} className="bg-white px-4 py-3 sm:rounded-lg sm:px-6">
      <h2 id={id} className="text-sm font-bold uppercase tracking-wide text-deep-fjord">
        {title}
      </h2>
      <ul className="mt-1 flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.path}>
            <Link
              href={l.path}
              className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink hover:border-air-blue hover:bg-pale-blue hover:text-deep-fjord"
            >
              {l.name}
              {typeof l.count === "number" ? <span className="ml-1.5 font-normal text-muted">({l.count})</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Página de listagem (seção ou subcategoria): trilha, H1 com a introdução da
 * página, atalhos para as subcategorias, produtos, aviso de entrega no Paraná,
 * texto do painel e links para as outras seções. Dados para o Google: trilha
 * (BreadcrumbList) e, com a trava de indexação aberta, a lista de produtos.
 */
export function ListingPage({ view }: { view: ListingView }) {
  const structured = !isDemoMode();
  const list = structured && productStructuredDataAllowed() ? itemListJsonLd(view.products, siteUrl(), view.h1) : null;
  return (
    <div className="space-y-2 sm:space-y-4">
      {list ? <JsonLd data={list} /> : null}
      <PageBreadcrumbs items={view.breadcrumbs} structured={structured} className="px-2.5 sm:px-0" />
      {view.links.length ? <LinkPills id="atalhos-titulo" title={view.linksTitle} links={view.links} /> : null}
      <ProductSection
        id="categoria-titulo"
        title={view.h1}
        headingLevel="h1"
        intro={view.intro}
        products={view.products}
        priorityCount={4}
        empty={{ title: "Nenhum produto nesta categoria por enquanto" }}
      />
      <DeliveryNote />
      {view.content ? (
        <section aria-labelledby="categoria-sobre" className="bg-white px-4 py-5 sm:rounded-lg sm:px-6">
          <h2 id="categoria-sobre" className="mb-3 text-base font-bold uppercase tracking-wide text-deep-fjord">
            Sobre {view.contentLabel}
          </h2>
          <Paragraphs text={view.content} />
        </section>
      ) : null}
      <LinkPills id="outras-secoes-titulo" title="Veja também" links={view.otherSections} />
    </div>
  );
}

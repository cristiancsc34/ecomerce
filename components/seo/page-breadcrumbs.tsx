import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { siteUrl } from "@/config/site";
import type { Crumb } from "@/lib/seo/breadcrumbs";
import { breadcrumbJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "./json-ld";

/**
 * Trilha de navegação visível e o mesmo caminho em schema.org/BreadcrumbList.
 * `structured={false}` (modo demonstração, produto de demonstração ou
 * pré-visualização do painel) mostra só a trilha, sem dados para o Google.
 */
export function PageBreadcrumbs({ items, structured = true, className = "" }: { items: Crumb[]; structured?: boolean; className?: string }) {
  return (
    <div className={className}>
      {structured ? <JsonLd data={breadcrumbJsonLd(items, siteUrl())} /> : null}
      <Breadcrumbs items={items.map((c, i) => ({ label: c.name, href: i === items.length - 1 ? undefined : c.path }))} />
    </div>
  );
}

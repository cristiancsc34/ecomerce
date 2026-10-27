import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import { Breadcrumbs } from "./breadcrumbs";
import { POLICY_LINKS } from "./nav-links";
import { Notice } from "@/components/ui/notice";

export function PolicyPage({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Políticas", href: "/politicas" }, { label: title }]} />
      <div className="mt-6 grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Políticas" className="order-2 lg:order-1">
          <ul className="space-y-1 text-[0.9375rem]">
            {POLICY_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-10 items-center text-ink hover:text-air-blue-ink hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="order-1 max-w-3xl lg:order-2">
          <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted">Última atualização: {updatedAt}</p>
          {brand.policiesUnderReview ? (
            <Notice tone="warning" className="mt-5" title="Documento em revisão">
              Este texto descreve como o site funciona hoje e o que a lei garante. Regras comerciais específicas da{" "}
              {brand.name} ainda serão definidas e revisadas antes do lançamento da compra online.
            </Notice>
          ) : null}
          <div className="prose-cuxoes mt-8">{children}</div>
        </article>
      </div>
    </div>
  );
}

/** Mostra o dado legal configurado ou um marcador explícito de pendência. */
export function LegalValue({ value, fallback }: { value: string; fallback: string }) {
  return value ? <>{value}</> : <em className="text-muted">{fallback}</em>;
}

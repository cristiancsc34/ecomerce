import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { POLICY_LINKS } from "@/components/layout/nav-links";
import { ChevronRightIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Políticas",
  alternates: { canonical: "/politicas" },
};

export default function PoliciesIndex() {
  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Políticas" }]} />
      <h1 className="mb-6 mt-4 text-3xl font-bold sm:text-4xl">Políticas</h1>
      <ul className="max-w-2xl divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-white">
        {POLICY_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex min-h-14 items-center justify-between px-5 font-medium text-deep-fjord hover:bg-cloud">
              {l.label}
              <ChevronRightIcon className="h-5 w-5 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

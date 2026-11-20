import Link from "next/link";
import { cacheLife } from "next/cache";
import { brand, whatsappHref } from "@/config/brand";
import { isDemoMode } from "@/config/site";
import { CITY_PAGES } from "@/content/cidades";
import { SECTIONS } from "@/lib/catalog/sections";
import { POLICY_LINKS } from "./nav-links";

async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

const linkClass = "inline-flex min-h-11 items-center text-ink hover:underline";

/**
 * Rodapé enxuto: seções da loja e entrega no Paraná (ligam todas as páginas às
 * categorias e às páginas de cidade), atendimento, políticas e dados legais
 * (só os configurados).
 */
export function Footer() {
  const { contact, legal } = brand;
  const wa = contact.whatsapp ? whatsappHref(contact.whatsapp) : null;
  const links = [{ href: "/atendimento", label: "Atendimento" }, { href: "/conta", label: "Acompanhar pedido" }, ...POLICY_LINKS];

  return (
    <footer className="mt-12 border-t border-line bg-white">
      <div className="container-page flex flex-col gap-4 pb-24 pt-8 text-sm text-muted lg:pb-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <nav aria-labelledby="rodape-categorias">
            <h2 id="rodape-categorias" className="text-xs font-bold uppercase tracking-wide text-deep-fjord">
              Categorias
            </h2>
            <ul className="flex flex-wrap gap-x-5">
              {SECTIONS.map((s) => (
                <li key={s.key}>
                  <Link href={s.path} className={linkClass}>
                    {s.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/produtos" className={linkClass}>
                  Todos os produtos
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="rodape-entrega">
            <h2 id="rodape-entrega" className="text-xs font-bold uppercase tracking-wide text-deep-fjord">
              Frete grátis no Paraná
            </h2>
            <ul className="flex flex-wrap gap-x-5">
              {CITY_PAGES.map((c) => (
                <li key={c.slug}>
                  <Link href={`/entrega/${c.slug}`} className={linkClass}>
                    {c.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/entrega" className={linkClass}>
                  Cidades atendidas
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <nav aria-label="Links da loja">
          <ul className="flex flex-wrap gap-x-5 gap-y-0">
            {wa ? (
              <li>
                <a href={wa} rel="noopener noreferrer" target="_blank" className="inline-flex min-h-11 items-center text-ink hover:underline">
                  WhatsApp
                </a>
              </li>
            ) : null}
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-11 items-center text-ink hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p>
          © <CurrentYear /> {legal.companyName || brand.name}
          {legal.cnpj ? ` · CNPJ ${legal.cnpj}` : null}
          {legal.address ? ` · ${legal.address}` : null}
          {isDemoMode() ? " · Versão de demonstração" : null}
        </p>
      </div>
    </footer>
  );
}

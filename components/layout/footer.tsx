import Link from "next/link";
import { cacheLife } from "next/cache";
import { brand, whatsappHref } from "@/config/brand";
import { isDemoMode } from "@/config/site";
import { POLICY_LINKS } from "./nav-links";

async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

/** Rodapé enxuto: atendimento, políticas e dados legais (só os configurados). */
export function Footer() {
  const { contact, legal } = brand;
  const wa = contact.whatsapp ? whatsappHref(contact.whatsapp) : null;
  const links = [{ href: "/atendimento", label: "Atendimento" }, ...POLICY_LINKS];

  return (
    <footer className="mt-12 border-t border-line bg-white">
      <div className="container-page flex flex-col gap-4 py-8 text-sm text-muted">
        <nav aria-label="Links da loja">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {wa ? (
              <li>
                <a href={wa} rel="noopener noreferrer" target="_blank" className="inline-flex min-h-10 items-center text-ink hover:underline">
                  WhatsApp
                </a>
              </li>
            ) : null}
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-10 items-center text-ink hover:underline">
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

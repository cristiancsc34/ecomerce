import Link from "next/link";
import { cacheLife } from "next/cache";
import { brand, hasAnyContact, whatsappHref } from "@/config/brand";
import { LogoMark } from "@/components/ui/icons";
import { MAIN_NAV, POLICY_LINKS } from "./nav-links";

async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

export function Footer() {
  const { contact, legal, social } = brand;
  const wa = contact.whatsapp ? whatsappHref(contact.whatsapp) : null;

  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Link href="/" className="inline-flex items-center gap-2 text-deep-fjord">
            <LogoMark className="h-8 w-8" />
            <span className="text-xl font-bold">{brand.name}</span>
          </Link>
          <p className="text-muted">{brand.slogan}</p>
        </div>

        <nav aria-label="Loja">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-deep-fjord">Loja</h2>
          <ul className="mt-3 space-y-1">
            {MAIN_NAV.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-10 items-center text-ink hover:text-air-blue-ink hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Políticas">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-deep-fjord">Políticas</h2>
          <ul className="mt-3 space-y-1">
            {POLICY_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-10 items-center text-ink hover:text-air-blue-ink hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-deep-fjord">Atendimento</h2>
          {hasAnyContact() ? (
            <ul className="mt-3 space-y-2 text-ink">
              {wa ? (
                <li>
                  <a href={wa} className="link" rel="noopener noreferrer" target="_blank">
                    WhatsApp {contact.whatsapp}
                  </a>
                </li>
              ) : null}
              {contact.phone ? (
                <li>
                  <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="link">
                    {contact.phone}
                  </a>
                </li>
              ) : null}
              {contact.email ? (
                <li>
                  <a href={`mailto:${contact.email}`} className="link">
                    {contact.email}
                  </a>
                </li>
              ) : null}
              {contact.hours ? <li className="text-muted">{contact.hours}</li> : null}
            </ul>
          ) : (
            <p className="mt-3 text-muted">
              Canais de atendimento em configuração.{" "}
              <Link href="/atendimento" className="link">
                Saiba mais
              </Link>
            </p>
          )}
          {social.length ? (
            <ul className="mt-4 flex flex-wrap gap-3">
              {social.map((s) => (
                <li key={s.href}>
                  <a href={s.href} className="link" rel="noopener noreferrer" target="_blank">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-1 py-5 text-sm text-muted sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p>
            © <CurrentYear /> {legal.companyName || brand.name}
            {legal.cnpj ? ` · CNPJ ${legal.cnpj}` : null}
          </p>
          {legal.address ? <p>{legal.address}</p> : null}
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { cacheLife } from "next/cache";
import { brand, whatsappHref } from "@/config/brand";
import { isDemoMode } from "@/config/site";
import { getCategoriesWithProducts } from "@/lib/catalog/queries";
import { POLICY_LINKS } from "./nav-links";

async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

const linkClass = "inline-flex min-h-11 items-center text-ink hover:underline";

/**
 * Categorias com produto (as mesmas do menu), para ligar todas as páginas às
 * categorias. Catálogo fora do ar não derruba o rodapé: a lista some.
 */
async function CategoryLinks() {
  const categories = await getCategoriesWithProducts().catch((error: unknown) => {
    console.error("Rodapé: falha ao ler as categorias; seguindo sem a lista.", error);
    return [];
  });
  if (!categories.length) return null;
  return (
    <nav aria-labelledby="rodape-categorias">
      <h2 id="rodape-categorias" className="text-xs font-bold uppercase tracking-wide text-deep-fjord">
        Categorias
      </h2>
      <ul className="flex flex-wrap gap-x-5">
        {categories.map((c) => (
          <li key={c.slug}>
            <Link href={`/categorias/${c.slug}`} className={linkClass}>
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Rodapé enxuto: categorias, entrega no Paraná, guias, atendimento, políticas
 * e dados legais (só os configurados).
 */
export function Footer() {
  const { contact, legal } = brand;
  const wa = contact.whatsapp ? whatsappHref(contact.whatsapp) : null;
  const links = [
    { href: "/atendimento", label: "Atendimento" },
    { href: "/entrega-parana", label: "Entrega no Paraná" },
    { href: "/guias", label: "Guias de compra" },
    { href: "/conta", label: "Acompanhar pedido" },
    ...POLICY_LINKS,
  ];

  return (
    <footer className="mt-12 border-t border-line bg-white">
      <div className="container-page flex flex-col gap-4 pb-24 pt-8 text-sm text-muted lg:pb-8">
        <CategoryLinks />
        <nav aria-label="Links da loja">
          <ul className="flex flex-wrap gap-x-5 gap-y-0">
            {wa ? (
              <li>
                <a href={wa} rel="noopener noreferrer" target="_blank" className={linkClass}>
                  WhatsApp
                </a>
              </li>
            ) : null}
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={linkClass}>
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

import Form from "next/form";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/misc";
import { getCategoriesWithProducts } from "@/lib/catalog/queries";

/** Categorias com produto (as do menu). Catálogo fora do ar: a lista some. */
async function CategoryLinks() {
  const categories = await getCategoriesWithProducts().catch(() => []);
  return categories.map((c) => (
    <li key={c.slug}>
      <Link href={`/categorias/${c.slug}`} className="link inline-flex min-h-11 items-center">
        {c.name}
      </Link>
    </li>
  ));
}

/**
 * 404 amigável: explica o que houve, oferece a busca e os caminhos principais
 * (categorias, entrega no Paraná, guias e atendimento). O Next põe `noindex`
 * sozinho nesta página.
 */
export default function StoreNotFound() {
  return (
    <div className="container-page py-10 sm:py-16">
      <EmptyState
        icon={<SearchIcon className="h-7 w-7" />}
        title="Página não encontrada"
        action={
          <>
            <ButtonLink href="/produtos">Ver produtos</ButtonLink>
            <ButtonLink href="/" variant="secondary">
              Voltar ao início
            </ButtonLink>
          </>
        }
      >
        <p>O endereço pode ter mudado ou o produto não está mais disponível. Tente buscar pelo nome:</p>
        <Form action="/busca" role="search" className="mx-auto mt-4 flex w-full max-w-sm">
          <label htmlFor="nao-encontrada-busca" className="sr-only">
            Buscar produtos
          </label>
          <input
            id="nao-encontrada-busca"
            name="q"
            type="search"
            placeholder="Ex.: colchão casal"
            className="h-11 w-full min-w-0 rounded-l-lg rounded-r-none border border-r-0 border-air-blue bg-white pl-3.5 pr-2 text-base text-ink placeholder:text-muted"
          />
          <button
            type="submit"
            className="inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-r-lg bg-deep-fjord text-white hover:bg-[#1d3a58]"
          >
            <SearchIcon className="h-5 w-5" />
            <span className="sr-only">Buscar</span>
          </button>
        </Form>
      </EmptyState>

      <nav aria-labelledby="nao-encontrada-caminhos" className="mx-auto mt-6 max-w-2xl text-center">
        <h2 id="nao-encontrada-caminhos" className="text-sm font-bold uppercase tracking-wide text-deep-fjord">
          Ou siga por aqui
        </h2>
        <ul className="mt-2 flex flex-wrap justify-center gap-x-5">
          <CategoryLinks />
          {[
            { href: "/entrega-parana", label: "Entrega no Paraná" },
            { href: "/guias", label: "Guias de compra" },
            { href: "/atendimento", label: "Atendimento" },
          ].map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="link inline-flex min-h-11 items-center">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

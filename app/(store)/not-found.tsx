import Form from "next/form";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/misc";
import { CITY_PAGES } from "@/content/cidades";
import { SECTIONS } from "@/lib/catalog/sections";

/**
 * 404 amigável: explica o que houve, oferece a busca e os caminhos principais
 * (seções, todos os produtos e entrega no Paraná). O Next responde 404 e põe
 * `noindex` sozinho nesta página.
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
          {SECTIONS.map((s) => (
            <li key={s.key}>
              <Link href={s.path} className="link inline-flex min-h-11 items-center">
                {s.name}
              </Link>
            </li>
          ))}
          {CITY_PAGES.map((c) => (
            <li key={c.slug}>
              <Link href={`/entrega/${c.slug}`} className="link inline-flex min-h-11 items-center">
                Entrega em {c.name}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/entrega" className="link inline-flex min-h-11 items-center">
              Cidades atendidas
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}

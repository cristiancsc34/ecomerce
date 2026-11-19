import Form from "next/form";
import Link from "next/link";
import { SearchIcon } from "@/components/ui/icons";
import { Logo } from "./logo";
import { CartLink } from "./cart-link";

/** Cabeçalho de loja: marca, busca em destaque e sacola. Sem menus extras. */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white text-deep-fjord shadow-[0_2px_12px_rgb(19_41_64/0.08)]">
      <div className="container-page flex h-16 items-center gap-3 sm:h-[4.5rem] sm:gap-6">
        <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg py-1 pr-1">
          <Logo className="text-xl sm:text-2xl" />
          <span className="sr-only">, página inicial</span>
        </Link>

        <Form action="/busca" role="search" className="relative flex min-w-0 flex-1 lg:max-w-3xl">
          <label htmlFor="header-search" className="sr-only">
            Buscar produtos
          </label>
          <input
            id="header-search"
            name="q"
            type="search"
            placeholder="Buscar móveis"
            className="h-11 w-full min-w-0 rounded-l-lg rounded-r-none border border-r-0 border-air-blue bg-white pl-3.5 pr-2 text-base text-ink placeholder:text-muted sm:h-12"
          />
          <button
            type="submit"
            className="inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-r-lg bg-deep-fjord text-white hover:bg-[#1d3a58] sm:h-12 sm:w-16"
          >
            <SearchIcon className="h-5 w-5" />
            <span className="sr-only">Buscar</span>
          </button>
        </Form>

        <div className="sm:ml-auto">
          <CartLink />
        </div>
      </div>
    </header>
  );
}

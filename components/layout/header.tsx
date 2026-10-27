import Link from "next/link";
import { brand } from "@/config/brand";
import { LogoMark, SearchIcon, UserIcon } from "@/components/ui/icons";
import { CartLink } from "./cart-link";
import { MobileMenu } from "./mobile-menu";
import { MAIN_NAV } from "./nav-links";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="container-page relative flex h-16 items-center gap-2 lg:gap-6">
        <MobileMenu />

        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-lg py-1 pr-1 text-deep-fjord">
          <LogoMark className="h-8 w-8" />
          <span className="text-xl font-bold tracking-tight">{brand.name}</span>
        </Link>

        <nav aria-label="Principal" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {MAIN_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-full px-3.5 text-[0.9375rem] font-medium text-deep-fjord hover:bg-pale-blue"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <form action="/busca" method="get" role="search" className="relative hidden lg:block">
            <label htmlFor="header-search" className="sr-only">
              Buscar produtos
            </label>
            <input
              id="header-search"
              name="q"
              type="search"
              placeholder="Buscar colchões"
              className="h-11 w-56 rounded-full border border-line bg-cloud pl-10 pr-4 text-[0.9375rem] text-ink placeholder:text-muted hover:border-[#c3d1dc] xl:w-72"
            />
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          </form>
          <Link
            href="/busca"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-deep-fjord hover:bg-pale-blue lg:hidden"
          >
            <SearchIcon className="h-6 w-6" />
            <span className="sr-only">Buscar</span>
          </Link>
          <Link
            href="/conta"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-deep-fjord hover:bg-pale-blue"
          >
            <UserIcon className="h-6 w-6" />
            <span className="sr-only">Minha conta</span>
          </Link>
          <CartLink />
        </div>
      </div>
    </header>
  );
}

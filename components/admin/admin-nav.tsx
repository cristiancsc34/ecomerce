"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoxIcon, ClockIcon, HomeIcon, PlusIcon, TagIcon } from "@/components/ui/icons";

const ITEMS = [
  { href: "/admin", label: "Início", icon: HomeIcon, exact: true },
  { href: "/admin/produtos", label: "Produtos", icon: BoxIcon },
  { href: "/admin/categorias", label: "Categorias", icon: TagIcon },
  { href: "/admin/atividade", label: "Atividade", icon: ClockIcon },
] as const;

function isActive(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  // "Novo produto" tem botão próprio; não acende "Produtos".
  if (pathname === "/admin/produtos/novo") return false;
  return pathname.startsWith(href);
}

/** Menu lateral (computador). */
export function AdminSidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Painel">
      <Link
        href="/admin/produtos/novo"
        aria-current={pathname === "/admin/produtos/novo" ? "page" : undefined}
        className="mb-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white font-semibold text-deep-fjord hover:bg-pale-blue"
      >
        <PlusIcon className="h-5 w-5" /> Novo produto
      </Link>
      <ul className="space-y-1">
        {ITEMS.map(({ href, label, icon: Icon, ...rest }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive(pathname, href, "exact" in rest) ? "page" : undefined}
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium text-white/80 hover:bg-white/10 hover:text-white aria-[current=page]:bg-white/15 aria-[current=page]:text-white"
            >
              <Icon className="h-5 w-5" /> {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Barra de abas fixa embaixo (celular), com o "+" de novo produto no meio. */
export function AdminBottomNav() {
  const pathname = usePathname();
  const [home, products, categories, activity] = ITEMS;
  const tab = (item: (typeof ITEMS)[number]) => {
    const Icon = item.icon;
    const active = isActive(pathname, item.href, "exact" in item);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium text-muted aria-[current=page]:text-air-blue-ink"
      >
        <Icon className="h-6 w-6" /> {item.label}
      </Link>
    );
  };
  return (
    <nav
      aria-label="Painel"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {tab(home)}
      {tab(products)}
      <Link
        href="/admin/produtos/novo"
        aria-current={pathname === "/admin/produtos/novo" ? "page" : undefined}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold text-deep-fjord"
      >
        <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-deep-fjord text-white shadow-[var(--shadow-lift)]">
          <PlusIcon className="h-6 w-6" />
        </span>
        Novo
      </Link>
      {tab(categories)}
      {tab(activity)}
    </nav>
  );
}

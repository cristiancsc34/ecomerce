"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AreaDoPainel } from "@/lib/auth/areas";
import { BoxIcon, ClockIcon, HomeIcon, MapPinIcon, PlusIcon, TagIcon, TruckIcon } from "@/components/ui/icons";

type Item = { href: string; label: string; icon: typeof HomeIcon; exact?: boolean; area?: AreaDoPainel };

const ITEMS: Item[] = [
  { href: "/admin", label: "Início", icon: HomeIcon, exact: true },
  { href: "/admin/pedidos", label: "Pedidos", icon: TruckIcon, area: "pedidos" },
  { href: "/admin/produtos", label: "Produtos", icon: BoxIcon, area: "itens" },
  { href: "/admin/categorias", label: "Categorias", icon: TagIcon, area: "itens" },
  { href: "/admin/atividade", label: "Atividade", icon: ClockIcon, area: "itens" },
  { href: "/admin/entrega", label: "Entrega e avisos", icon: MapPinIcon, area: "entrega" },
];

/** Só o que a senha usada abre (a regra de verdade está no banco e nas páginas). */
const visiveis = (areas: readonly AreaDoPainel[]) => ITEMS.filter((i) => !i.area || areas.includes(i.area));

function isActive(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  // "Novo produto" tem botão próprio; não acende "Produtos".
  if (pathname === "/admin/produtos/novo") return false;
  return pathname.startsWith(href);
}

/** Menu lateral (computador). */
export function AdminSidebarNav({ areas }: { areas: readonly AreaDoPainel[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Painel">
      {areas.includes("itens") ? (
        <Link
          href="/admin/produtos/novo"
          aria-current={pathname === "/admin/produtos/novo" ? "page" : undefined}
          className="mb-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white font-semibold text-deep-fjord hover:bg-pale-blue"
        >
          <PlusIcon className="h-5 w-5" /> Novo produto
        </Link>
      ) : null}
      <ul className="space-y-1">
        {visiveis(areas).map(({ href, label, icon: Icon, exact }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive(pathname, href, exact) ? "page" : undefined}
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

/** Barra de abas fixa embaixo (celular), com o "+" de novo produto no meio (só para quem cuida dos itens). */
export function AdminBottomNav({ areas }: { areas: readonly AreaDoPainel[] }) {
  const pathname = usePathname();
  // No celular: Início, Pedidos, +, Produtos, Categorias (o que a área abre). A atividade fica no Início.
  const novo = areas.includes("itens");
  const abas = visiveis(areas)
    .filter((i) => i.href !== "/admin/atividade")
    .slice(0, novo ? 4 : 5);
  const meio = Math.min(2, abas.length);
  const tab = (item: Item) => {
    const Icon = item.icon;
    const active = isActive(pathname, item.href, item.exact);
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
      {abas.slice(0, meio).map(tab)}
      {novo ? (
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
      ) : null}
      {abas.slice(meio).map(tab)}
    </nav>
  );
}

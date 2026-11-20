"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActiveNavItem, type CategoryNavItem } from "@/lib/catalog/category-nav";

/** Pílulas do menu de categorias (alvo de 44 px). Sem `pathname`, nenhuma fica destacada. */
export function CategoryPills({ items, pathname }: { items: CategoryNavItem[]; pathname: string | null }) {
  return (
    <ul className="-mx-1 flex h-11 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] sm:gap-2">
      {items.map((item) => {
        const active = isActiveNavItem(item, pathname);
        return (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold ${
                active ? "bg-pale-blue text-deep-fjord" : "text-ink hover:bg-pale-blue hover:text-deep-fjord"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Mesmas pílulas, destacando a página atual. */
export function CategoryPillsAtual({ items }: { items: CategoryNavItem[] }) {
  return <CategoryPills items={items} pathname={usePathname()} />;
}

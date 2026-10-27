import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui/icons";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Trilha de navegação" className="text-sm">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-muted">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className="inline-flex min-h-8 items-center rounded hover:text-deep-fjord hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-ink" : undefined}>
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRightIcon className="h-4 w-4 shrink-0" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { useCartCount } from "@/lib/cart/store";
import { BagIcon } from "@/components/ui/icons";

export function CartLink() {
  const count = useCartCount();
  const label = count === 0 ? "Sacola vazia" : `Sacola, ${count} ${count === 1 ? "item" : "itens"}`;
  return (
    <Link
      href="/carrinho"
      aria-label={label}
      className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15"
    >
      <BagIcon className="h-7 w-7" />
      {/* Posicionado de forma absoluta: aparecer após a hidratação não desloca o layout. */}
      <span
        aria-hidden="true"
        className={`absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[0.6875rem] font-bold leading-none text-air-blue-ink ring-2 ring-air-blue-ink transition-opacity ${count ? "opacity-100" : "opacity-0"}`}
      >
        {count > 99 ? "99+" : count}
      </span>
    </Link>
  );
}

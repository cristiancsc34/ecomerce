"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CloseIcon, MenuIcon, SearchIcon } from "@/components/ui/icons";
import { MAIN_NAV } from "./nav-links";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Sem usePathname(): ler a URL num componente do cabeçalho impediria o
  // pré-render das rotas dinâmicas. O menu fecha ao escolher um link ou buscar.
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("a, input, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-deep-fjord hover:bg-pale-blue"
      >
        {open ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
        <span className="sr-only">{open ? "Fechar menu" : "Abrir menu"}</span>
      </button>

      <div
        id={panelId}
        ref={panelRef}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-line bg-white shadow-[var(--shadow-lift)]"
      >
        <div className="container-page py-4">
          <form action="/busca" method="get" role="search" className="relative mb-3" onSubmit={close}>
            <label htmlFor={`${panelId}-q`} className="sr-only">
              Buscar produtos
            </label>
            <input
              id={`${panelId}-q`}
              name="q"
              type="search"
              placeholder="Buscar colchões"
              className="h-12 w-full rounded-full border border-line bg-cloud pl-11 pr-4 text-base text-ink placeholder:text-muted"
            />
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          </form>
          <nav aria-label="Menu principal">
            <ul className="divide-y divide-line">
              {MAIN_NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} onClick={close} className="flex min-h-12 items-center text-base font-medium text-deep-fjord">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}

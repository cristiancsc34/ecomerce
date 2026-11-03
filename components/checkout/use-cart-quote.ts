"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CartItem, CartQuote } from "@/lib/cart/types";

export type QuoteState =
  | { status: "loading" }
  | { status: "ready"; quote: CartQuote }
  | { status: "error"; message: string };

const key = (items: CartItem[]) => JSON.stringify(items);

/**
 * Cotação da sacola no servidor (POST /api/cart/quote), o mesmo fluxo da
 * página da sacola. Aqui NÃO se altera a sacola sozinho: se o servidor
 * removeu ou ajustou itens, a tela mostra o aviso e o cliente decide.
 */
export function useCartQuote(items: CartItem[], enabled: boolean) {
  const [state, setState] = useState<QuoteState>({ status: "loading" });
  const requestId = useRef(0);
  const itemsKey = key(items);

  const refresh = useCallback(async (current: CartItem[]) => {
    const id = ++requestId.current;
    try {
      const res = await fetch("/api/cart/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: current }),
      });
      const data = await res.json();
      if (id !== requestId.current) return;
      if (!res.ok) {
        setState({ status: "error", message: data?.error ?? "Não foi possível conferir os valores." });
        return;
      }
      setState({ status: "ready", quote: data as CartQuote });
    } catch {
      if (id !== requestId.current) return;
      setState({ status: "error", message: "Sem conexão com a loja. Verifique sua internet e tente de novo." });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const current = JSON.parse(itemsKey) as CartItem[];
    if (!current.length) return;
    const t = setTimeout(() => void refresh(current), 100);
    return () => clearTimeout(t);
  }, [enabled, itemsKey, refresh]);

  /** A cotação corresponde exatamente ao que está na sacola (nada removido nem ajustado). */
  const inSync = state.status === "ready" && key(state.quote.normalizedItems) === itemsKey && state.quote.issues.length === 0;

  return { state, inSync, refresh: (next?: CartItem[]) => refresh(next ?? (JSON.parse(itemsKey) as CartItem[])) };
}

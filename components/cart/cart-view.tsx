"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { brand, hasAnyContact } from "@/config/brand";
import { cart, useCartItems } from "@/lib/cart/store";
import { MAX_QUANTITY_PER_LINE, type CartItem, type CartQuote } from "@/lib/cart/types";
import { formatPrice } from "@/lib/catalog/money";
import { useHydrated } from "@/lib/use-hydrated";
import { Button, ButtonLink } from "@/components/ui/button";
import { BagIcon, MinusIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Notice } from "@/components/ui/notice";

type State =
  | { status: "loading" }
  | { status: "ready"; quote: CartQuote }
  | { status: "error"; message: string };

const key = (items: CartItem[]) => JSON.stringify(items);

export function CartView() {
  const hydrated = useHydrated();
  const items = useCartItems();
  const [state, setState] = useState<State>({ status: "loading" });
  const requestId = useRef(0);
  const itemsKey = key(items);

  const fetchQuote = useCallback(async (current: CartItem[]) => {
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
        setState({ status: "error", message: data?.error ?? "Não foi possível atualizar os valores." });
        return;
      }
      const quote = data as CartQuote;
      setState({ status: "ready", quote });
      // Remove do navegador o que o servidor não aceitou (sem preço, indisponível…).
      if (key(quote.normalizedItems) !== key(current)) cart.replace(quote.normalizedItems);
    } catch {
      if (id !== requestId.current) return;
      setState({ status: "error", message: "Sem conexão com a loja. Verifique sua internet e tente de novo." });
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const current = JSON.parse(itemsKey) as CartItem[];
    if (!current.length) return;
    const t = setTimeout(() => void fetchQuote(current), 150);
    return () => clearTimeout(t);
  }, [hydrated, itemsKey, fetchQuote]);

  if (!hydrated) return <CartSkeleton />;

  if (!items.length) {
    // Só mostra avisos quando foi o servidor que esvaziou a sacola (itens inválidos).
    const removed = state.status === "ready" && state.quote.lines.length === 0 ? state.quote.issues : [];
    return (
      <div className="space-y-5">
        {removed.length ? <Issues issues={removed} /> : null}
        <EmptyState
          icon={<BagIcon className="h-7 w-7" />}
          title="Sua sacola está vazia"
          action={<ButtonLink href="/produtos">Conhecer os produtos</ButtonLink>}
        >
          Escolha um colchão e o tamanho; ele aparece aqui com o valor calculado pela loja.
        </EmptyState>
      </div>
    );
  }

  if (state.status === "loading") return <CartSkeleton />;

  if (state.status === "error") {
    return (
      <Notice tone="danger" role="alert" title="Não foi possível atualizar a sacola">
        <p>{state.message}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void fetchQuote(items)}>
          Tentar de novo
        </Button>
      </Notice>
    );
  }

  const { quote } = state;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        {quote.issues.length ? <Issues issues={quote.issues} /> : null}
        {quote.hasDemoItems ? (
          <Notice tone="demo" title="Valores ilustrativos">
            A sacola contém produtos de demonstração. Os valores servem só para testar a loja.
          </Notice>
        ) : null}

        <ul className="divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-white">
          {quote.lines.map((line) => (
            <li key={`${line.productId}:${line.variantId}`} className="flex gap-4 p-4 sm:p-5">
              <div className="relative aspect-[4/3] w-24 shrink-0 self-start overflow-hidden rounded-xl bg-pale-blue sm:w-32">
                {line.imageUrl ? (
                  <Image
                    src={line.imageUrl}
                    alt={line.imageAlt}
                    fill
                    sizes="128px"
                    unoptimized={line.imageUrl.endsWith(".svg")}
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <Link href={`/produtos/${line.slug}`} className="font-semibold text-deep-fjord hover:underline">
                      {line.name}
                    </Link>
                    {line.variantName ? <p className="text-sm text-muted">{line.variantName}</p> : null}
                    <p className="text-sm text-muted">{formatPrice(line.unitPriceCents)} cada</p>
                  </div>
                  <p className="font-bold text-deep-fjord">{formatPrice(line.lineTotalCents)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <QuantityStepper
                    name={line.name}
                    quantity={line.quantity}
                    onChange={(q) => cart.setQuantity(line.productId, line.variantId, q)}
                  />
                  <button
                    type="button"
                    onClick={() => cart.remove(line.productId, line.variantId)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted hover:bg-pale-blue hover:text-danger"
                  >
                    <TrashIcon className="h-4 w-4" /> Remover
                    <span className="sr-only"> {line.name}</span>
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <aside aria-labelledby="resumo-titulo" className="lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-[1.25rem] border border-line bg-white p-5">
          <h2 id="resumo-titulo" className="text-lg font-bold">
            Resumo
          </h2>
          <dl className="space-y-2 text-[0.9375rem]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Subtotal</dt>
              <dd className="font-semibold text-ink">{formatPrice(quote.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Frete</dt>
              <dd className="text-right text-muted">Calculado pelo CEP na compra online</dd>
            </div>
          </dl>
          <p className="text-xs text-muted">Valores recalculados pela loja agora; o navegador não define preços.</p>
          <Button size="lg" className="w-full" disabled aria-describedby="checkout-indisponivel">
            Finalizar compra
          </Button>
          <p id="checkout-indisponivel" className="text-sm text-ink">
            A compra online ainda não está ativa. Para comprar, fale com o{" "}
            <Link href="/atendimento" className="link">
              atendimento da {brand.name}
            </Link>
            {hasAnyContact() ? "." : " (canais em configuração)."}
          </p>
        </div>
      </aside>
    </div>
  );
}

function Issues({ issues }: { issues: string[] }) {
  return (
    <Notice tone="warning" role="status" title="Sua sacola foi atualizada">
      <ul className="list-disc space-y-1 pl-5">
        {issues.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </Notice>
  );
}

function QuantityStepper({ name, quantity, onChange }: { name: string; quantity: number; onChange: (q: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-line" role="group" aria-label={`Quantidade de ${name}`}>
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={quantity <= 1}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-deep-fjord hover:bg-pale-blue disabled:opacity-40"
      >
        <MinusIcon className="h-4 w-4" />
        <span className="sr-only">Diminuir</span>
      </button>
      <span className="min-w-8 text-center font-semibold tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= MAX_QUANTITY_PER_LINE}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-deep-fjord hover:bg-pale-blue disabled:opacity-40"
      >
        <PlusIcon className="h-4 w-4" />
        <span className="sr-only">Aumentar</span>
      </button>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-busy="true" aria-label="Carregando sacola">
      <div className="space-y-3 rounded-[1.25rem] border border-line bg-white p-5">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-64 w-full rounded-[1.25rem]" />
    </div>
  );
}

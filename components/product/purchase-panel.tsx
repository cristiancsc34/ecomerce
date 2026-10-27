"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { cart } from "@/lib/cart/store";
import { formatPrice } from "@/lib/catalog/money";
import { availability, fromPriceCents, hasPriceRange, sortedVariants } from "@/lib/catalog/product-helpers";
import { SIZE_INFO, type Product, type ProductVariant } from "@/lib/catalog/types";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";

type PanelProduct = Pick<
  Product,
  "id" | "name" | "priceCents" | "compareAtPriceCents" | "stockQuantity" | "variants" | "isDemo"
>;

/** Lê ?tamanho= da URL para pré-selecionar (vindo do guia ou de um filtro). */
export function PurchasePanelWithParams({ product }: { product: PanelProduct }) {
  const params = useSearchParams();
  const size = params.get("tamanho");
  const preselected = product.variants.find((v) => v.size === size)?.id ?? null;
  return <PurchasePanel product={product} initialVariantId={preselected} />;
}

export function PurchasePanel({
  product,
  initialVariantId = null,
}: {
  product: PanelProduct;
  initialVariantId?: string | null;
}) {
  const variants = sortedVariants(product);
  const needsVariant = variants.length > 0;
  const [variantId, setVariantId] = useState<string | null>(
    initialVariantId ?? (variants.length === 1 ? variants[0].id : null),
  );
  const [feedback, setFeedback] = useState<"added" | "full" | null>(null);
  const [barVisible, setBarVisible] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const groupId = useId();

  const variant: ProductVariant | null = variants.find((v) => v.id === variantId) ?? null;
  const price = variant ? variant.priceCents : needsVariant ? null : product.priceCents;
  const status = availability(product, variant);
  const outOfStock = status === "out_of_stock";
  const noPrice = needsVariant ? false : product.priceCents === null;
  const canAdd = !noPrice && !outOfStock && (!needsVariant || variant !== null);

  // Barra fixa no celular quando o botão principal sai da tela para cima.
  useEffect(() => {
    const el = buttonRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      setBarVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function add() {
    if (!canAdd) return;
    const ok = cart.add(product.id, variant?.id ?? null, 1);
    setFeedback(ok ? "added" : "full");
  }

  const buttonLabel = noPrice
    ? "Preço em definição"
    : outOfStock
      ? "Indisponível no momento"
      : needsVariant && !variant
        ? "Escolha um tamanho"
        : "Adicionar à sacola";

  const priceText =
    price !== null
      ? formatPrice(price)
      : fromPriceCents(product) !== null
        ? `${hasPriceRange(product) ? "a partir de " : ""}${formatPrice(fromPriceCents(product)!)}`
        : null;

  const showCompare =
    !needsVariant && product.compareAtPriceCents !== null && product.priceCents !== null && product.compareAtPriceCents > product.priceCents;

  return (
    <div className="space-y-5">
      {needsVariant ? (
        <fieldset id={`${groupId}-sizes`} className="scroll-mt-28">
          <legend className="mb-2 font-semibold text-deep-fjord">Tamanho</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {variants.map((v) => {
              const vStatus = availability(product, v);
              const selected = v.id === variantId;
              return (
                <label
                  key={v.id}
                  className={`relative flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 px-4 py-2 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-air-blue ${
                    selected ? "border-deep-fjord bg-pale-blue" : "border-line bg-white hover:border-[#b9c9d6]"
                  } ${vStatus === "out_of_stock" ? "opacity-60" : ""}`}
                >
                  <input
                    type="radio"
                    name={`${groupId}-variant`}
                    value={v.id}
                    checked={selected}
                    onChange={() => {
                      setVariantId(v.id);
                      setFeedback(null);
                    }}
                    className="sr-only"
                  />
                  <span className="min-w-0 text-[0.9375rem] font-medium leading-snug text-ink">
                    {v.size ? SIZE_INFO[v.size].label : v.name}
                    {v.widthCm && v.lengthCm ? (
                      <span className="block text-sm font-normal text-muted">
                        {v.widthCm} × {v.lengthCm} cm
                      </span>
                    ) : null}
                    {vStatus === "out_of_stock" ? <span className="block text-xs text-muted">Indisponível</span> : null}
                  </span>
                  <span className="flex items-center gap-2 text-[0.9375rem] font-semibold text-deep-fjord">
                    {formatPrice(v.priceCents)}
                    {selected ? <CheckIcon className="h-5 w-5" /> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div>
        <p className="text-3xl font-bold text-deep-fjord" aria-live="polite">
          {priceText ?? <span className="text-xl text-muted">Preço em definição</span>}
          {showCompare ? (
            <span className="ml-2 text-base font-medium text-muted line-through">
              <span className="sr-only">Preço anterior: </span>
              {formatPrice(product.compareAtPriceCents!)}
            </span>
          ) : null}
        </p>
        {product.isDemo ? <p className="mt-1 text-sm font-medium text-muted">Preço ilustrativo (demonstração)</p> : null}
        {status === "in_stock" ? <p className="mt-1 text-sm font-medium text-success">Disponível</p> : null}
        {outOfStock ? <p className="mt-1 text-sm font-medium text-danger">Indisponível no momento</p> : null}
      </div>

      <div ref={buttonRef}>
        <Button size="lg" className="w-full" onClick={add} disabled={!canAdd} aria-describedby={`${groupId}-feedback`}>
          {buttonLabel}
        </Button>
      </div>

      {/* Espaço reservado: a mensagem não empurra o conteúdo ao aparecer. */}
      <div id={`${groupId}-feedback`} role="status" className="min-h-6 text-sm">
        {feedback === "added" ? (
          <p className="flex flex-wrap items-center gap-2 font-medium text-success">
            <CheckIcon className="h-5 w-5" /> Adicionado à sacola.
            <Link href="/carrinho" className="link">
              Ver sacola
            </Link>
          </p>
        ) : feedback === "full" ? (
          <p className="font-medium text-danger">Sua sacola atingiu o limite de itens diferentes.</p>
        ) : null}
      </div>

      <p className="text-sm text-muted">
        A compra online ainda está em preparação: a sacola mostra os valores e você finaliza com o{" "}
        <Link href="/atendimento" className="link">
          atendimento
        </Link>
        . Frete e prazo serão calculados pelo CEP quando a compra online for ativada.
      </p>

      {/* Barra fixa (celular) quando o botão principal sai da tela. */}
      <div
        aria-hidden={!barVisible}
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/97 px-4 py-3 shadow-[0_-8px_24px_rgb(19_41_64/0.08)] backdrop-blur transition-transform duration-200 lg:hidden ${
          barVisible ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
      >
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {product.name}
              {variant ? ` · ${variant.name}` : ""}
            </p>
            <p className="font-bold text-deep-fjord">{priceText ?? "Preço em definição"}</p>
          </div>
          {needsVariant && !variant ? (
            <Button
              tabIndex={barVisible ? 0 : -1}
              onClick={() => {
                const el = document.getElementById(`${groupId}-sizes`);
                el?.scrollIntoView({ block: "start" });
                el?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
              }}
            >
              Escolher tamanho
            </Button>
          ) : (
            <Button onClick={add} disabled={!canAdd} tabIndex={barVisible ? 0 : -1}>
              Adicionar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

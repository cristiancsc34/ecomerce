"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { cart } from "@/lib/cart/store";
import { formatPrice } from "@/lib/catalog/money";
import { availability, fromPriceCents, hasPriceRange, sortedVariants } from "@/lib/catalog/product-helpers";
import { SIZE_INFO, type Product, type ProductVariant } from "@/lib/catalog/types";
import { Button, buttonClasses } from "@/components/ui/button";
import { BagIcon, CheckIcon, CubeIcon } from "@/components/ui/icons";
import { NO_PRICE_LABEL } from "./price";
import { useVariantSelection } from "./variant-selection";

type PanelProduct = Pick<
  Product,
  "id" | "name" | "priceCents" | "compareAtPriceCents" | "stockQuantity" | "variants" | "isDemo"
>;

type PanelProps = { product: PanelProduct; has3d?: boolean };

/** Lê ?tamanho= da URL para pré-selecionar (vindo de um link com o tamanho). */
export function PurchasePanelWithParams(props: PanelProps) {
  const params = useSearchParams();
  const size = params.get("tamanho");
  const preselected = props.product.variants.find((v) => v.size === size)?.id ?? null;
  return <PurchasePanel {...props} initialVariantId={preselected} />;
}

/**
 * Preço, tamanhos e compra. No celular os botões ficam numa barra fixa no
 * rodapé (sempre à mão); no computador, logo abaixo do preço.
 */
export function PurchasePanel({
  product,
  has3d = false,
  initialVariantId = null,
}: PanelProps & { initialVariantId?: string | null }) {
  const router = useRouter();
  const variants = sortedVariants(product);
  const needsVariant = variants.length > 0;
  // Variações de cor ou tecido viram o seletor "Cor" (com amostras); as demais, "Tamanho".
  const byColor = needsVariant && variants.every((v) => v.colorHex);
  const shared = useVariantSelection();
  const [localId, setLocalId] = useState<string | null>(
    initialVariantId ?? (variants.length === 1 ? variants[0].id : null),
  );
  const variantId = shared ? shared.variantId : localId;
  const setVariantId = shared ? shared.setVariantId : setLocalId;
  const [feedback, setFeedback] = useState<"added" | "full" | null>(null);
  const groupId = useId();

  // Tamanho vindo do link (?tamanho=): entra na seleção compartilhada.
  useEffect(() => {
    if (shared && initialVariantId && !shared.variantId) shared.setVariantId(initialVariantId);
    // Só na chegada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const variant: ProductVariant | null = variants.find((v) => v.id === variantId) ?? null;
  const price = variant ? variant.priceCents : needsVariant ? null : product.priceCents;
  const status = availability(product, variant);
  const outOfStock = status === "out_of_stock";
  // Sem preço: o produto (sem variações) ou a variação escolhida.
  const noPrice = needsVariant ? variant !== null && variant.priceCents === null : product.priceCents === null;
  const mustChooseSize = needsVariant && !variant;
  const canAdd = !noPrice && !outOfStock && !mustChooseSize;

  function add(): boolean {
    if (!canAdd) return false;
    const ok = cart.add(product.id, variant?.id ?? null, 1);
    setFeedback(ok ? "added" : "full");
    return ok;
  }

  function buyNow() {
    if (add()) router.push("/carrinho");
  }

  function chooseSize() {
    const el = document.getElementById(`${groupId}-sizes`);
    el?.scrollIntoView({ block: "center" });
    el?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }

  const blockedLabel = noPrice ? NO_PRICE_LABEL : outOfStock ? "Indisponível no momento" : null;

  const priceText =
    price !== null
      ? formatPrice(price)
      : variant === null && fromPriceCents(product) !== null
        ? `${hasPriceRange(product) ? "a partir de " : ""}${formatPrice(fromPriceCents(product)!)}`
        : null;

  const showCompare =
    !needsVariant && product.compareAtPriceCents !== null && product.priceCents !== null && product.compareAtPriceCents > product.priceCents;

  const barButton = "h-full flex-1 rounded-none! px-2! text-sm!";

  /** Botões de compra: no rodapé fixo (celular) ou abaixo do preço (computador). */
  function actions(place: "bar" | "inline") {
    const bar = place === "bar";
    if (mustChooseSize) {
      return (
        <Button size="lg" onClick={chooseSize} className={bar ? barButton : "flex-1"}>
          {byColor ? "Escolha uma cor" : "Escolha um tamanho"}
        </Button>
      );
    }
    return (
      <>
        <Button
          variant="soft"
          size="lg"
          onClick={add}
          aria-describedby={`${groupId}-feedback`}
          className={bar ? barButton : "flex-1"}
        >
          <BagIcon className="h-5 w-5 shrink-0" /> Adicionar à sacola
        </Button>
        <Button size="lg" onClick={buyNow} className={bar ? barButton : "flex-1"}>
          Comprar agora
        </Button>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-cloud px-4 py-3">
        <p className="text-3xl font-bold text-air-blue-ink" aria-live="polite" data-testid="preco-atual">
          {priceText ?? <span className="text-xl font-semibold text-muted">{NO_PRICE_LABEL}</span>}
          {showCompare ? (
            <span className="ml-2 text-base font-medium text-muted line-through">
              <span className="sr-only">Preço anterior: </span>
              {formatPrice(product.compareAtPriceCents!)}
            </span>
          ) : null}
        </p>
        {status === "in_stock" ? <p className="mt-1 text-sm font-medium text-success">Disponível</p> : null}
        {outOfStock ? <p className="mt-1 text-sm font-medium text-danger">Indisponível no momento</p> : null}
      </div>

      {byColor ? (
        <fieldset id={`${groupId}-sizes`} className="scroll-mt-28" data-testid="seletor-cor">
          <legend className="mb-2 font-semibold text-deep-fjord">
            Cor{variant ? <span className="font-normal text-ink">: {variant.name}</span> : null}
          </legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const vStatus = availability(product, v);
              const selected = v.id === variantId;
              return (
                <label
                  key={v.id}
                  title={v.name}
                  className={`relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-2 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-air-blue ${
                    selected ? "border-air-blue-ink" : "border-line hover:border-[#b9c9d6]"
                  } ${vStatus === "out_of_stock" ? "opacity-50" : ""}`}
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
                  <span aria-hidden="true" className="h-9 w-9 rounded-full ring-1 ring-ink/15" style={{ backgroundColor: v.colorHex! }} />
                  <span className="sr-only">
                    {v.name}
                    {v.priceCents !== null ? `, ${formatPrice(v.priceCents)}` : ""}
                    {vStatus === "out_of_stock" ? ", indisponível" : ""}
                  </span>
                  {selected ? (
                    <CheckIcon aria-hidden="true" className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-air-blue-ink p-0.5 text-white" />
                  ) : null}
                </label>
              );
            })}
          </div>
          {variants.some((v) => v.example) ? (
            <p className="mt-2 text-xs text-muted">Cores de exemplo, só no ambiente de desenvolvimento (imagens recoloridas).</p>
          ) : null}
        </fieldset>
      ) : needsVariant ? (
        <fieldset id={`${groupId}-sizes`} className="scroll-mt-28">
          <legend className="mb-2 font-semibold text-deep-fjord">Tamanho</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {variants.map((v) => {
              const vStatus = availability(product, v);
              const selected = v.id === variantId;
              return (
                <label
                  key={v.id}
                  className={`relative flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-lg border-2 px-4 py-2 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-air-blue ${
                    selected ? "border-air-blue-ink bg-pale-blue" : "border-line bg-white hover:border-[#b9c9d6]"
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
                    {v.priceCents === null ? NO_PRICE_LABEL : formatPrice(v.priceCents)}
                    {selected ? <CheckIcon className="h-5 w-5" /> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="hidden gap-3 lg:flex">
        {blockedLabel ? null : actions("inline")}
        {has3d ? (
          <a
            href="#visualizador-3d"
            className={buttonClasses({ variant: blockedLabel ? "primary" : "ghost", size: "lg", className: "whitespace-nowrap" })}
          >
            <CubeIcon className="h-5 w-5" /> Ver em 3D
          </a>
        ) : null}
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

      {/* Barra fixa no celular: compra; sem preço, o destaque vai para o 3D (ou não há barra). */}
      {blockedLabel && !has3d ? null : (
        <div
          data-barra-fixa
          className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t border-line bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgb(19_41_64/0.08)] lg:hidden"
        >
          {blockedLabel ? (
            <>
              <p className="flex flex-1 items-center justify-center px-2 text-sm font-semibold text-muted">{blockedLabel}</p>
              <a href="#visualizador-3d" className={buttonClasses({ size: "lg", className: barButton })}>
                <CubeIcon className="h-5 w-5" /> Girar em 3D
              </a>
            </>
          ) : (
            <>
              {has3d ? (
                <a
                  href="#visualizador-3d"
                  className="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-deep-fjord"
                >
                  <CubeIcon className="h-5 w-5" /> 3D
                </a>
              ) : null}
              {actions("bar")}
            </>
          )}
        </div>
      )}
    </div>
  );
}

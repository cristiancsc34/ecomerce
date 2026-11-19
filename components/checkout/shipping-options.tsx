"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/catalog/money";
import { shippingOptionsPublicAction } from "@/lib/orders/checkout-actions";
import { shippingEta, shippingPriceLabel, type ShippingOption } from "@/lib/shipping/types";

/** CEP guardado só nesta aba, para a sacola e o checkout usarem o mesmo (nenhum outro dado pessoal). */
const CEP_KEY = "azconfort:cep";

export function rememberCep(cep: string) {
  try {
    sessionStorage.setItem(CEP_KEY, cep.replace(/\D/g, "").slice(0, 8));
  } catch {
    // Navegação privada sem armazenamento: só não lembra o CEP.
  }
}

export function rememberedCep(): string {
  try {
    return sessionStorage.getItem(CEP_KEY) ?? "";
  } catch {
    return "";
  }
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; options: ShippingOption[] };

/** Formas de entrega (sem a retirada) que atendem o CEP, como o dono cadastrou no painel. */
export function useShippingOptions(cep: string): State {
  const digits = cep.replace(/\D/g, "");
  const [state, setState] = useState<{ cep: string; value: State }>({ cep: "", value: { status: "idle" } });

  useEffect(() => {
    if (digits.length !== 8) return;
    let active = true;
    const timer = setTimeout(async () => {
      setState({ cep: digits, value: { status: "loading" } });
      try {
        const r = await shippingOptionsPublicAction(digits);
        if (!active) return;
        setState({
          cep: digits,
          value: r.ok ? { status: "done", options: r.data.options.filter((o) => o.method !== "retirada") } : { status: "error", message: r.error },
        });
      } catch {
        if (active) setState({ cep: digits, value: { status: "error", message: "Não foi possível calcular o frete agora." } });
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [digits]);

  if (digits.length !== 8) return { status: "idle" };
  return state.cep === digits ? state.value : { status: "loading" };
}

const NONE_TEXT =
  "Ainda não há frete cadastrado para este CEP. O valor e o prazo são combinados com você pelo WhatsApp, antes do pagamento.";

/** Escolha da forma de entrega no checkout. `selectedId` null = nenhuma escolhida (frete a combinar). */
export function ShippingChoice({
  state,
  selectedId,
  onSelect,
}: {
  state: State;
  selectedId: string | null;
  onSelect: (option: ShippingOption | null) => void;
}) {
  if (state.status === "idle") {
    return <p className="text-sm text-muted">Informe o CEP para ver as formas de entrega e o valor do frete.</p>;
  }
  if (state.status === "loading") {
    return (
      <p role="status" className="text-sm text-muted">
        Calculando o frete…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p role="status" className="text-sm font-medium text-danger">
        {state.message}
      </p>
    );
  }
  if (!state.options.length) {
    return (
      <p role="status" className="rounded-xl bg-pale-blue p-3 text-sm text-ink">
        {NONE_TEXT}
      </p>
    );
  }
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink">Forma de entrega</legend>
      <div className="space-y-2">
        {state.options.map((o) => {
          const eta = shippingEta(o);
          const checked = selectedId === o.id;
          return (
            <label
              key={o.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${checked ? "border-deep-fjord bg-pale-blue" : "border-line"}`}
            >
              <input
                type="radio"
                name="shippingOption"
                value={o.id}
                checked={checked}
                onChange={() => onSelect(o)}
                className="mt-1 h-5 w-5 accent-deep-fjord"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-semibold text-ink">{o.name}</span>
                  <span className="font-semibold text-air-blue-ink">{shippingPriceLabel(o, formatPrice)}</span>
                </span>
                {eta ? <span className="block text-sm text-muted">Chega {eta} após a confirmação do pagamento</span> : null}
                {o.details ? <span className="block text-sm text-muted">{o.details}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Calculadora de frete da sacola: só informa (a escolha é feita ao finalizar). */
export function ShippingEstimate() {
  // Só aparece depois de a sacola carregar no navegador: dá para ler o CEP guardado já no primeiro render.
  const [cep, setCep] = useState(() => formatCepInput(rememberedCep()));
  const [submitted, setSubmitted] = useState(() => (rememberedCep().length === 8 ? rememberedCep() : ""));
  const state = useShippingOptions(submitted);

  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const digits = cep.replace(/\D/g, "");
          setSubmitted(digits);
          if (digits.length === 8) rememberCep(digits);
        }}
      >
        <label htmlFor="sacola-cep" className="sr-only">
          CEP para calcular o frete
        </label>
        <input
          id="sacola-cep"
          value={cep}
          onChange={(e) => setCep(formatCepInput(e.target.value))}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="Seu CEP"
          maxLength={9}
          className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3 text-base"
        />
        <button type="submit" className="h-11 shrink-0 rounded-lg bg-pale-blue px-4 text-sm font-semibold text-deep-fjord hover:bg-sky-mist">
          Calcular
        </button>
      </form>
      {submitted && submitted.length !== 8 ? <p className="text-sm font-medium text-danger">Digite o CEP com 8 números.</p> : null}
      {state.status === "loading" ? <p className="text-sm text-muted">Calculando o frete…</p> : null}
      {state.status === "error" ? <p className="text-sm font-medium text-danger">{state.message}</p> : null}
      {state.status === "done" ? (
        state.options.length ? (
          <ul className="space-y-1 text-sm" aria-live="polite">
            {state.options.map((o) => {
              const eta = shippingEta(o);
              return (
                <li key={o.id} className="flex justify-between gap-3">
                  <span className="text-ink">
                    {o.name}
                    {eta ? <span className="block text-muted">{eta}</span> : null}
                  </span>
                  <span className="shrink-0 font-semibold text-air-blue-ink">{shippingPriceLabel(o, formatPrice)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted" aria-live="polite">
            {NONE_TEXT}
          </p>
        )
      ) : null}
    </div>
  );
}

function formatCepInput(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

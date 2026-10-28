"use client";

import { useActionState, useState } from "react";
import { pinSignInAction, type PinState } from "@/lib/admin/actions/auth";
import { useHydrated } from "@/lib/use-hydrated";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

const initial: PinState = { error: null };

/** Entrada rápida por PIN numérico (ver lib/admin/pin.ts). */
export function PinForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(pinSignInAction, initial);
  const [pin, setPin] = useState("");
  const hydrated = useHydrated();
  return (
    <form action={action} className="mt-6 space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? (
        <Notice tone="danger" role="alert" title={state.error} />
      ) : null}
      <div>
        <label htmlFor="admin-pin" className="mb-2 block font-semibold text-deep-fjord">
          PIN de acesso
        </label>
        <input
          id="admin-pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={12}
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          aria-invalid={state.error ? true : undefined}
          className="h-16 w-full rounded-xl border border-line bg-cloud text-center text-3xl font-bold tracking-[0.6em] text-deep-fjord placeholder:tracking-[0.6em] placeholder:text-line focus:border-air-blue focus:bg-white"
          placeholder="••••"
        />
      </div>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={pending}
        loadingLabel="Entrando…"
        disabled={!hydrated || pin.length < 4}
      >
        Entrar
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { trackOrderAction, type TrackLookupState } from "@/lib/orders/actions";
import { Button } from "@/components/ui/button";
import { controlClasses, Label } from "@/components/ui/field";

const initial: TrackLookupState = { error: null, code: "", phone: "" };

export function TrackOrderForm() {
  const [state, action, pending] = useActionState(trackOrderAction, initial);
  return (
    <form action={action} className="space-y-4" aria-label="Acompanhar pedido">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="t-codigo">Número do pedido</Label>
          <input id="t-codigo" name="codigo" defaultValue={state.code} placeholder="PED-1001" autoCapitalize="characters" className={controlClasses} required />
        </div>
        <div>
          <Label htmlFor="t-celular">Celular usado na compra</Label>
          <input id="t-celular" name="celular" defaultValue={state.phone} inputMode="tel" placeholder="(11) 98765-4321" className={controlClasses} required />
        </div>
      </div>
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" loading={pending} loadingLabel="Procurando…">
        Acompanhar pedido
      </Button>
    </form>
  );
}

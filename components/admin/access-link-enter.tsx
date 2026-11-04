"use client";

import { useActionState } from "react";
import { entrarPeloLinkAction, type EntradaPeloLinkState } from "@/lib/admin/actions/access-links";
import { useHydrated } from "@/lib/use-hydrated";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

const initial: EntradaPeloLinkState = { error: null };

/** Botão "Entrar" da página do link de acesso (o clique entra; abrir o link só mostra a página). */
export function AccessLinkEnterForm({ codigo }: { codigo: string }) {
  const [state, action, pending] = useActionState(entrarPeloLinkAction, initial);
  const hydrated = useHydrated();
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="codigo" value={codigo} />
      {state.error ? <Notice tone="danger" role="alert" title={state.error} /> : null}
      <Button type="submit" size="lg" className="w-full" loading={pending} loadingLabel="Entrando…" disabled={!hydrated}>
        Entrar no painel
      </Button>
    </form>
  );
}

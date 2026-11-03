"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";

/**
 * Copia o link do pedido (o endereço desta página, sem o "?novo=1").
 * `path` é o caminho com o código secreto: /pedido/PED-1001?t=…
 */
export function CopyOrderLink({ path }: { path: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    const link = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant="secondary" onClick={copy}>
        {state === "copied" ? <CheckIcon className="h-5 w-5" /> : <CopyIcon className="h-5 w-5" />}
        {state === "copied" ? "Link copiado!" : "Copiar link do pedido"}
      </Button>
      <span role="status" className="text-xs text-muted">
        {state === "failed" ? "Não deu para copiar. Salve esta página nos favoritos." : ""}
      </span>
    </span>
  );
}

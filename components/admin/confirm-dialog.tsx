"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Botão que pede confirmação num <dialog> nativo antes de ações destrutivas.
 * Foco preso no diálogo, Esc cancela, o foco volta ao botão ao fechar.
 */
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
  variant = "danger",
  triggerVariant = "secondary",
  size = "sm",
  disabled,
  requireCheck,
}: {
  label: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  variant?: "danger" | "primary";
  triggerVariant?: "secondary" | "ghost" | "danger" | "primary" | "soft";
  size?: "sm" | "md";
  disabled?: boolean;
  /** Texto de uma caixa que precisa ser marcada antes de confirmar. */
  requireCheck?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const id = useId();

  return (
    <>
      <Button
        variant={triggerVariant}
        size={size}
        disabled={disabled}
        onClick={() => {
          setChecked(false);
          ref.current?.showModal();
        }}
      >
        {label}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        className="m-auto w-[min(92vw,30rem)] rounded-[1.25rem] border-0 bg-white p-0 shadow-[var(--shadow-lift)] backdrop:bg-deep-fjord/60"
      >
        <div className="p-6">
          <h2 id={`${id}-t`} className="text-xl font-bold">
            {title}
          </h2>
          <div id={`${id}-d`} className="mt-2 text-ink">
            {description}
          </div>
          {requireCheck ? (
            <label className="mt-4 flex items-start gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-[var(--color-deep-fjord)]"
              />
              <span>{requireCheck}</span>
            </label>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={() => ref.current?.close()} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant={variant}
              loading={busy}
              loadingLabel="Aguarde…"
              disabled={Boolean(requireCheck) && !checked}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                } finally {
                  setBusy(false);
                  ref.current?.close();
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

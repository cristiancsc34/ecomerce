"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, CloseIcon, CopyIcon } from "@/components/ui/icons";

/**
 * Passa do computador para o celular em um passo: código QR (gerado aqui no
 * navegador, sem serviço externo) que abre a página do produto pronta para o AR.
 * <dialog> nativo: foco preso, Esc fecha; clique fora e o botão também fecham.
 * Ao fechar, o foco volta para o botão que abriu.
 */
export function ArQrDialog({
  open,
  onClose,
  link,
  productLabel,
  realScale,
  phone,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  /** Endereço completo que o código QR abre. */
  link: string;
  /** Nome do produto com artigo ("a Poltrona Azul"). */
  productLabel: string;
  /** Modelo conferido com as medidas do catálogo: no celular aparece em tamanho real. */
  realScale: boolean;
  /** Aberto num celular que não tem realidade aumentada. */
  phone: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [qr, setQr] = useState<{ link: string; src: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<"ok" | "manual" | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A biblioteca do QR só é baixada quando o modal abre.
  useEffect(() => {
    if (!open || qr?.link === link) return;
    let alive = true;
    import("qrcode")
      .then((QRCode) => QRCode.toString(link, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#132940", light: "#ffffff" } }))
      .then((svg) => {
        if (alive) setQr({ link, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [open, link, qr?.link]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("ok");
    } catch {
      setCopied("manual");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-[min(92vw,26rem)] max-w-none rounded-[1.25rem] border-0 bg-white p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-deep-fjord/70"
      onClose={() => {
        setCopied(null);
        onClose();
        returnFocusRef.current?.focus();
      }}
      onClick={(e) => {
        // Clique no fundo escuro (fora da caixa) fecha.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="relative p-5 sm:p-6">
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-deep-fjord hover:bg-pale-blue focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-air-blue"
        >
          <CloseIcon className="h-6 w-6" />
          <span className="sr-only">Fechar</span>
        </button>
        <h2 id={titleId} className="pr-12 text-lg font-bold text-deep-fjord">
          Ver no seu ambiente
        </h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed">
          {phone ? "Este celular não abre a realidade aumentada. Em outro celular, aponte a câmera" : "Aponte a câmera do celular"}{" "}
          para o código e veja {productLabel} no seu cômodo{realScale ? ", em tamanho real" : ""}.
          {realScale ? null : " O tamanho na câmera é aproximado."}
        </p>

        <div className="mx-auto mt-4 flex aspect-square w-full max-w-[15rem] items-center justify-center rounded-xl border border-line bg-white p-2">
          {qr?.link === link ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR gerado no navegador (data: URI), não é foto
            <img src={qr.src} alt="Código QR para abrir esta página no celular" className="h-full w-full" />
          ) : failed ? (
            <p className="text-center text-sm text-muted">Não foi possível gerar o código. Use o link abaixo.</p>
          ) : (
            <p role="status" className="text-sm text-muted">
              Gerando o código…
            </p>
          )}
        </div>

        <p className="mt-4 text-sm font-medium text-muted">Ou abra este link no celular:</p>
        <p className="mt-1 select-all break-all rounded-lg bg-cloud px-3 py-2 font-mono text-sm text-ink" data-testid="link-ar">
          {link}
        </p>
        <Button type="button" variant="secondary" className="mt-3 w-full" onClick={copy}>
          {copied === "ok" ? <CheckIcon className="h-5 w-5" /> : <CopyIcon className="h-5 w-5" />}
          {copied === "ok" ? "Link copiado" : "Copiar link"}
        </Button>
        <p role="status" className="mt-2 min-h-5 text-center text-sm">
          {copied === "ok" ? "Link copiado. Envie para o seu celular." : copied === "manual" ? "Selecione o link acima e copie." : ""}
        </p>
      </div>
    </dialog>
  );
}

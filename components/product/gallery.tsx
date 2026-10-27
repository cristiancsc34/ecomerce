"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { ProductMedia } from "@/lib/catalog/types";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ImageIcon, ZoomIcon } from "@/components/ui/icons";

/**
 * Galeria acessível: miniaturas são botões, há anterior/próxima, e o zoom
 * abre num <dialog> nativo (foco preso, Esc fecha). Sem rotação automática.
 */
export function Gallery({ media, productName }: { media: ProductMedia[]; productName: string }) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const current = media[index] ?? null;
  const total = media.length;

  const go = (delta: number) => setIndex((i) => (i + delta + total) % total);

  const openZoom = () => {
    setZoomed(false);
    dialogRef.current?.showModal();
  };

  if (!current) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-[1.5rem] bg-pale-blue text-muted">
        <ImageIcon className="h-12 w-12" />
        <span>Fotos em breve</span>
      </div>
    );
  }

  return (
    <div>
      <div
        className="relative aspect-[4/3] overflow-hidden rounded-[1.5rem] border border-line bg-pale-blue"
        onKeyDown={(e) => {
          if (total < 2) return;
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
      >
        {current.type === "video" ? (
          <video
            key={current.id}
            src={current.url}
            controls
            playsInline
            preload="none"
            aria-label={current.altText}
            className="h-full w-full bg-deep-fjord object-contain"
          />
        ) : (
          <Image
            key={current.id}
            src={current.url}
            alt={current.altText}
            fill
            sizes="(min-width: 1024px) 640px, 100vw"
            loading={index === 0 ? "eager" : "lazy"}
            fetchPriority={index === 0 ? "high" : undefined}
            unoptimized={current.url.endsWith(".svg")}
            className="object-cover"
          />
        )}

        {current.isIllustrative ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-semibold text-ink shadow-sm">
            Imagem ilustrativa
          </span>
        ) : null}

        {current.type === "image" ? (
          <button
            type="button"
            onClick={openZoom}
            className="absolute bottom-3 right-3 inline-flex h-11 items-center gap-2 rounded-full bg-white/95 px-4 text-sm font-semibold text-deep-fjord shadow-sm hover:bg-white"
          >
            <ZoomIcon className="h-5 w-5" />
            Ampliar
          </button>
        ) : null}

        {total > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-deep-fjord shadow-sm hover:bg-white"
            >
              <ChevronLeftIcon className="h-6 w-6" />
              <span className="sr-only">Imagem anterior</span>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-deep-fjord shadow-sm hover:bg-white"
            >
              <ChevronRightIcon className="h-6 w-6" />
              <span className="sr-only">Próxima imagem</span>
            </button>
          </>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        Mostrando mídia {index + 1} de {total}: {current.altText}
      </p>

      {total > 1 ? (
        <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5" aria-label={`Fotos de ${productName}`}>
          {media.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
                aria-label={`Mostrar mídia ${i + 1} de ${total}${m.type === "video" ? " (vídeo)" : ""}`}
                className={`relative block aspect-[4/3] w-full overflow-hidden rounded-xl border-2 bg-pale-blue ${
                  i === index ? "border-deep-fjord" : "border-transparent hover:border-line"
                }`}
              >
                {m.type === "image" ? (
                  <Image
                    src={m.url}
                    alt=""
                    fill
                    sizes="120px"
                    unoptimized={m.url.endsWith(".svg")}
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs font-semibold text-deep-fjord">Vídeo</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <dialog
        ref={dialogRef}
        aria-label={`Imagem ampliada: ${current.altText}`}
        className="m-auto h-[min(92dvh,900px)] w-[min(96vw,1200px)] max-w-none rounded-[1.25rem] border-0 bg-white p-0 backdrop:bg-deep-fjord/70"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
            <p className="truncate text-sm font-medium text-ink">{productName}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setZoomed((z) => !z)}
                aria-pressed={zoomed}
                className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-deep-fjord hover:bg-pale-blue"
              >
                <ZoomIcon className="h-5 w-5" />
                {zoomed ? "Tamanho normal" : "Aproximar 2×"}
              </button>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-deep-fjord hover:bg-pale-blue"
              >
                <CloseIcon className="h-6 w-6" />
                <span className="sr-only">Fechar</span>
              </button>
            </div>
          </div>
          {/* Área rolável por teclado quando aproximada. */}
          <div className="relative flex-1 overflow-auto bg-cloud" tabIndex={0} aria-label="Imagem; use as setas para mover quando aproximada">
            <div className={zoomed ? "relative h-[200%] w-[200%]" : "relative h-full w-full"}>
              {current.type === "image" ? (
                <Image
                  src={current.url}
                  alt={current.altText}
                  fill
                  sizes="100vw"
                  unoptimized={current.url.endsWith(".svg")}
                  className="object-contain"
                />
              ) : null}
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}

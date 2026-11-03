"use client";

import Image from "next/image";
import { useRef, useState, type ReactNode } from "react";
import type { ProductMedia } from "@/lib/catalog/types";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ImageIcon, ZoomIcon } from "@/components/ui/icons";

/**
 * Galeria acessível: miniaturas são botões, há anterior/próxima, e o zoom
 * abre num <dialog> nativo (foco preso, Esc fecha). Sem rotação automática.
 *
 * `stage` ocupa o lugar da foto principal (ex.: o visualizador 3D) e `actions`
 * fica sobre a foto, no canto inferior (botões de 3D e realidade aumentada).
 */
export function Gallery({
  media,
  productName,
  stage = null,
  actions = null,
  onSelectPhoto,
}: {
  media: ProductMedia[];
  productName: string;
  stage?: ReactNode;
  actions?: ReactNode;
  /** Escolheu uma miniatura: quem mostra o `stage` volta para as fotos. */
  onSelectPhoto?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);
  const current = media[index] ?? null;
  const total = media.length;

  const go = (delta: number) => setIndex((i) => (i + delta + total) % total);

  const openZoom = () => {
    setZoomed(false);
    dialogRef.current?.showModal();
  };

  if (!current) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden bg-pale-blue lg:rounded-lg">
        {stage ?? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
            <ImageIcon className="h-12 w-12" />
            <span>Fotos em breve</span>
          </div>
        )}
        {actions}
      </div>
    );
  }
  const showingPhoto = stage === null;

  return (
    <div>
      <div
        className="relative aspect-[4/3] touch-pan-y overflow-hidden bg-pale-blue lg:rounded-lg"
        onKeyDown={(e) => {
          if (total < 2 || !showingPhoto) return;
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
        // Deslizar para os lados troca a foto (celular).
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          const end = e.changedTouches[0]?.clientX;
          // No 3D, arrastar gira o modelo: não troca a foto.
          if (start === null || end === undefined || total < 2 || !showingPhoto) return;
          if (Math.abs(end - start) > 40) go(end < start ? 1 : -1);
        }}
      >
        {!showingPhoto ? (
          stage
        ) : current.type === "video" ? (
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

        {!showingPhoto ? null : current.isIllustrative ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-semibold text-ink shadow-sm">
            Imagem ilustrativa
          </span>
        ) : current.aiGenerated ? (
          // No alto: o canto de baixo fica para os botões de 3D e realidade aumentada.
          <span className="absolute left-3 top-3 rounded bg-white/90 px-2 py-0.5 text-[0.6875rem] font-medium text-muted">
            Cena recriada a partir das fotos reais
          </span>
        ) : null}

        {showingPhoto && current.type === "image" ? (
          <button
            type="button"
            onClick={openZoom}
            className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-deep-fjord shadow-sm hover:bg-white"
          >
            <ZoomIcon className="h-5 w-5" />
            <span className="sr-only">Ampliar</span>
          </button>
        ) : null}

        {showingPhoto && total > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-deep-fjord shadow-sm hover:bg-white sm:inline-flex"
            >
              <ChevronLeftIcon className="h-6 w-6" />
              <span className="sr-only">Imagem anterior</span>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-deep-fjord shadow-sm hover:bg-white sm:inline-flex"
            >
              <ChevronRightIcon className="h-6 w-6" />
              <span className="sr-only">Próxima imagem</span>
            </button>
            <span
              aria-hidden="true"
              // Com os botões de 3D no canto, o contador some no celular (as miniaturas já mostram a posição).
              className={`absolute bottom-3 right-3 rounded-full bg-ink/60 px-2.5 py-0.5 text-xs font-semibold text-white ${actions ? "max-sm:hidden" : ""}`}
            >
              {index + 1}/{total}
            </span>
          </>
        ) : null}

        {actions}
      </div>

      {showingPhoto ? (
        <p className="sr-only" aria-live="polite">
          Mostrando mídia {index + 1} de {total}: {current.altText}
        </p>
      ) : null}

      {total > 1 ? (
        <ul className="mt-2 grid grid-cols-5 gap-2 px-4 lg:px-0" aria-label={`Fotos de ${productName}`}>
          {media.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  setIndex(i);
                  onSelectPhoto?.();
                }}
                aria-pressed={showingPhoto && i === index}
                aria-label={`Mostrar mídia ${i + 1} de ${total}${m.type === "video" ? " (vídeo)" : ""}`}
                className={`relative block aspect-square w-full overflow-hidden rounded-md border-2 bg-pale-blue ${
                  showingPhoto && i === index ? "border-air-blue-ink" : "border-transparent hover:border-line"
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

"use client";

import { useState } from "react";
import type { ProductMedia } from "@/lib/catalog/types";
import { Button } from "@/components/ui/button";
import { CubeIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { ProductImage } from "./product-image";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src: string;
        alt: string;
        "camera-controls"?: boolean;
        "auto-rotate"?: boolean;
        "touch-action"?: string;
        "shadow-intensity"?: string;
        exposure?: string;
        "interaction-prompt"?: string;
      };
    }
  }
}

type State = "idle" | "loading" | "ready" | "error";

/**
 * Visualizador 3D carregado sob demanda: nem a biblioteca (model-viewer/three.js)
 * nem o arquivo .glb são baixados antes do clique. A imagem estática é o fallback.
 * Não oferece realidade aumentada (não implementada nem testada).
 */
export function Viewer3D({ model, poster, productName }: { model: ProductMedia; poster: ProductMedia | null; productName: string }) {
  const [state, setState] = useState<State>("idle");

  async function load() {
    setState("loading");
    try {
      await import("@google/model-viewer");
      setState("ready");
    } catch {
      setState("error");
    }
  }

  return (
    <section id="visualizador-3d" aria-labelledby="visualizador-3d-titulo" className="scroll-mt-24">
      <h2 id="visualizador-3d-titulo" className="flex items-center gap-2 text-base font-bold uppercase tracking-wide text-deep-fjord">
        <CubeIcon className="h-6 w-6 text-air-blue-ink" /> Ver em 3D
      </h2>
      <p className="mt-1 text-sm text-muted">
        Gire e aproxime para ver {productName} de todos os lados.
        {model.isIllustrative ? " Modelo ilustrativo: proporções e cores aproximadas." : null}
      </p>

      <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-lg bg-cloud">
        {state === "ready" ? (
          <model-viewer
            src={model.url}
            alt={model.altText}
            camera-controls
            touch-action="pan-y"
            shadow-intensity="0.7"
            exposure="1"
            interaction-prompt="auto"
            style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
          />
        ) : (
          <>
            <ProductImage media={poster} sizes="(min-width: 1024px) 800px, 100vw" aspect="h-full" showIllustrativeBadge={false} />
            <div className="absolute inset-0 flex items-center justify-center bg-white/40">
              <Button size="lg" onClick={load} loading={state === "loading"} loadingLabel="Carregando modelo 3D…">
                <CubeIcon className="h-5 w-5" /> Girar em 3D
              </Button>
            </div>
          </>
        )}
      </div>

      {state === "ready" ? (
        <p className="mt-3 text-sm text-muted">
          Arraste para girar e use pinça ou a roda do mouse para aproximar. Com o teclado, selecione o modelo e use as setas.
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">Toque em “Girar em 3D” para carregar o modelo.</p>
      )}
      {state === "error" ? (
        <Notice tone="danger" role="alert" className="mt-3" title="Não foi possível carregar o modelo 3D.">
          Verifique sua conexão e tente de novo. As fotos e medidas continuam disponíveis acima.
        </Notice>
      ) : null}
    </section>
  );
}

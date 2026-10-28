"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ModelViewerElement } from "@google/model-viewer";
import type { ProductMedia } from "@/lib/catalog/types";
import { Button, buttonClasses } from "@/components/ui/button";
import { CameraIcon, CubeIcon } from "@/components/ui/icons";
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
        ar?: boolean;
        "ar-modes"?: string;
        "ar-placement"?: string;
        "ar-scale"?: string;
        "xr-environment"?: boolean;
        "quick-look-browsers"?: string;
      };
    }
  }
}

type State = "idle" | "loading" | "ready" | "error";

/**
 * Palpite barato (sem baixar nada) de que o aparelho abre realidade aumentada:
 * iPhone/iPad (AR Quick Look) ou Android (WebXR / Scene Viewer). A confirmação
 * vem do próprio <model-viewer> depois de carregado (`canActivateAR`).
 */
function detectArCandidate() {
  const quickLook = document.createElement("a").relList.supports("ar");
  const android = /android/i.test(navigator.userAgent) && !/firefox|oculus/i.test(navigator.userAgent);
  return quickLook || android;
}

const subscribeNever = () => () => {};

/**
 * Visualizador 3D carregado sob demanda: nem a biblioteca (model-viewer/three.js)
 * nem o arquivo .glb são baixados antes do clique. A imagem estática é o fallback.
 * No celular, "Ver no seu ambiente" abre a câmera com o produto (realidade aumentada):
 * Scene Viewer no Android (app nativo do Google, o mais estável; WebXR como reserva)
 * e AR Quick Look no iPhone/iPad.
 */
export function Viewer3D({ model, poster, productName }: { model: ProductMedia; poster: ProductMedia | null; productName: string }) {
  const [state, setState] = useState<State>("idle");
  const [pending, setPending] = useState<"3d" | "ar" | null>(null);
  const [arProblem, setArProblem] = useState<string | null>(null);
  const viewerRef = useRef<HTMLElement>(null);
  const wantsAr = useRef(false);
  const arCandidate = useSyncExternalStore(subscribeNever, detectArCandidate, () => false);

  async function load(mode: "3d" | "ar") {
    wantsAr.current = mode === "ar";
    setPending(mode);
    setState("loading");
    try {
      await import("@google/model-viewer");
      setState("ready");
    } catch {
      setState("error");
    }
    setPending(null);
  }

  useEffect(() => {
    const viewer = viewerRef.current as ModelViewerElement | null;
    if (state !== "ready" || !viewer) return;
    let frame = 0;
    const giveUpAt = performance.now() + 2000;

    // O model-viewer escolhe o modo de AR logo depois de montado, sem esperar o
    // arquivo: o Scene Viewer baixa o modelo sozinho e o Quick Look/WebXR esperam
    // o carregamento por conta própria. Assim a câmera abre com um toque só.
    function openCameraWhenReady() {
      if (!viewer || !wantsAr.current) return;
      if (viewer.canActivateAR) {
        wantsAr.current = false;
        // A câmera só abre a partir de um toque recente. Se a biblioteca demorou, o
        // botão "Ver no seu ambiente" sobre o 3D fica à vista para tocar de novo.
        if (navigator.userActivation?.isActive ?? true) void viewer.activateAR();
      } else if (performance.now() < giveUpAt) {
        frame = requestAnimationFrame(openCameraWhenReady);
      } else {
        wantsAr.current = false;
        setArProblem("Este aparelho ou navegador não abre a realidade aumentada. Você ainda pode girar o produto em 3D aqui.");
      }
    }
    frame = requestAnimationFrame(openCameraWhenReady);

    function onArStatus(event: Event) {
      const { status } = (event as CustomEvent<{ status: string }>).detail;
      if (status === "failed") {
        setArProblem("Não foi possível abrir a câmera neste aparelho. Você ainda pode girar o produto em 3D aqui.");
      } else if (status === "session-started") {
        setArProblem(null);
      }
    }

    function onError() {
      setState("error");
    }

    viewer.addEventListener("ar-status", onArStatus);
    viewer.addEventListener("error", onError);
    return () => {
      cancelAnimationFrame(frame);
      viewer.removeEventListener("ar-status", onArStatus);
      viewer.removeEventListener("error", onError);
    };
  }, [state]);

  return (
    <section id="visualizador-3d" aria-labelledby="visualizador-3d-titulo" className="scroll-mt-24">
      <h2 id="visualizador-3d-titulo" className="flex items-center gap-2 text-base font-bold uppercase tracking-wide text-deep-fjord">
        <CubeIcon className="h-6 w-6 text-air-blue-ink" /> Ver em 3D
      </h2>
      <p className="mt-1 text-sm text-muted">
        Gire e aproxime para ver {productName} de todos os lados
        {arCandidate ? " ou abra a câmera para ver no seu ambiente." : "."}
        {model.isIllustrative ? " Modelo ilustrativo: proporções e cores aproximadas." : null}
      </p>

      <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-lg bg-cloud">
        {state === "ready" ? (
          <model-viewer
            ref={viewerRef}
            src={model.url}
            alt={model.altText}
            camera-controls
            touch-action="pan-y"
            shadow-intensity="0.7"
            exposure="1"
            interaction-prompt="auto"
            ar
            ar-modes="scene-viewer webxr quick-look"
            ar-placement="floor"
            ar-scale="auto"
            xr-environment
            quick-look-browsers="safari chrome"
            style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
          >
            <button
              slot="ar-button"
              type="button"
              className={buttonClasses({ size: "lg", className: "absolute bottom-4 left-1/2 w-max -translate-x-1/2 shadow-lg" })}
            >
              <CameraIcon className="h-5 w-5" /> Ver no seu ambiente
            </button>
            <p
              slot="ar-prompt"
              className="absolute left-1/2 top-6 w-max max-w-[90%] -translate-x-1/2 rounded-full bg-deep-fjord/85 px-4 py-2 text-center text-sm text-white"
            >
              Aponte a câmera para o chão e mova o celular devagar
            </p>
          </model-viewer>
        ) : (
          <>
            <ProductImage media={poster} sizes="(min-width: 1024px) 800px, 100vw" aspect="h-full" showIllustrativeBadge={false} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/40">
              {arCandidate ? (
                <Button size="lg" onClick={() => load("ar")} loading={pending === "ar"} disabled={pending !== null} loadingLabel="Abrindo a câmera…">
                  <CameraIcon className="h-5 w-5" /> Ver no seu ambiente
                </Button>
              ) : null}
              <Button
                size="lg"
                variant={arCandidate ? "secondary" : "primary"}
                onClick={() => load("3d")}
                loading={pending === "3d"}
                disabled={pending !== null}
                loadingLabel="Carregando modelo 3D…"
              >
                <CubeIcon className="h-5 w-5" /> Girar em 3D
              </Button>
            </div>
          </>
        )}
      </div>

      {state === "ready" ? (
        <p className="mt-3 text-sm text-muted">
          Arraste para girar e use pinça ou a roda do mouse para aproximar. Com o teclado, selecione o modelo e use as setas.
          {arCandidate
            ? " Na câmera, o tamanho é aproximado: use dois dedos para ajustar e arraste para posicionar."
            : " Para ver no seu ambiente, abra esta página no celular."}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">
          {arCandidate
            ? "Toque em “Ver no seu ambiente” para abrir a câmera com o produto, ou em “Girar em 3D”."
            : "Toque em “Girar em 3D” para carregar o modelo."}
        </p>
      )}
      {arProblem ? (
        <Notice tone="warning" role="status" className="mt-3" title="Realidade aumentada indisponível">
          {arProblem}
        </Notice>
      ) : null}
      {state === "error" ? (
        <Notice tone="danger" role="alert" className="mt-3" title="Não foi possível carregar o modelo 3D.">
          Verifique sua conexão e tente de novo. As fotos e medidas continuam disponíveis acima.
        </Notice>
      ) : null}
    </section>
  );
}

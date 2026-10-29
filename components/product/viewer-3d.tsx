"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ModelViewerElement } from "@google/model-viewer";
import type { ProductMedia } from "@/lib/catalog/types";
import { Button, buttonClasses } from "@/components/ui/button";
import { CameraIcon, CopyIcon, CubeIcon } from "@/components/ui/icons";
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

/** camera: abre a câmera · outro-iphone / outro-android: celular, mas este navegador não abre · computador. */
type ArSupport = "camera" | "outro-iphone" | "outro-android" | "computador";

/**
 * Palpite barato (sem baixar nada), com as mesmas regras do <model-viewer>
 * (lib/constants.js): no iPhone/iPad o AR Quick Look abre no Safari e no Chrome,
 * Edge, Firefox e DuckDuckGo; o app do Google e os navegadores de dentro de apps
 * (WhatsApp, Instagram…) não abrem. No Android abre no Chrome (Scene Viewer/WebXR).
 * A confirmação vem do próprio <model-viewer> depois de carregado (`canActivateAR`).
 */
function detectArSupport(): ArSupport {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) {
    if (/GSA\//.test(ua)) return "outro-iphone";
    if (/CriOS\/|EdgiOS\/|FxiOS\/|DuckDuckGo\//.test(ua)) return "camera";
    return document.createElement("a").relList.supports("ar") ? "camera" : "outro-iphone";
  }
  if (/android/i.test(ua)) return /firefox|oculus/i.test(ua) ? "outro-android" : "camera";
  return "computador";
}

/** Volta do Safari/Chrome com este parâmetro: a página já carrega o 3D e pede um toque para a câmera. */
const AR_PARAM = "ver-no-ambiente";

/** Reserva: o app não deixou abrir o Safari/Chrome sozinho, então oferece copiar o link. */
function CopyLinkFallback({ browser }: { browser: "Safari" | "Chrome" }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(`Link copiado. Abra o ${browser} e cole na barra de endereço.`);
    } catch {
      setCopied(`Copie este endereço e abra no ${browser}: ${window.location.href}`);
    }
  }
  return (
    <Notice tone="info" className="mt-3" title={`Abra no ${browser} para ver no seu ambiente`}>
      <p>Este app não deixou abrir o {browser} sozinho. Copie o link e cole no {browser}.</p>
      <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={copy}>
        <CopyIcon className="h-4 w-4" /> Copiar link
      </Button>
      {copied ? (
        <p role="status" className="mt-2 break-all text-sm font-medium">
          {copied}
        </p>
      ) : null}
    </Notice>
  );
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
  const arSupport = useSyncExternalStore(subscribeNever, detectArSupport, (): ArSupport => "computador");
  const arCandidate = arSupport === "camera";
  const onPhone = arSupport !== "computador";
  const cameraBrowser = arSupport === "outro-android" ? "Chrome" : "Safari";
  const [leaving, setLeaving] = useState(false);
  const [jumpFailed, setJumpFailed] = useState(false);
  const [arrivedFromApp, setArrivedFromApp] = useState(false);
  const arrived = useRef(false);

  /**
   * App do Google, WhatsApp, Instagram (iPhone) ou Firefox (Android) não abrem a
   * câmera com 3D: abre esta mesma página no Safari/Chrome, já no visualizador.
   * x-safari-https:// abre o Safari no iOS; intent:// abre o Chrome no Android.
   */
  function openInCameraBrowser() {
    const url = new URL(window.location.href);
    url.searchParams.set(AR_PARAM, "1");
    url.hash = "visualizador-3d";
    const target =
      arSupport === "outro-android"
        ? `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;end`
        : `x-safari-${url.href}`;
    setJumpFailed(false);
    setLeaving(true);
    const link = document.createElement("a");
    link.href = target;
    link.click();
    // Se o app não deixou sair (a página continua na tela), oferece copiar o link.
    window.setTimeout(() => {
      setLeaving(false);
      if (document.visibilityState === "visible") setJumpFailed(true);
    }, 2000);
  }

  // Chegou do app pelo Safari/Chrome: já carrega o 3D; a câmera abre no próximo toque (exigência do celular).
  useEffect(() => {
    if (!arCandidate || !new URLSearchParams(window.location.search).has(AR_PARAM)) return;
    const timer = setTimeout(() => {
      if (arrived.current) return;
      arrived.current = true;
      const url = new URL(window.location.href);
      url.searchParams.delete(AR_PARAM);
      window.history.replaceState(window.history.state, "", url);
      setArrivedFromApp(true);
      void load("3d");
    }, 0);
    return () => clearTimeout(timer);
  }, [arCandidate]);

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
        {onPhone ? " ou abra a câmera para ver no seu ambiente." : "."}
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
        ) : null}
        {state === "ready" && onPhone && !arCandidate ? (
          <Button
            size="lg"
            className="absolute bottom-4 left-1/2 w-max -translate-x-1/2 shadow-lg"
            onClick={openInCameraBrowser}
            loading={leaving}
            loadingLabel={`Abrindo no ${cameraBrowser}…`}
          >
            <CameraIcon className="h-5 w-5" /> Ver no seu ambiente
          </Button>
        ) : null}
        {state !== "ready" ? (
          <>
            <ProductImage media={poster} sizes="(min-width: 1024px) 800px, 100vw" aspect="h-full" showIllustrativeBadge={false} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/40">
              {onPhone ? (
                <Button
                  size="lg"
                  onClick={() => (arCandidate ? load("ar") : openInCameraBrowser())}
                  loading={pending === "ar" || leaving}
                  disabled={pending !== null}
                  loadingLabel={arCandidate ? "Abrindo a câmera…" : `Abrindo no ${cameraBrowser}…`}
                >
                  <CameraIcon className="h-5 w-5" /> Ver no seu ambiente
                </Button>
              ) : null}
              <Button
                size="lg"
                variant={onPhone ? "secondary" : "primary"}
                onClick={() => load("3d")}
                loading={pending === "3d"}
                disabled={pending !== null}
                loadingLabel="Carregando modelo 3D…"
              >
                <CubeIcon className="h-5 w-5" /> Girar em 3D
              </Button>
            </div>
          </>
        ) : null}
      </div>

      {state === "ready" ? (
        <p className="mt-3 text-sm text-muted">
          Arraste para girar e use pinça ou a roda do mouse para aproximar. Com o teclado, selecione o modelo e use as setas.
          {arCandidate
            ? " Na câmera, o tamanho é aproximado: use dois dedos para ajustar e arraste para posicionar."
            : arSupport === "computador"
              ? " Para ver no seu ambiente, abra esta página no celular."
              : null}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">
          {onPhone
            ? "Toque em “Ver no seu ambiente” para abrir a câmera com o produto, ou em “Girar em 3D”."
            : "Toque em “Girar em 3D” para carregar o modelo."}
        </p>
      )}
      {arrivedFromApp && state === "ready" ? (
        <Notice tone="success" role="status" className="mt-3" title="Pronto para ver no seu ambiente">
          Toque em “Ver no seu ambiente”, sobre o 3D, para abrir a câmera.
        </Notice>
      ) : null}
      {jumpFailed ? <CopyLinkFallback browser={cameraBrowser} /> : null}
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

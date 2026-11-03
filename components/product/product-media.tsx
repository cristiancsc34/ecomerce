"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ModelViewerElement } from "@google/model-viewer";
import { track } from "@/lib/analytics";
import { arLink, currentDevice, detectArSupport, hasArParam, AR_PARAM, LEGACY_AR_PARAM, SERVER_AR_SUPPORT, type ArSupport } from "@/lib/ar/device";
import { nameWithArticle } from "@/lib/catalog/product-helpers";
import type { ProductMedia as Media } from "@/lib/catalog/types";
import { Button } from "@/components/ui/button";
import { ArIcon, CopyIcon, CubeIcon, ImageIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { Spinner } from "@/components/ui/button";
import { ArQrDialog } from "./ar-qr-dialog";
import { Gallery } from "./gallery";
import { ProductImage } from "./product-image";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src: string;
        alt: string;
        "ios-src"?: string;
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

const subscribeNever = () => () => {};
let cachedSupport: ArSupport | null = null;
/** Sempre o mesmo objeto (o useSyncExternalStore compara por referência). */
function arSupportSnapshot(): ArSupport {
  cachedSupport ??= detectArSupport(currentDevice());
  return cachedSupport;
}
const serverSupport = () => SERVER_AR_SUPPORT;

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

/**
 * Botões sobre a foto: legíveis em fundo claro e escuro (fundo sólido, anel
 * branco e sombra), área de toque de 44 px e foco visível em qualquer foto.
 */
const overlayButton =
  "pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold shadow-lg transition-colors sm:px-4 " +
  "focus-visible:outline-3 focus-visible:outline-offset-[3px] focus-visible:outline-deep-fjord focus-visible:ring-4 focus-visible:ring-white " +
  "disabled:cursor-wait disabled:opacity-80";
const overlayPrimary = `${overlayButton} bg-deep-fjord text-white ring-2 ring-white/90 hover:bg-[#1d3a58]`;
const overlaySecondary = `${overlayButton} bg-white text-deep-fjord ring-1 ring-deep-fjord/20 hover:bg-pale-blue`;

/**
 * Fotos e 3D do produto no mesmo lugar. Sobre a foto principal ficam
 * "Ver no seu ambiente" e "Girar em 3D" (só quando o produto tem modelo 3D).
 *
 * O visualizador é carregado sob demanda: nem a biblioteca (model-viewer/three.js)
 * nem o .glb são baixados antes do toque. "Ver no seu ambiente" depende do aparelho:
 * - celular com AR: abre a câmera com o produto (WebXR/Scene Viewer no Android,
 *   AR Quick Look no iPhone/iPad);
 * - navegador de dentro de app: abre a mesma página no Safari/Chrome;
 * - computador ou celular sem AR: código QR que abre a página pronta para o AR no celular.
 */
export function ProductMedia({
  media,
  model,
  poster,
  productId,
  productName,
  productSlug,
  colorSlug = null,
}: {
  media: Media[];
  model: Media | null;
  poster: Media | null;
  productId: string;
  productName: string;
  productSlug: string;
  /** Cor/variante escolhida: vai junto no link do código QR. */
  colorSlug?: string | null;
}) {
  const [mode, setMode] = useState<"fotos" | "3d">("fotos");
  const [state, setState] = useState<State>("idle");
  const [pending, setPending] = useState<"3d" | "ar" | null>(null);
  const [arProblem, setArProblem] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [jumpFailed, setJumpFailed] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);
  const viewerRef = useRef<HTMLElement>(null);
  const arButtonRef = useRef<HTMLButtonElement>(null);
  const wantsAr = useRef(false);
  const arrivalHandled = useRef(false);
  const support = useSyncExternalStore(subscribeNever, arSupportSnapshot, serverSupport);
  const cameraBrowser = support.mode === "abrir-chrome" ? "Chrome" : "Safari";
  const event = { produto_id: productId };

  async function load(want: "3d" | "ar") {
    wantsAr.current = want === "ar";
    setMode("3d");
    // Já carregado: o visualizador volta a ser montado e o efeito abaixo abre a câmera, se pedida.
    if (state === "ready" || state === "loading") return;
    setPending(want);
    setState("loading");
    try {
      await import("@google/model-viewer");
      setState("ready");
    } catch {
      setState("error");
    }
    setPending(null);
  }

  /** Abre a câmera agora (o visualizador já está montado e ainda há um toque recente). */
  function openCamera() {
    const viewer = viewerRef.current as ModelViewerElement | null;
    if (!viewer?.canActivateAR) {
      setArProblem("Este aparelho ou navegador não abre a realidade aumentada. Você ainda pode girar o produto em 3D aqui.");
      return;
    }
    track("ar_open", event);
    void viewer.activateAR();
  }

  /**
   * App do Google, WhatsApp, Instagram (iPhone) ou Firefox (Android) não abrem a
   * câmera com 3D: abre esta mesma página no Safari/Chrome, já pronta para o AR.
   * x-safari-https:// abre o Safari no iOS; intent:// abre o Chrome no Android.
   */
  function openInCameraBrowser() {
    const url = new URL(window.location.href);
    url.searchParams.set(AR_PARAM, "1");
    url.hash = "visualizador-3d";
    const target =
      support.mode === "abrir-chrome"
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

  function onArClick() {
    track("ar_click", { ...event, aparelho: support.mode });
    setArProblem(null);
    if (support.mode === "camera") {
      if (state === "ready" && mode === "3d") openCamera();
      else void load("ar");
    } else if (support.mode === "abrir-safari" || support.mode === "abrir-chrome") {
      openInCameraBrowser();
    } else {
      openQr();
    }
  }

  function openQr() {
    setOrigin(window.location.origin);
    setQrOpen(true);
    track("ar_qr_open", event);
  }

  function on3dClick() {
    if (mode === "3d") {
      setMode("fotos");
      return;
    }
    track("view3d_click", event);
    void load("3d");
  }

  // Chegada pronta para o AR (?ar=1): o 3D já carrega; a câmera abre no próximo
  // toque (os navegadores exigem um toque do usuário). Pedido de 3D por link
  // (#visualizador-3d, ex.: "Girar em 3D" do assistente ou da barra) também abre o 3D.
  useEffect(() => {
    if (!model) return;
    const timer = setTimeout(() => {
      if (arrivalHandled.current) return;
      arrivalHandled.current = true;
      if (hasArParam(window.location.search)) {
        const url = new URL(window.location.href);
        url.searchParams.delete(AR_PARAM);
        url.searchParams.delete(LEGACY_AR_PARAM);
        window.history.replaceState(window.history.state, "", url);
        if (support.mode === "camera") {
          setArrived(true);
          void load("3d");
        } else if (support.mode === "sem-ar") {
          // No computador, o link "Ver no seu ambiente" (ex.: do assistente) abre o código QR.
          openQr();
        } else {
          void load("3d");
        }
      } else if (window.location.hash === "#visualizador-3d") {
        void load("3d");
      }
    }, 0);
    const onHash = () => {
      if (window.location.hash === "#visualizador-3d") void load("3d");
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("hashchange", onHash);
    };
    // load muda a cada render; o efeito só precisa rodar com o aparelho conhecido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, support.mode]);

  useEffect(() => {
    const viewer = viewerRef.current as ModelViewerElement | null;
    if (state !== "ready" || mode !== "3d" || !viewer) return;
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
        // botão "Ver no seu ambiente" continua à vista para tocar de novo.
        if (navigator.userActivation?.isActive ?? true) {
          track("ar_open", event);
          void viewer.activateAR();
        }
      } else if (performance.now() < giveUpAt) {
        frame = requestAnimationFrame(openCameraWhenReady);
      } else {
        wantsAr.current = false;
        setArProblem("Este aparelho ou navegador não abre a realidade aumentada. Você ainda pode girar o produto em 3D aqui.");
      }
    }
    frame = requestAnimationFrame(openCameraWhenReady);

    function onArStatus(e: Event) {
      const { status } = (e as CustomEvent<{ status: string }>).detail;
      if (status === "failed") {
        setArProblem("Não foi possível abrir a câmera neste aparelho. Você ainda pode girar o produto em 3D aqui.");
      } else if (status === "session-started") {
        setArProblem(null);
        setArrived(false);
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
    // `event` é derivado do produto (estável enquanto a página está aberta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, mode]);

  const stage =
    model && mode === "3d" ? (
      state === "ready" ? (
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
          {/* O botão da loja (sobre o 3D) abre a câmera; o do model-viewer fica escondido. */}
          <button slot="ar-button" type="button" hidden aria-hidden="true" tabIndex={-1} />
          <p
            slot="ar-prompt"
            className="absolute left-1/2 top-6 w-max max-w-[90%] -translate-x-1/2 rounded-full bg-deep-fjord/85 px-4 py-2 text-center text-sm text-white"
          >
            Aponte a câmera para o chão e mova o celular devagar
          </p>
        </model-viewer>
      ) : (
        <div className="relative h-full w-full">
          <ProductImage media={poster} sizes="(min-width: 1024px) 640px, 100vw" aspect="h-full" showIllustrativeBadge={false} />
          <div className="absolute inset-0 flex items-center justify-center bg-white/50">
            {state === "error" ? null : (
              <p role="status" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-deep-fjord shadow">
                <Spinner /> {pending === "ar" ? "Abrindo a câmera…" : "Carregando modelo 3D…"}
              </p>
            )}
          </div>
        </div>
      )
    ) : null;

  const busy = pending !== null || leaving;
  const ready3d = mode === "3d" && state === "ready";
  const actions = model ? (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end gap-2" data-acoes-3d>
      <button
        ref={arButtonRef}
        type="button"
        onClick={onArClick}
        disabled={busy}
        aria-label={`${arrived && ready3d ? "Abrir no seu ambiente" : "Ver no seu ambiente"}: ${productName}`}
        className={`${overlayPrimary} ${arrived && ready3d ? "min-h-12 px-6 text-base" : ""}`}
      >
        {leaving ? <Spinner /> : <ArIcon className="h-5 w-5 shrink-0" />}
        {leaving ? `Abrindo no ${cameraBrowser}…` : arrived && ready3d ? "Abrir no seu ambiente" : "Ver no seu ambiente"}
      </button>
      <button
        type="button"
        onClick={on3dClick}
        disabled={pending === "3d"}
        aria-label={mode === "3d" ? `Ver fotos: ${productName}` : `Girar em 3D: ${productName}`}
        className={overlaySecondary}
      >
        {mode === "3d" ? <ImageIcon className="h-5 w-5 shrink-0" /> : <CubeIcon className="h-5 w-5 shrink-0" />}
        {mode === "3d" ? "Ver fotos" : "Girar em 3D"}
      </button>
    </div>
  ) : null;

  const realScale = false;

  return (
    <section
      id="visualizador-3d"
      aria-label={model ? `Fotos e 3D: ${productName}` : `Fotos: ${productName}`}
      className="scroll-mt-24"
      data-modo={mode}
    >
      <Gallery media={media} productName={productName} stage={stage} actions={actions} onSelectPhoto={() => setMode("fotos")} />

      <div className="space-y-3 px-4 lg:px-0">
        {ready3d ? (
          <p className="mt-3 text-sm text-muted">
            Arraste para girar e use pinça ou a roda do mouse para aproximar. Com o teclado, selecione o modelo e use as setas.
            {model?.isIllustrative ? " Modelo ilustrativo: proporções e cores aproximadas." : null}
            {support.mode === "camera"
              ? realScale
                ? " Na câmera, a peça aparece em tamanho real."
                : " Na câmera, o tamanho é aproximado: use dois dedos para ajustar e arraste para posicionar."
              : support.mode === "sem-ar"
                ? " Para ver no seu ambiente, use o celular: toque em “Ver no seu ambiente” para abrir o código QR."
                : null}
          </p>
        ) : null}
        {arrived && ready3d ? (
          <Notice tone="success" role="status" className="mt-3" title="Pronto para ver no seu ambiente">
            Toque em “Abrir no seu ambiente”, sobre o 3D, para abrir a câmera.
          </Notice>
        ) : null}

        {jumpFailed ? <CopyLinkFallback browser={cameraBrowser} /> : null}
        {arProblem ? (
          <Notice tone="warning" role="status" className="mt-3" title="Realidade aumentada indisponível">
            {arProblem}
          </Notice>
        ) : null}
        {state === "error" && mode === "3d" ? (
          <Notice tone="danger" role="alert" className="mt-3" title="Não foi possível carregar o modelo 3D.">
            Verifique sua conexão e tente de novo. As fotos e medidas continuam disponíveis.
          </Notice>
        ) : null}
      </div>

      {model && origin ? (
        <ArQrDialog
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          link={arLink(origin, productSlug, colorSlug)}
          productLabel={nameWithArticle(productName)}
          realScale={realScale}
          phone={support.phone}
          returnFocusRef={arButtonRef}
        />
      ) : null}
    </section>
  );
}

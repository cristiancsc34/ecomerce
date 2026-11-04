"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ModelViewerElement } from "@google/model-viewer";
import { track } from "@/lib/analytics";
import {
  arLauncherAttributes,
  arLink,
  arViewerAttributes,
  canOpenArDirectly,
  currentDevice,
  detectArSupport,
  hasArParam,
  AR_PARAM,
  LEGACY_AR_PARAM,
  SERVER_AR_SUPPORT,
  type ArSupport,
} from "@/lib/ar/device";
import { nameWithArticle } from "@/lib/catalog/product-helpers";
import type { ProductMedia as Media } from "@/lib/catalog/types";
import type { ColorOption } from "@/lib/catalog/variants";
import { Button } from "@/components/ui/button";
import { ArIcon, CopyIcon, CubeIcon, ImageIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { Spinner } from "@/components/ui/button";
import { ArQrDialog } from "./ar-qr-dialog";
import { Gallery } from "./gallery";
import { ProductImage } from "./product-image";
import { useVariantSelection } from "./variant-selection";

type RGBA = [number, number, number, number];

/**
 * Cor escolhida no visualizador: a variante do próprio .glb (KHR_materials_variants,
 * pelo nome da cor) ou, sem ela, a cor do material principal. Volta à cor original
 * quando a cor escolhida é a das fotos do produto.
 */
function applyColor(viewer: ModelViewerElement, slug: string | null, tint: string | null, original: { current: RGBA | null }) {
  const names = viewer.availableVariants ?? [];
  if (names.length) {
    viewer.variantName = slug && names.includes(slug) ? slug : null;
    if (slug && names.includes(slug)) return;
  }
  const material = viewer.model?.materials[0];
  if (!material) return;
  original.current ??= [...material.pbrMetallicRoughness.baseColorFactor] as RGBA;
  material.pbrMetallicRoughness.setBaseColorFactor(tint ?? original.current);
}

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

let viewerLibrary: Promise<unknown> | null = null;
/** Biblioteca do visualizador (model-viewer + three.js), baixada uma vez só. */
function loadViewerLibrary(): Promise<unknown> {
  viewerLibrary ??= import("@google/model-viewer").catch((error) => {
    viewerLibrary = null;
    throw error;
  });
  return viewerLibrary;
}

/** O navegador ainda considera o último toque recente (exigido para abrir a câmera)? */
const recentTap = () => navigator.userActivation?.isActive ?? true;

const NO_AR = "Este aparelho ou navegador não abre a realidade aumentada. Você ainda pode girar o produto em 3D aqui.";

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
 * O .glb só é baixado quando o cliente pede o 3D. No celular com AR, a biblioteca
 * do visualizador (model-viewer/three.js) chega com a página já parada, para a
 * câmera abrir no mesmo toque. "Ver no seu ambiente" depende do aparelho:
 * - celular com AR: abre a câmera com o produto. Da foto, vai direto para o
 *   visualizador do sistema (Scene Viewer no Android, AR Quick Look com o .usdz
 *   pronto no iPhone), sem trocar a foto pelo 3D. Com o 3D na tela, abre pelo 3D
 *   (WebXR no Android, que mostra a cor escolhida). Se o navegador achar que o
 *   toque já ficou para trás, aparece "Abrir no seu ambiente" para tocar de novo;
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
  usdzUrl = null,
  realScale = false,
  colors = [],
}: {
  media: Media[];
  model: Media | null;
  /** Arquivo do iPhone em tamanho real (só quando a escala foi conferida). */
  usdzUrl?: string | null;
  /** Modelo conferido com as medidas do catálogo: no AR o cliente não redimensiona a peça. */
  realScale?: boolean;
  poster: Media | null;
  productId: string;
  productName: string;
  productSlug: string;
  /** Cores/tecidos (variações com cor): fotos, modelo e cor de cada uma. */
  colors?: ColorOption[];
}) {
  const [mode, setMode] = useState<"fotos" | "3d">("fotos");
  const [state, setState] = useState<State>("idle");
  const [pending, setPending] = useState<"3d" | "ar" | null>(null);
  const [arProblem, setArProblem] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [jumpFailed, setJumpFailed] = useState(false);
  /** Pede um toque para abrir a câmera (chegada por ?ar=1 ou o toque ficou para trás). */
  const [askTap, setAskTap] = useState(false);
  /** Esperando o modelo carregar para abrir a câmera. */
  const [preparing, setPreparing] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);
  const viewerRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLElement>(null);
  const arButtonRef = useRef<HTMLButtonElement>(null);
  const wantsAr = useRef(false);
  const wantsDirect = useRef(false);
  const tryOpenCamera = useRef<() => void>(() => {});
  const tryOpenDirectly = useRef<() => void>(() => {});
  const arrivalHandled = useRef(false);
  const support = useSyncExternalStore(subscribeNever, arSupportSnapshot, serverSupport);
  const selection = useVariantSelection();
  const color = colors.find((c) => c.id === selection?.variantId) ?? null;
  // A cor escolhida muda as fotos, o arquivo 3D (se a cor tiver modelo próprio),
  // o arquivo que vai para o AR e o link do código QR.
  const gallery = color?.gallery ?? media;
  const current = color?.model ?? { model, own: false, tint: null, usdzUrl, realScale };
  const activeModel = current.model;
  const colorSlug = color?.slug ?? null;
  const originalColor = useRef<RGBA | null>(null);
  const cameraBrowser = support.mode === "abrir-chrome" ? "Chrome" : "Safari";
  const event = { produto_id: productId };
  // Da foto direto para a câmera: arquivo como está e, no iPhone, com o .usdz pronto.
  const direct = Boolean(activeModel) && canOpenArDirectly(support, current);
  // O .usdz pronto abre sem o .glb; WebXR e o .usdz gerado na hora precisam do modelo carregado.
  const needsModel = !(support.ios && current.usdzUrl);
  const needsLoadedModel = useRef(needsModel);
  useEffect(() => {
    needsLoadedModel.current = needsModel;
  }, [needsModel]);

  async function load(want: "3d" | "ar") {
    wantsAr.current = want === "ar";
    setMode("3d");
    // Já carregado: o visualizador volta a ser montado e o efeito abaixo abre a câmera, se pedida.
    if (state === "ready" || state === "loading") return;
    setPending(want);
    setState("loading");
    try {
      await loadViewerLibrary();
      setState("ready");
    } catch {
      setState("error");
    }
    setPending(null);
  }

  /** Abre a câmera pelo 3D da tela (ainda dentro do toque do cliente). */
  function openCamera() {
    wantsAr.current = true;
    tryOpenCamera.current();
  }

  /** Abre a câmera direto da foto, pelo visualizador escondido. False se ele não estiver pronto. */
  function openCameraDirectly(): boolean {
    const launcher = launcherRef.current as ModelViewerElement | null;
    if (!launcher?.canActivateAR) return false;
    setAskTap(false);
    track("ar_open", { ...event, origem: "foto" });
    void launcher.activateAR();
    return true;
  }

  /** Toque antes de a biblioteca chegar: espera por ela (sem trocar a foto) e abre a câmera. */
  async function openDirectlyWhenReady() {
    wantsDirect.current = true;
    if (state === "ready") {
      tryOpenDirectly.current();
      return;
    }
    setPending("ar");
    try {
      await loadViewerLibrary();
      setState((s) => (s === "idle" || s === "loading" ? "ready" : s));
    } catch {
      wantsDirect.current = false;
      void load("ar"); // tenta de novo pelo 3D, que mostra o erro se não der
    }
    setPending(null);
  }

  function showPhotos() {
    wantsAr.current = false;
    setPreparing(false);
    setAskTap(false);
    setMode("fotos");
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
      else if (openCameraDirectly()) return;
      else if (direct) void openDirectlyWhenReady();
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
      showPhotos();
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
          setAskTap(true);
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

  // Celular com AR: a biblioteca do visualizador chega com a página já parada (sem
  // disputar banda com as fotos), para o toque em "Ver no seu ambiente" abrir a
  // câmera na hora. Não baixa com economia de dados ligada; o .glb nunca vem antes.
  useEffect(() => {
    if (!model || support.mode !== "camera") return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    let cancelled = false;
    let idle = 0;
    let timer = 0;
    const start = () =>
      loadViewerLibrary().then(
        () => !cancelled && setState((s) => (s === "idle" ? "ready" : s)),
        () => {},
      );
    const schedule = () => {
      // O Safari antigo não tem requestIdleCallback.
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(start, { timeout: 3000 });
      else timer = window.setTimeout(start, 1500);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (idle) window.cancelIdleCallback(idle);
      clearTimeout(timer);
    };
  }, [model, support.mode]);

  // Visualizador escondido (abre a câmera da foto). Toque feito antes de ele ficar
  // pronto: abre assim que puder, ainda dentro do toque, ou pede outro toque. Se o
  // Scene Viewer não abrir (aparelho sem o app do Google), segue pelo 3D na tela,
  // que tenta o WebXR.
  useEffect(() => {
    const launcher = launcherRef.current as ModelViewerElement | null;
    if (!launcher) return;
    let frame = 0;
    const giveUpAt = performance.now() + 2000;
    function attempt() {
      if (!launcher || !wantsDirect.current) return;
      if (!launcher.canActivateAR) {
        if (performance.now() < giveUpAt) {
          frame = requestAnimationFrame(attempt);
        } else {
          wantsDirect.current = false;
          void load("ar");
        }
        return;
      }
      wantsDirect.current = false;
      if (recentTap()) openCameraDirectly();
      else setAskTap(true);
    }
    tryOpenDirectly.current = attempt;
    frame = requestAnimationFrame(attempt);
    function onArStatus(e: Event) {
      if ((e as CustomEvent<{ status: string }>).detail.status !== "failed") return;
      void load("ar");
    }
    launcher.addEventListener("ar-status", onArStatus);
    return () => {
      cancelAnimationFrame(frame);
      tryOpenDirectly.current = () => {};
      launcher.removeEventListener("ar-status", onArStatus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direct, state, mode, activeModel?.url]);

  useEffect(() => {
    const viewer = viewerRef.current as ModelViewerElement | null;
    if (state !== "ready" || mode !== "3d" || !viewer) return;
    let frame = 0;
    const giveUpAt = performance.now() + 2000;

    // O model-viewer escolhe o modo de AR logo depois de montado. O .usdz pronto
    // (iPhone) abre na hora; WebXR e o .usdz gerado na hora esperam o .glb, e só
    // então pedem a câmera — dentro do toque, ou com "Abrir no seu ambiente".
    function attempt() {
      if (!viewer || !wantsAr.current) return;
      if (!viewer.canActivateAR) {
        if (performance.now() < giveUpAt) {
          frame = requestAnimationFrame(attempt);
        } else {
          wantsAr.current = false;
          setPreparing(false);
          setArProblem(NO_AR);
        }
        return;
      }
      if (needsLoadedModel.current && !viewer.loaded) {
        setPreparing(true); // o evento "load" chama de novo
        return;
      }
      wantsAr.current = false;
      setPreparing(false);
      if (recentTap()) {
        setAskTap(false);
        track("ar_open", { ...event, origem: "3d" });
        void viewer.activateAR();
      } else {
        // A câmera só abre a partir de um toque recente: agora o modelo está pronto
        // e o próximo toque abre na hora.
        setAskTap(true);
      }
    }
    tryOpenCamera.current = attempt;
    frame = requestAnimationFrame(attempt);

    function onArStatus(e: Event) {
      const { status } = (e as CustomEvent<{ status: string }>).detail;
      if (status === "failed") {
        setArProblem("Não foi possível abrir a câmera neste aparelho. Você ainda pode girar o produto em 3D aqui.");
      } else if (status === "session-started") {
        setArProblem(null);
        setAskTap(false);
      }
    }
    function onError() {
      wantsAr.current = false;
      setPreparing(false);
      setState("error");
    }
    viewer.addEventListener("load", attempt);
    viewer.addEventListener("ar-status", onArStatus);
    viewer.addEventListener("error", onError);
    return () => {
      cancelAnimationFrame(frame);
      tryOpenCamera.current = () => {};
      viewer.removeEventListener("load", attempt);
      viewer.removeEventListener("ar-status", onArStatus);
      viewer.removeEventListener("error", onError);
    };
    // `event` é derivado do produto (estável enquanto a página está aberta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, mode]);

  // Cor no visualizador: ao carregar o arquivo e a cada troca de cor.
  useEffect(() => {
    const viewer = viewerRef.current as ModelViewerElement | null;
    if (state !== "ready" || mode !== "3d" || !viewer) return;
    const apply = () => applyColor(viewer, colorSlug, current.tint, originalColor);
    if (viewer.loaded) apply();
    viewer.addEventListener("load", apply);
    return () => viewer.removeEventListener("load", apply);
  }, [state, mode, colorSlug, current.tint, activeModel?.url]);

  // Arquivo novo: a cor original é a dele.
  useEffect(() => {
    originalColor.current = null;
  }, [activeModel?.url]);

  const stage =
    activeModel && mode === "3d" ? (
      state === "ready" ? (
        <model-viewer
          ref={viewerRef}
          src={activeModel.url}
          alt={color ? `${activeModel.altText} Cor: ${color.name}.` : activeModel.altText}
          camera-controls
          touch-action="pan-y"
          shadow-intensity="0.7"
          exposure="1"
          interaction-prompt="auto"
          ar
          // .usdz conferido no iPhone e tamanho fixo quando a escala bate com o catálogo.
          {...arViewerAttributes({ usdzUrl: current.usdzUrl, realScale: current.realScale })}
          ar-placement="floor"
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
          {preparing ? (
            <p
              role="status"
              className="pointer-events-none absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-deep-fjord shadow"
            >
              <Spinner /> Abrindo a câmera…
            </p>
          ) : null}
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

  // Visualizador escondido, só para abrir a câmera da foto: não baixa o .glb
  // (fica fora da tela) e usa só os visualizadores do sistema.
  const launcher =
    direct && activeModel && state === "ready" && mode === "fotos" ? (
      <model-viewer
        ref={launcherRef}
        src={activeModel.url}
        alt=""
        aria-hidden="true"
        ar
        {...arLauncherAttributes({ usdzUrl: current.usdzUrl, realScale: current.realScale })}
        ar-placement="floor"
        style={{ display: "none" }}
        data-abre-camera
      />
    ) : null;

  const busy = pending !== null || leaving;
  const ready3d = mode === "3d" && state === "ready";
  const launcherReady = direct && state === "ready" && mode === "fotos";
  const bigButton = askTap && (ready3d || launcherReady);
  const openingFromPhoto = pending === "ar" && mode === "fotos";
  const actions = activeModel ? (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end gap-2" data-acoes-3d>
      <button
        ref={arButtonRef}
        type="button"
        onClick={onArClick}
        // Um toque começa a baixar a biblioteca, se ela ainda não chegou.
        onPointerDown={support.mode === "camera" ? () => void loadViewerLibrary().catch(() => {}) : undefined}
        disabled={busy}
        aria-label={`${bigButton ? "Abrir no seu ambiente" : "Ver no seu ambiente"}: ${productName}`}
        className={`${overlayPrimary} ${bigButton ? "min-h-12 px-6 text-base" : ""}`}
      >
        {leaving || openingFromPhoto ? <Spinner /> : <ArIcon className="h-5 w-5 shrink-0" />}
        {leaving
          ? `Abrindo no ${cameraBrowser}…`
          : openingFromPhoto
            ? "Abrindo a câmera…"
            : bigButton
              ? "Abrir no seu ambiente"
              : "Ver no seu ambiente"}
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

  return (
    <section
      id="visualizador-3d"
      aria-label={model ? `Fotos e 3D: ${productName}` : `Fotos: ${productName}`}
      className="scroll-mt-24"
      data-modo={mode}
    >
      <Gallery
        resetKey={color?.id ?? "produto"}
        media={gallery}
        productName={productName}
        stage={stage}
        actions={actions}
        onSelectPhoto={showPhotos}
      />
      {launcher}

      <div className="space-y-3 px-4 lg:px-0">
        {ready3d ? (
          <p className="mt-3 text-sm text-muted">
            Arraste para girar e use pinça ou a roda do mouse para aproximar. Com o teclado, selecione o modelo e use as setas.
            {activeModel?.isIllustrative ? " Modelo ilustrativo: proporções e cores aproximadas." : null}
            {support.mode === "camera"
              ? current.realScale
                ? " Na câmera, a peça aparece em tamanho real."
                : " Na câmera, o tamanho é aproximado: use dois dedos para ajustar e arraste para posicionar."
              : support.mode === "sem-ar"
                ? " Para ver no seu ambiente, use o celular: toque em “Ver no seu ambiente” para abrir o código QR."
                : null}
          </p>
        ) : null}
        {bigButton ? (
          <Notice tone="success" role="status" className="mt-3" title="Pronto para ver no seu ambiente">
            Toque em “Abrir no seu ambiente”, sobre {mode === "3d" ? "o 3D" : "a foto"}, para abrir a câmera. O navegador só abre a
            câmera com um toque seu.
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

      {activeModel && origin ? (
        <ArQrDialog
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          link={arLink(origin, productSlug, colorSlug)}
          productLabel={nameWithArticle(color ? `${productName} (${color.name.toLowerCase()})` : productName)}
          realScale={current.realScale}
          phone={support.phone}
          returnFocusRef={arButtonRef}
        />
      ) : null}
    </section>
  );
}

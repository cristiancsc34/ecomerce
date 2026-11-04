/**
 * O que este aparelho faz com "Ver no seu ambiente" (palpite barato, sem baixar
 * nada), com as mesmas regras do <model-viewer> (lib/constants.js):
 *
 * - `camera`: abre a câmera com o produto. iPhone/iPad: AR Quick Look no Safari e
 *   no Chrome, Edge, Firefox e DuckDuckGo. Android: Chrome (WebXR/Scene Viewer).
 * - `abrir-safari` / `abrir-chrome`: celular, mas este navegador não abre a câmera
 *   (app do Google, Instagram, WhatsApp… no iPhone; Firefox no Android). A loja
 *   abre a mesma página no Safari/Chrome.
 * - `sem-ar`: computador, ou celular que não tem realidade aumentada. Mostra o
 *   código QR e o link para abrir em outro celular.
 *
 * A confirmação vem do próprio <model-viewer> depois de carregado (`canActivateAR`).
 */
export type ArMode = "camera" | "abrir-safari" | "abrir-chrome" | "sem-ar";

export type ArSupport = { mode: ArMode; phone: boolean; /** iPhone/iPad (AR Quick Look, precisa do .usdz). */ ios: boolean };

/** Navegadores de dentro de apps no iPhone (não abrem o AR Quick Look). */
const IOS_IN_APP = /GSA\/|FBAN|FBAV|Instagram|WhatsApp|Line\/|Twitter|TikTok|musical_ly|Snapchat|LinkedInApp|Pinterest/i;

export type DeviceInfo = {
  userAgent: string;
  maxTouchPoints: number;
  /** `<a>.relList.supports("ar")`: o Safari do iPhone com AR responde true. */
  supportsRelAr: boolean;
};

export function detectArSupport(device: DeviceInfo): ArSupport {
  const ua = device.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && device.maxTouchPoints > 1);
  if (ios) {
    if (IOS_IN_APP.test(ua)) return { mode: "abrir-safari", phone: true, ios: true };
    if (/CriOS\/|EdgiOS\/|FxiOS\/|DuckDuckGo\//.test(ua)) return { mode: "camera", phone: true, ios: true };
    if (device.supportsRelAr) return { mode: "camera", phone: true, ios: true };
    // Safari de verdade (tem "Version/… Safari/") sem AR: o aparelho não tem. Outro
    // visualizador sem essas marcas é um app que embute a página: abre no Safari.
    return /Version\/[\d.]+.*Safari\//.test(ua) ? { mode: "sem-ar", phone: true, ios: true } : { mode: "abrir-safari", phone: true, ios: true };
  }
  if (/android/i.test(ua)) return { mode: /firefox|oculus/i.test(ua) ? "abrir-chrome" : "camera", phone: true, ios: false };
  return { mode: "sem-ar", phone: false, ios: false };
}

/** Lê o aparelho atual (só no navegador). */
export function currentDevice(): DeviceInfo {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    supportsRelAr: document.createElement("a").relList.supports("ar"),
  };
}

export const SERVER_AR_SUPPORT: ArSupport = { mode: "sem-ar", phone: false, ios: false };

/**
 * Parâmetro de chegada pronta para o AR (link do código QR, do assistente ou da
 * volta do app para o Safari/Chrome): a página já mostra o 3D e o botão grande.
 * `ver-no-ambiente` é o nome antigo, aceito para links já compartilhados.
 */
export const AR_PARAM = "ar";
export const LEGACY_AR_PARAM = "ver-no-ambiente";

export function hasArParam(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get(AR_PARAM) === "1" || params.has(LEGACY_AR_PARAM);
}

/** Link da página do produto pronto para o AR, com a cor escolhida (se houver). */
export function arLink(origin: string, slug: string, colorSlug?: string | null): string {
  const url = new URL(`/produtos/${slug}`, origin);
  url.searchParams.set(AR_PARAM, "1");
  if (colorSlug) url.searchParams.set("cor", colorSlug);
  return url.toString();
}

/**
 * Atributos de AR do <model-viewer> que aparece na tela (3D). O iPhone abre o
 * .usdz pronto (AR Quick Look) sem esperar nada; sem ele, o próprio model-viewer
 * gera um na hora a partir do .glb. Tamanho fixo só com a escala conferida com o
 * catálogo; senão o cliente ajusta o tamanho (a loja avisa que é aproximado).
 * No Android, o WebXR (dentro do navegador) mostra a cor escolhida na tela.
 */
export function arViewerAttributes({ usdzUrl, realScale }: { usdzUrl: string | null; realScale: boolean }) {
  return {
    "ios-src": usdzUrl ?? undefined,
    "ar-modes": "webxr scene-viewer quick-look",
    "ar-scale": realScale && usdzUrl ? "fixed" : "auto",
  } as const;
}

/**
 * Atributos do model-viewer escondido que abre a câmera direto da foto, no mesmo
 * toque: só os visualizadores do sistema, que não precisam do .glb baixado na
 * página (o Scene Viewer do Android baixa sozinho; o iPhone usa o .usdz pronto).
 */
export function arLauncherAttributes(files: { usdzUrl: string | null; realScale: boolean }) {
  return { ...arViewerAttributes(files), "ar-modes": "scene-viewer quick-look" } as const;
}

/**
 * Dá para abrir a câmera direto da foto? Só com o arquivo como está (cor pintada
 * na hora precisa do 3D na tela) e, no iPhone, com o .usdz pronto.
 */
export function canOpenArDirectly(support: ArSupport, files: { usdzUrl: string | null; tint: string | null }): boolean {
  return support.mode === "camera" && files.tint === null && (!support.ios || files.usdzUrl !== null);
}

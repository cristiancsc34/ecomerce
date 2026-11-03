import { describe, expect, it } from "vitest";
import { arLink, detectArSupport, hasArParam } from "@/lib/ar/device";

const iphone = (tail: string) =>
  `Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${tail}`;
const SAFARI = iphone("Version/18.5 Mobile/15E148 Safari/604.1");
const PIXEL = "Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0 Safari/537.36";

const detect = (userAgent: string, supportsRelAr = false, maxTouchPoints = 0) =>
  detectArSupport({ userAgent, supportsRelAr, maxTouchPoints });

describe("realidade aumentada: o que cada aparelho faz", () => {
  it("iPhone no Safari com AR, Chrome ou Edge: abre a câmera", () => {
    expect(detect(SAFARI, true)).toEqual({ mode: "camera", phone: true });
    expect(detect(iphone("CriOS/138.0 Mobile/15E148 Safari/604.1"))).toEqual({ mode: "camera", phone: true });
    expect(detect(iphone("EdgiOS/138.0 Mobile/15E148 Safari/605.1.15"))).toEqual({ mode: "camera", phone: true });
  });

  it("navegador de dentro de app no iPhone: abre a página no Safari", () => {
    expect(detect(iphone("GSA/380.0.785098425 Mobile/15E148 Safari/604.1"))).toEqual({ mode: "abrir-safari", phone: true });
    expect(detect(iphone("Mobile/15E148 Instagram 300.0.0.0"), false)).toEqual({ mode: "abrir-safari", phone: true });
    // WebView sem marca nenhuma (não é o Safari): também abre no Safari.
    expect(detect(iphone("Mobile/15E148"), false)).toEqual({ mode: "abrir-safari", phone: true });
  });

  it("Safari de um iPhone sem AR: mostra o código QR (não tenta abrir o Safari de novo)", () => {
    expect(detect(SAFARI, false)).toEqual({ mode: "sem-ar", phone: true });
  });

  it("iPad em modo computador conta como iPad", () => {
    const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
    expect(detect(ipad, true, 5)).toEqual({ mode: "camera", phone: true });
    expect(detect(ipad, false, 0)).toEqual({ mode: "sem-ar", phone: false });
  });

  it("Android: Chrome abre a câmera; Firefox abre a página no Chrome", () => {
    expect(detect(PIXEL)).toEqual({ mode: "camera", phone: true });
    expect(detect("Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0")).toEqual({ mode: "abrir-chrome", phone: true });
  });

  it("computador: código QR", () => {
    expect(detect(DESKTOP)).toEqual({ mode: "sem-ar", phone: false });
  });
});

describe("realidade aumentada: link pronto para o AR", () => {
  it("reconhece ?ar=1 e o nome antigo ?ver-no-ambiente", () => {
    expect(hasArParam("?ar=1")).toBe(true);
    expect(hasArParam("?cor=azul&ar=1")).toBe(true);
    expect(hasArParam("?ver-no-ambiente=1")).toBe(true);
    expect(hasArParam("?ar=0")).toBe(false);
    expect(hasArParam("")).toBe(false);
  });

  it("monta o link com a cor escolhida", () => {
    expect(arLink("https://cuxoes.vercel.app", "poltrona-azul")).toBe("https://cuxoes.vercel.app/produtos/poltrona-azul?ar=1");
    expect(arLink("https://cuxoes.vercel.app", "poltrona-azul", "verde-salvia")).toBe(
      "https://cuxoes.vercel.app/produtos/poltrona-azul?ar=1&cor=verde-salvia",
    );
  });
});

describe("texto do código QR", () => {
  it("põe o artigo certo só quando conhece a palavra", async () => {
    const { nameWithArticle } = await import("@/lib/catalog/product-helpers");
    expect(nameWithArticle("Poltrona Azul Estrutura Clara")).toBe("a Poltrona Azul Estrutura Clara");
    expect(nameWithArticle("Cadeira Cinza Trama")).toBe("a Cadeira Cinza Trama");
    expect(nameWithArticle("Sofá Retrô")).toBe("o Sofá Retrô");
    expect(nameWithArticle("Kit Jardim")).toBe("Kit Jardim");
  });
});

describe("atributos de AR do visualizador", () => {
  it("tamanho real conferido: .usdz no iPhone e peça fixa", async () => {
    const { arViewerAttributes } = await import("@/lib/ar/device");
    expect(arViewerAttributes({ usdzUrl: "https://x/m.usdz", realScale: true })).toEqual({
      "ios-src": "https://x/m.usdz",
      "ar-modes": "webxr scene-viewer quick-look",
      "ar-scale": "fixed",
    });
  });

  it("sem conferência: sem .usdz (o model-viewer gera na hora) e o cliente ajusta o tamanho", async () => {
    const { arViewerAttributes } = await import("@/lib/ar/device");
    expect(arViewerAttributes({ usdzUrl: null, realScale: false })).toEqual({
      "ios-src": undefined,
      "ar-modes": "webxr scene-viewer quick-look",
      "ar-scale": "auto",
    });
    // .usdz sem a marcação de tamanho real não é usado.
    expect(arViewerAttributes({ usdzUrl: "https://x/m.usdz", realScale: false })["ios-src"]).toBeUndefined();
  });
});

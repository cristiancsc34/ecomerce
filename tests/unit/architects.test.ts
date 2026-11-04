import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { architectsContactHref, ArchitectsSection } from "@/components/product/architects";
import { makeMedia, makeProduct } from "./factories";

const model = makeMedia({
  type: "model_3d",
  url: "https://x.supabase.co/storage/v1/object/public/product-media/products/p/m.glb",
  storagePath: "products/p/m.glb",
  isPrimary: false,
  isIllustrative: false,
});
const realScaleModel = {
  ...model,
  usdzUrl: "https://x.supabase.co/storage/v1/object/public/product-media/products/p/m.usdz",
  realScale: true,
  boundsCm: { widthCm: 77.6, depthCm: 90.4, heightCm: 100.1 },
};
const render = (p: Parameters<typeof ArchitectsSection>[0]["product"]) => renderToStaticMarkup(createElement(ArchitectsSection, { product: p }));

describe("área de arquitetos e designers", () => {
  it("sem medidas conferidas: só a linha discreta, sem arquivo para baixar", () => {
    const html = render(makeProduct({ slug: "poltrona-x", name: "Poltrona X", media: [makeMedia(), model] }));
    expect(html).toContain("É arquiteto ou designer de interiores?");
    expect(html).toContain('href="/atendimento"');
    expect(html).not.toContain("Baixar");
    expect(html).not.toContain("Para arquitetos e designers");
  });

  it("com tamanho real conferido: downloads com nome legível e texto correto sobre os programas", () => {
    const html = render(
      makeProduct({
        slug: "poltrona-x",
        name: "Poltrona X",
        dimensions: { widthCm: 78, lengthCm: 90, heightCm: 100, weightKg: 12 },
        media: [makeMedia(), realScaleModel],
      }),
    );
    expect(html).toContain("Para arquitetos e designers");
    expect(html).toContain('download="cuxoes-poltrona-x.glb"');
    expect(html).toContain('download="cuxoes-poltrona-x.usdz"');
    expect(html).toContain("?download=cuxoes-poltrona-x.glb");
    // Texto conferido nas documentações: Revit não abre .glb; SketchUp só no computador (Pro/Studio).
    expect(html).toContain("o Revit não abre .glb");
    expect(html).toContain("SketchUp para computador (2024 ou mais recente, planos Pro e Studio)");
    expect(html).not.toMatch(/SketchUp, Blender, Revit e outros aceitam/);
    expect(html).toContain("78 × 90 × 100 cm");
  });

  it("produto sem 3D: nada", () => {
    expect(render(makeProduct({ media: [makeMedia()] }))).toBe("");
  });

  it("pedido pelo WhatsApp já vem com a mensagem pronta; sem WhatsApp, a página de atendimento", () => {
    expect(architectsContactHref("Poltrona X", "")).toBe("/atendimento");
    const wa = architectsContactHref("Poltrona X", "(11) 98765-4321");
    expect(wa.startsWith("https://wa.me/11987654321?text=")).toBe(true);
    expect(decodeURIComponent(wa.split("text=")[1])).toBe(
      "Olá! Sou arquiteto(a) ou designer de interiores e quero o arquivo 3D e a ficha técnica de Poltrona X.",
    );
  });
});

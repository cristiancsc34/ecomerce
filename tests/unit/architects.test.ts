import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { architectsContactHref, ArchitectsSection } from "@/components/product/architects";
import { brand, type BrandConfig } from "@/config/brand";
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
type Props = Parameters<typeof ArchitectsSection>[0];
/** Canais de contato da loja para o teste (a configuração real está vazia). */
const contact = (c: Partial<BrandConfig["contact"]>) => ({ contact: { ...brand.contact, email: "", whatsapp: "", phone: "", ...c } });
const render = (p: Props["product"], config?: Props["config"]) => renderToStaticMarkup(createElement(ArchitectsSection, { product: p, config }));

describe("área de arquitetos e designers", () => {
  it("sem medidas conferidas: só a linha discreta, sem arquivo para baixar", () => {
    const product = makeProduct({ slug: "poltrona-x", name: "Poltrona X", media: [makeMedia(), model] });
    const html = render(product, contact({ email: "contato@exemplo.com" }));
    expect(html).toContain("É arquiteto ou designer de interiores?");
    expect(html).toContain('href="/atendimento"');
    expect(html).not.toContain("Baixar");
    expect(html).not.toContain("Para arquitetos e designers");
    // Com WhatsApp, o pedido vai direto com a mensagem pronta.
    expect(render(product, contact({ whatsapp: "(11) 98765-4321" }))).toContain('href="https://wa.me/11987654321?text=');
  });

  it("sem nenhum canal de contato cadastrado: a linha não aparece (o pedido não chegaria à loja)", () => {
    const product = makeProduct({ media: [makeMedia(), model] });
    expect(render(product, contact({}))).toBe("");
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

  it("pedido pelo WhatsApp já vem com a mensagem pronta; sem WhatsApp, a página de atendimento; sem canal, nada", () => {
    expect(architectsContactHref("Poltrona X", contact({ phone: "(11) 3333-4444" }))).toBe("/atendimento");
    expect(architectsContactHref("Poltrona X", contact({}))).toBeNull();
    const wa = architectsContactHref("Poltrona X", contact({ whatsapp: "(11) 98765-4321" }))!;
    expect(wa.startsWith("https://wa.me/11987654321?text=")).toBe(true);
    expect(decodeURIComponent(wa.split("text=")[1])).toBe(
      "Olá! Sou arquiteto(a) ou designer de interiores e quero o arquivo 3D e a ficha técnica de Poltrona X.",
    );
  });
});

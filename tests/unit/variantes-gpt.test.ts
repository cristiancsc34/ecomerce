import { readFileSync } from "node:fs";
import sharp, { type OverlayOptions, type Sharp } from "sharp";
import { describe, expect, it } from "vitest";
import { recolorPrompt } from "@/scripts/ai-pipeline.mjs";
import { fidelityCheck, recolor } from "@/scripts/gerar-variantes-exemplo.mjs";

const FRENTE = readFileSync(new URL("../../public/demo/poltrona-azul-frente.jpg", import.meta.url));

describe("cores com o GPT: conferência da foto gerada", () => {
  const jpg = (img: Sharp) => img.jpeg({ quality: 84 }).toBuffer();
  const box = (width: number, height: number, background: string) => ({ create: { width, height, channels: 3 as const, background } });

  it("foto que só mudou a cor do tecido passa em todas as cores, e a cor medida é a pedida", async () => {
    for (const hex of ["#6B4A35", "#ECE7DE", "#9C2A2A", "#CDB797"]) {
      const { image } = await recolor(FRENTE, hex);
      const check = await fidelityCheck(FRENTE, await jpg(image), { targetHex: hex });
      expect(check.ok, `${hex}: ${check.reasons.join("; ")}`).toBe(true);
      expect(check.colorDeltaE!).toBeLessThan(10);
    }
    const { image } = await recolor(FRENTE, "#9C2A2A");
    const check = await fidelityCheck(FRENTE, await jpg(image), { targetHex: "#9C2A2A" });
    expect(check.meanDiff).toBeLessThan(3);
    // Vermelho: canal R bem acima de G e B.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(check.fabricHex!.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g + 40);
    expect(r).toBeGreaterThan(b + 40);
  });

  it("tolera o que uma troca de cor fiel faz: recompressão e deslocamento de poucos pixels", async () => {
    const { width, height } = await sharp(FRENTE).metadata();
    const red = await jpg((await recolor(FRENTE, "#9C2A2A")).image);
    const shifted = await jpg(
      sharp(await sharp(red).extend({ left: 12, background: "#f4efe8" }).extract({ left: 0, top: 0, width: width!, height: height! }).toBuffer()),
    );
    expect((await fidelityCheck(FRENTE, shifted, { targetHex: "#9C2A2A" })).ok).toBe(true);
    expect((await fidelityCheck(FRENTE, await sharp(red).jpeg({ quality: 60 }).toBuffer(), { targetHex: "#9C2A2A" })).ok).toBe(true);
  });

  it("recusa foto em que a IA mexeu na peça, no tecido ou no fundo, ou errou a cor", async () => {
    const { width, height } = await sharp(FRENTE).metadata();
    const red = await jpg((await recolor(FRENTE, "#9C2A2A")).image);
    const over = (items: OverlayOptions[]) => jpg(sharp(red).composite(items));
    const cases: [string, Buffer, string][] = [
      // Dentro do tecido: almofada acrescentada (mesmo de cor parecida) e encosto de cabeça apagado.
      ["almofada bege", await over([{ input: box(300, 220, "#d8c7a5"), left: 650, top: 500 }]), "tecido"],
      ["almofada vermelho-escura", await over([{ input: box(300, 220, "#6e1c1c"), left: 650, top: 500 }]), "tecido"],
      ["encosto apagado", await over([{ input: box(570, 230, "#f4efe8"), left: 510, top: 110 }]), "tecido"],
      // Fora do tecido: objeto pequeno no fundo, mancha grande, peça deslocada.
      ["objeto 60×60", await over([{ input: box(60, 60, "#3a2a1a"), left: 200, top: 300 }]), "fora do tecido"],
      ["mancha 300×300", await over([{ input: box(300, 300, "#3a2a1a"), left: 40, top: 40 }]), "fora do tecido"],
      [
        "deslocada 80 px",
        await jpg(sharp(await sharp(red).extend({ left: 80, background: "#f4efe8" }).extract({ left: 0, top: 0, width: width!, height: height! }).toBuffer())),
        "fora do tecido",
      ],
    ];
    for (const [name, image, where] of cases) {
      const check = await fidelityCheck(FRENTE, image, { targetHex: "#9C2A2A" });
      expect(check.ok, name).toBe(false);
      expect(check.reasons.join(" "), name).toContain(where);
    }
    // Madeira 25% mais escura (outro acabamento).
    const { data, info } = await sharp(red).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const original = await sharp(FRENTE).removeAlpha().raw().toBuffer();
    const darker = Buffer.from(data);
    for (let i = 0; i < darker.length; i += 3) {
      const fromBg = (Math.abs(original[i] - 244) + Math.abs(original[i + 1] - 239) + Math.abs(original[i + 2] - 232)) / 3;
      const blue = original[i + 2] > original[i] + 20;
      if (!blue && fromBg > 40) for (let c = 0; c < 3; c++) darker[i + c] = Math.round(darker[i + c] * 0.75);
    }
    const wood = await fidelityCheck(FRENTE, await jpg(sharp(darker, { raw: { width: info.width, height: info.height, channels: 3 } })), {
      targetHex: "#9C2A2A",
    });
    expect(wood.ok).toBe(false);
    expect(wood.reasons.join(" ")).toContain("madeira");
    // Cor errada: a foto continua azul, ou saiu rosa no lugar de vermelho.
    const blue = await fidelityCheck(FRENTE, FRENTE, { targetHex: "#6B4A35" });
    expect(blue.ok).toBe(false);
    expect(blue.reasons).toContain("a cor do tecido não é a pedida");
    const pink = await fidelityCheck(FRENTE, await jpg((await recolor(FRENTE, "#E58FB0")).image), { targetHex: "#9C2A2A" });
    expect(pink.ok).toBe(false);
  });

  it("a instrução pede só a troca da cor do tecido", () => {
    const prompt = recolorPrompt("marrom", "#6B4A35");
    expect(prompt).toContain("Change ONLY the color of the upholstery fabric (cushions, seat and backrest) to marrom (#6B4A35)");
    expect(prompt).toContain("Do not add, remove, move, repair or restyle anything");
    expect(prompt).toContain("wood frame color");
  });
});

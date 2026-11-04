import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { recolorPrompt } from "@/scripts/ai-pipeline.mjs";
import { fidelityCheck, recolor } from "@/scripts/gerar-variantes-exemplo.mjs";

const FRENTE = readFileSync(new URL("../../public/demo/poltrona-azul-frente.jpg", import.meta.url));

describe("cores com o GPT: conferência da foto gerada", () => {
  it("foto que só mudou a cor do tecido passa, e a cor medida é a nova", async () => {
    const { image } = await recolor(FRENTE, "#9C2A2A");
    const check = await fidelityCheck(FRENTE, await image.jpeg({ quality: 90 }).toBuffer());
    expect(check.ok).toBe(true);
    expect(check.meanDiff).toBeLessThan(3);
    // Vermelho: canal R bem acima de G e B.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(check.fabricHex!.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g + 40);
    expect(r).toBeGreaterThan(b + 40);
  });

  it("foto em que a IA mexeu na peça ou no fundo é recusada", async () => {
    const { width, height } = await sharp(FRENTE).metadata();
    // Um "objeto novo" no fundo (mancha escura) e a peça deslocada para o lado.
    const stain = await sharp(FRENTE)
      .composite([{ input: { create: { width: 300, height: 300, channels: 3, background: "#3a2a1a" } }, left: 40, top: 40 }])
      .jpeg()
      .toBuffer();
    expect((await fidelityCheck(FRENTE, stain)).ok).toBe(false);
    const shifted = await sharp(FRENTE)
      .extend({ left: 80, background: "#f4efe8" })
      .extract({ left: 0, top: 0, width: width!, height: height! })
      .jpeg()
      .toBuffer();
    expect((await fidelityCheck(FRENTE, shifted)).ok).toBe(false);
  });

  it("a instrução pede só a troca da cor do tecido", () => {
    const prompt = recolorPrompt("marrom", "#6B4A35");
    expect(prompt).toContain("Change ONLY the color of the upholstery fabric (cushions, seat and backrest) to marrom (#6B4A35)");
    expect(prompt).toContain("Do not add, remove, move, repair or restyle anything");
    expect(prompt).toContain("wood frame color");
  });
});

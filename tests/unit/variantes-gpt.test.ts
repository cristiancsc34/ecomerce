import { readFileSync } from "node:fs";
import sharp, { type Sharp } from "sharp";
import { describe, expect, it } from "vitest";
import { recolorPrompt } from "@/scripts/ai-pipeline.mjs";
import { fabricMask, fabricWeight, gptTone, recolor, recolorWith, toneAt } from "@/scripts/gerar-variantes-exemplo.mjs";

const photo = (view: string) => readFileSync(new URL(`../../public/demo/poltrona-azul-${view}.jpg`, import.meta.url));
const FRENTE = photo("frente");
const RED = "#9C2A2A";
const jpg = (img: Sharp, quality = 84) => img.jpeg({ quality }).toBuffer();
const box = (width: number, height: number, background: string) => ({ create: { width, height, channels: 3 as const, background } });
/** Tom de um ângulo só (a regra de 3 dos 4 ângulos tem teste próprio). */
const toneOf = (generated: Buffer, targetHex = RED, limits = {}) =>
  gptTone([{ view: "frente", original: FRENTE, generated }], { targetHex, limits: { minViews: 1, ...limits } });
const raw = (input: Buffer | Sharp) => (Buffer.isBuffer(input) ? sharp(input) : input).removeAlpha().raw().toBuffer();
const SLOW = 60_000;

describe("cores com o GPT: a foto final é a original, só com o tecido repintado", () => {
  it(
    "fora do tecido, a foto final é pixel a pixel a original, mesmo que a foto do GPT tenha mexido na peça ou acrescentado algo",
    async () => {
      const red = await jpg((await recolor(FRENTE, RED)).image);
      // Foto do GPT "errada": móvel ao lado, luminária, almofada rosa por cima, apoio de cabeça apagado.
      const tampered = await jpg(
        sharp(red).composite([
          { input: box(330, 450, "#e9e4dc"), left: 20, top: 350 },
          { input: box(12, 900, "#2b2b2b"), left: 1450, top: 200 },
          { input: box(300, 250, "#ff96af"), left: 560, top: 300 },
          { input: box(620, 250, "#f4efe8"), left: 490, top: 90 },
        ]),
      );
      // Mesmo aceitando o tom dela (todos os limites soltos de propósito), nada disso chega à foto final.
      const r = await toneOf(tampered, RED, { maxAlignDiff: 255, maxOffToneShare: 1, maxColorDeltaE: 255 });
      expect(r.ok, r.reasons.join("; ")).toBe(true);
      const final = await raw((await recolorWith(FRENTE, (l: number) => toneAt(r.tone!, l))).image);
      const original = await raw(FRENTE);
      const mask = fabricMask(original, 1600, 1200);
      let outside = 0;
      let same = 0;
      for (let i = 0; i < original.length; i += 3) {
        if (mask[i / 3] > 0) continue;
        outside++;
        if (final[i] === original[i] && final[i + 1] === original[i + 1] && final[i + 2] === original[i + 2]) same++;
      }
      expect(outside).toBeGreaterThan(1_000_000);
      expect(same).toBe(outside);
      // Com os limites normais, o tom dessa foto é recusado (o apoio apagado contamina a cor) e a cor fica pelo computador.
      expect((await toneOf(tampered)).ok).toBe(false);
    },
    SLOW,
  );

  it(
    "aprende o tom da foto do GPT: o tecido fica como o do GPT e a cor medida é a pedida",
    async () => {
      for (const hex of ["#6B4A35", "#ECE7DE", RED, "#CDB797"]) {
        const generated = await jpg((await recolor(FRENTE, hex)).image);
        const r = await toneOf(generated, hex);
        expect(r.ok, `${hex}: ${r.reasons.join("; ")}`).toBe(true);
        expect(r.colorDeltaE!, hex).toBeLessThan(6);
        const final = await raw((await recolorWith(FRENTE, (l: number) => toneAt(r.tone!, l))).image);
        const gpt = await raw(generated);
        const original = await raw(FRENTE);
        let sum = 0;
        let n = 0;
        for (let i = 0; i < original.length; i += 3) {
          if (fabricWeight(original[i] / 255, original[i + 1] / 255, original[i + 2] / 255) < 0.5) continue;
          sum += (Math.abs(final[i] - gpt[i]) + Math.abs(final[i + 1] - gpt[i + 1]) + Math.abs(final[i + 2] - gpt[i + 2])) / 3;
          n++;
        }
        expect(sum / n, hex).toBeLessThan(4);
      }
    },
    SLOW,
  );

  it(
    "tolera o que o GPT faz ao refazer a foto: deslocamento, escala, outro formato, luz e compressão",
    async () => {
      const red = await jpg((await recolor(FRENTE, RED)).image);
      const shifted = await sharp(await sharp(red).extend({ left: 30, bottom: 20, background: "#f4efe8" }).toBuffer())
        .extract({ left: 0, top: 20, width: 1600, height: 1200 })
        .jpeg()
        .toBuffer();
      const r = await toneOf(shifted);
      expect(r.ok, r.reasons.join("; ")).toBe(true);
      expect(r.views[0]).toMatchObject({ dx: 30, dy: -20 });

      const bigger = await sharp(await sharp(red).resize(1632, 1224).toBuffer()).extract({ left: 16, top: 12, width: 1600, height: 1200 }).jpeg().toBuffer();
      const brighter = await sharp(red).linear(1.05, 0).jpeg().toBuffer();
      const variants: [string, Buffer][] = [
        ["2% maior", bigger],
        ["1536 × 1024, cortada em cima e embaixo", await sharp(red).resize(1536, 1024, { fit: "cover" }).jpeg().toBuffer()],
        ["5% mais clara", brighter],
        ["JPEG qualidade 40", await sharp(red).jpeg({ quality: 40 }).toBuffer()],
      ];
      for (const [name, generated] of variants) {
        const check = await toneOf(generated);
        expect(check.ok, `${name}: ${check.reasons.join("; ")}`).toBe(true);
        expect(check.colorDeltaE!, name).toBeLessThan(6);
      }
    },
    SLOW,
  );

  it(
    "recusa o tom quando a cor não é a pedida ou a foto do GPT não é a da peça",
    async () => {
      const wrong: [string, Buffer, string][] = [
        ["vinho no lugar de vermelho", await jpg((await recolor(FRENTE, "#722F37")).image), RED],
        ["vermelho vivo no lugar de vermelho", await jpg((await recolor(FRENTE, "#C62828")).image), RED],
        ["continua azul", FRENTE, "#6B4A35"],
      ];
      for (const [name, generated, hex] of wrong) {
        const r = await toneOf(generated, hex);
        expect(r.ok, name).toBe(false);
        expect(r.reasons, name).toContain("a cor do tecido não é a pedida");
        expect(r.tone, name).toBeNull();
      }
      // Outro ângulo da peça no lugar da frente.
      const other = await toneOf(await jpg((await recolor(photo("lateral"), RED)).image));
      expect(other.ok).toBe(false);
      expect(other.views[0].reason).toContain("não corresponde à original");
    },
    SLOW,
  );

  it(
    "precisa de 3 dos 4 ângulos e tira um tom só para todos",
    async () => {
      const views = ["frente", "tres-quartos", "lateral", "traseira"];
      const shots = await Promise.all(
        views.map(async (view) => ({ view, original: photo(view), generated: await jpg((await recolor(photo(view), RED)).image) })),
      );
      // Um ângulo sem resposta da OpenAI: os outros 3 bastam.
      const three = await gptTone(
        shots.map((s, i) => (i === 3 ? { view: s.view, original: s.original } : s)),
        { targetHex: RED },
      );
      expect(three.ok, three.reasons.join("; ")).toBe(true);
      expect(three.views.map((v) => v.used)).toEqual([true, true, true, false]);
      expect(three.views[3].reason).toBe("a OpenAI não devolveu este ângulo");
      // Dois ângulos trocados: não dá.
      const two = await gptTone(
        shots.map((s, i) => (i < 2 ? { ...s, generated: shots[2].generated } : s)),
        { targetHex: RED },
      );
      expect(two.ok).toBe(false);
      expect(two.reasons).toContain("o GPT acertou 2 de 4 ângulos (precisa de 3)");
    },
    SLOW,
  );

  it("a instrução pede só a troca da cor do tecido", () => {
    const prompt = recolorPrompt("marrom", "#6B4A35");
    expect(prompt).toContain("Change ONLY the color of the upholstery fabric (cushions, seat and backrest) to marrom (#6B4A35)");
    expect(prompt).toContain("Do not add, remove, move, repair or restyle anything");
    expect(prompt).toContain("wood frame color");
  });
});

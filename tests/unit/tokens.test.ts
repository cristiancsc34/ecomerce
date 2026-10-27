import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colors, cssVariableByToken, type ColorToken } from "@/config/tokens";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("tokens de cor", () => {
  it("usa os valores da especificação", () => {
    expect(colors.skyMist).toBe("#C4E0F5");
    expect(colors.airBlue).toBe("#408AC2");
    expect(colors.deepFjord).toBe("#132940");
    expect(colors.cloud).toBe("#F6FAFC");
    expect(colors.paleBlue).toBe("#E8F2FA");
    expect(colors.linen).toBe("#E8DBC9");
    expect(colors.warmCoral).toBe("#F5C7AD");
    expect(colors.ink).toBe("#1F2B38");
    expect(colors.muted).toBe("#5E707F");
    expect(colors.line).toBe("#DCE5EC");
  });

  it("CSS (@theme) e TypeScript têm os mesmos valores", () => {
    for (const [token, variable] of Object.entries(cssVariableByToken)) {
      const match = css.match(new RegExp(`${variable}:\\s*(#[0-9A-Fa-f]{6})`));
      expect(match, `variável ${variable} ausente`).not.toBeNull();
      expect(match![1].toUpperCase()).toBe(colors[token as ColorToken].toUpperCase());
    }
  });
});

describe("contraste WCAG 2.2 AA (texto normal ≥ 4,5:1)", () => {
  const pairs: [string, ColorToken, ColorToken][] = [
    ["texto principal no fundo", "ink", "cloud"],
    ["texto principal no branco", "ink", "white"],
    ["texto secundário no branco", "muted", "white"],
    ["texto secundário no fundo", "muted", "cloud"],
    ["texto secundário no azul pálido", "muted", "paleBlue"],
    ["links no branco", "airBlueInk", "white"],
    ["links no fundo", "airBlueInk", "cloud"],
    ["links no azul pálido", "airBlueInk", "paleBlue"],
    ["títulos no branco", "deepFjord", "white"],
    ["botão principal", "white", "deepFjord"],
    ["texto no azul de assinatura", "deepFjord", "skyMist"],
    ["texto no coral", "ink", "warmCoral"],
    ["texto no linho", "ink", "linen"],
    ["erro no branco", "danger", "white"],
    ["sucesso no branco", "success", "white"],
  ];

  it.each(pairs)("%s", (_label, fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it("air-blue original só serve para ícones/elementos grandes (≥ 3:1), não para texto pequeno", () => {
    const ratio = contrast(colors.airBlue, colors.white);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeLessThan(4.5);
  });
});

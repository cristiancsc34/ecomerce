/**
 * Medição da cor numa foto recolorida pelo GPT (passo "Cores" do Estúdio).
 *
 * Funciona com tecido de qualquer cor: compara a foto de catálogo original com a
 * gerada e olha só o que mudou de cor (o tecido). Serve de AVISO para quem confere
 * no painel (cor longe da pedida, foto que quase não mudou, foto refeita demais);
 * não garante que a peça ficou igual — isso é a conferência foto por foto.
 *
 * Não acessa arquivos do projeto (roda na Vercel).
 */
import sharp from "sharp";

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** sRGB (0–255) → Lab (D65). */
export function labOf([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255].map(toLinear);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (t * 24389) / 27 / 116 + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
export const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const median = (values) => {
  const v = Float64Array.from(values).sort();
  return v.length ? v[v.length >> 1] : 0;
};

/** Limites dos avisos (calibrados com as fotos de exemplo da Poltrona Azul geradas pelo GPT). */
export const COLOR_WARNINGS = {
  /** Mudou de cor a partir desta diferença (ΔE) entre a original e a gerada. */
  changedDeltaE: 18,
  /** Menos que isto da foto mudou: o GPT quase não trocou a cor. */
  minChangedShare: 0.03,
  /** Mais que isto da foto mudou: o GPT pode ter refeito a cena (fundo, madeira). */
  maxChangedShare: 0.6,
  /** Cor medida mais longe que isto da pedida: avisa. */
  maxColorDeltaE: 15,
};

/**
 * Compara a original com a gerada (as duas reduzidas para 400 × 300).
 * @returns {Promise<{ changedShare: number, colorHex: string | null, originalHex: string | null, colorDeltaE: number | null, warnings: string[] }>}
 */
export async function measureRecolor(original, generated, { targetHex } = {}) {
  const W = 400;
  const H = 300;
  const read = (input) => sharp(input).removeAlpha().resize(W, H, { fit: "fill" }).raw().toBuffer();
  const [A, B] = await Promise.all([read(original), read(generated)]);
  const n = W * H;
  const changed = [];
  for (let i = 0; i < n; i++) {
    const a = [A[i * 3], A[i * 3 + 1], A[i * 3 + 2]];
    const b = [B[i * 3], B[i * 3 + 1], B[i * 3 + 2]];
    if (deltaE(labOf(a), labOf(b)) > COLOR_WARNINGS.changedDeltaE) changed.push(i);
  }
  const changedShare = changed.length / n;
  const pick = (img) =>
    changed.length ? toHex([0, 1, 2].map((c) => median(changed.map((i) => img[i * 3 + c])))) : null;
  const colorHex = pick(B);
  const originalHex = pick(A);
  const colorDeltaE = colorHex && targetHex ? deltaE(labOf(hexToRgb(colorHex)), labOf(hexToRgb(targetHex))) : null;

  const warnings = [];
  if (changedShare < COLOR_WARNINGS.minChangedShare) warnings.push("A foto quase não mudou de cor.");
  else if (changedShare > COLOR_WARNINGS.maxChangedShare) warnings.push("A foto mudou demais: confira o fundo, a madeira e a peça.");
  if (colorDeltaE !== null && colorDeltaE > COLOR_WARNINGS.maxColorDeltaE && changedShare >= COLOR_WARNINGS.minChangedShare) {
    warnings.push("A cor medida no tecido está longe da pedida.");
  }
  return { changedShare, colorHex, originalHex, colorDeltaE, warnings };
}

/**
 * Tokens de cor da identidade Cuxões.
 *
 * Fonte única para código TypeScript (OG image, SVGs, testes de contraste).
 * O CSS usa os mesmos valores em `app/globals.css` (@theme); um teste unitário
 * garante que os dois arquivos não divergem.
 */
export const colors = {
  /** brand/sky-mist — azul-claro de assinatura e fundos suaves */
  skyMist: "#C4E0F5",
  /** brand/air-blue — ícones, bordas e estados ativos */
  airBlue: "#408AC2",
  /**
   * Variante escura de air-blue para TEXTO de links. O air-blue original tem
   * contraste 3,7:1 sobre branco (abaixo de AA para texto pequeno); esta tem 5,5:1.
   */
  airBlueInk: "#2E6E9E",
  /** brand/deep-fjord — botões principais, títulos e navegação */
  deepFjord: "#132940",
  /** surface/cloud — fundo principal */
  cloud: "#F6FAFC",
  /** surface/pale-blue — blocos e superfícies alternadas */
  paleBlue: "#E8F2FA",
  /** surface/linen — acento natural e campanhas */
  linen: "#E8DBC9",
  /** accent/warm-coral — acentos discretos */
  warmCoral: "#F5C7AD",
  /** text/primary */
  ink: "#1F2B38",
  /** text/secondary */
  muted: "#5E707F",
  /** border/default */
  line: "#DCE5EC",
  /** surface/white */
  white: "#FFFFFF",
  /** estado de erro (não faz parte da paleta de marca; AA sobre branco) */
  danger: "#B42318",
  /** estado de sucesso (AA sobre branco) */
  success: "#1E6B47",
} as const;

export type ColorToken = keyof typeof colors;

/** Mapeamento token → variável CSS usada pelo Tailwind (`--color-*`). */
export const cssVariableByToken: Record<ColorToken, string> = {
  skyMist: "--color-sky-mist",
  airBlue: "--color-air-blue",
  airBlueInk: "--color-air-blue-ink",
  deepFjord: "--color-deep-fjord",
  cloud: "--color-cloud",
  paleBlue: "--color-pale-blue",
  linen: "--color-linen",
  warmCoral: "--color-warm-coral",
  ink: "--color-ink",
  muted: "--color-muted",
  line: "--color-line",
  white: "--color-white",
  danger: "--color-danger",
  success: "--color-success",
};

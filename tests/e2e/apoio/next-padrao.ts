import { createRequire } from "node:module";

/**
 * `next/link` e `next/image` são CommonJS com `exports.default`; carregados pelo
 * Vite fora do Next, o `import X from` recebe o objeto inteiro. Aqui devolvemos
 * o componente (o mesmo ajuste que o Vitest faz sozinho).
 */
const require = createRequire(import.meta.url);
const padrao = (m: { default?: unknown }) => m.default ?? m;

export const Link = padrao(require("next/link"));
export const Image = padrao(require("next/image"));

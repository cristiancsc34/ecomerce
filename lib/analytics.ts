/**
 * Eventos de uso da loja (navegador).
 *
 * O projeto ainda não tem um provedor de analytics. Cada evento é:
 * - enviado ao `window.dataLayer`, se existir (Google Tag Manager e similares);
 * - disparado como evento do navegador `cuxoes:evento`, para quem quiser ouvir
 *   (ex.: `window.addEventListener("cuxoes:evento", e => console.log(e.detail))`).
 *
 * Para ligar um provedor (Vercel Analytics, GA4, PostHog…), chame-o aqui, em
 * `track`. Nada de dados pessoais nos eventos: só o produto e o contexto.
 */

export type AnalyticsEventName =
  /** Toque em "Ver no seu ambiente". */
  | "ar_click"
  /** A loja pediu ao aparelho para abrir a câmera com o produto. */
  | "ar_open"
  /** Toque em "Girar em 3D". */
  | "view3d_click"
  /** Abriu o código QR para passar para o celular. */
  | "ar_qr_open";

export type AnalyticsProps = { produto_id: string } & Record<string, string | number | boolean | null>;

export const ANALYTICS_EVENT = "cuxoes:evento";

type WithDataLayer = Window & { dataLayer?: unknown[] };

export function track(event: AnalyticsEventName, props: AnalyticsProps): void {
  if (typeof window === "undefined") return;
  const detail = { event, ...props };
  try {
    (window as WithDataLayer).dataLayer?.push(detail);
    window.dispatchEvent(new CustomEvent(ANALYTICS_EVENT, { detail }));
  } catch {
    // Analytics nunca quebra a página.
  }
}

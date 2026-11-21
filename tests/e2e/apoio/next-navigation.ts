/**
 * `next/navigation` de mentira para renderizar componentes pelo Vite fora do Next
 * (testes E2E que injetam marcação na página). Os componentes só leem a URL e
 * guardam o roteador; nada navega de verdade aqui.
 */
const router = { push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} };

export const useRouter = () => router;
export const useSearchParams = () => new URLSearchParams();
export const usePathname = () => "/";

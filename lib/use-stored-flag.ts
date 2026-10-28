"use client";

import { useCallback, useSyncExternalStore } from "react";

const CHANGED = "cuxoes:preferencia";

function read(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

/**
 * Preferência liga/desliga lembrada neste navegador (ex.: "seguir as etapas
 * sozinho"). No servidor e na hidratação vale o padrão.
 */
export function useStoredFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      window.addEventListener(CHANGED, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(CHANGED, onChange);
      };
    },
    () => read(key, fallback),
    () => fallback,
  );
  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Navegador sem armazenamento (modo privado): continua valendo o padrão.
      }
      window.dispatchEvent(new Event(CHANGED));
    },
    [key],
  );
  return [value, set];
}

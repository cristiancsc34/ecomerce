"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** false no servidor e na hidratação; true depois que o cliente assume. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { cartItemSchema, MAX_CART_LINES, MAX_QUANTITY_PER_LINE, type CartItem } from "./types";

/**
 * Sacola no navegador (localStorage). Guarda apenas ids e quantidades;
 * preços e disponibilidade são sempre recalculados no servidor.
 * Funciona sem conta e sem cookies.
 */
const STORAGE_KEY = "cuxoes:cart:v1";
const EMPTY: CartItem[] = [];

let cachedRaw: string | null = null;
let cachedItems: CartItem[] = EMPTY;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): CartItem[] {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return EMPTY;
    return data
      .map((d) => cartItemSchema.safeParse(d))
      .filter((r) => r.success)
      .map((r) => r.data)
      .slice(0, MAX_CART_LINES);
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): CartItem[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedItems = parse(raw);
  }
  return cachedItems;
}

function getServerSnapshot(): CartItem[] {
  return EMPTY;
}

function emit() {
  for (const l of listeners) l();
}

function write(items: CartItem[]) {
  try {
    if (items.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Armazenamento indisponível (modo privado/cota): a sacola vive só nesta aba.
    cachedRaw = JSON.stringify(items);
    cachedItems = items;
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const cart = {
  add(productId: string, variantId: string | null, quantity = 1) {
    const items = [...getSnapshot()];
    const idx = items.findIndex((i) => i.productId === productId && i.variantId === variantId);
    if (idx >= 0) {
      items[idx] = { ...items[idx], quantity: Math.min(MAX_QUANTITY_PER_LINE, items[idx].quantity + quantity) };
    } else {
      if (items.length >= MAX_CART_LINES) return false;
      items.push({ productId, variantId, quantity: Math.min(MAX_QUANTITY_PER_LINE, Math.max(1, quantity)) });
    }
    write(items);
    return true;
  },
  setQuantity(productId: string, variantId: string | null, quantity: number) {
    const q = Math.max(0, Math.min(MAX_QUANTITY_PER_LINE, Math.floor(quantity)));
    const items = getSnapshot()
      .map((i) => (i.productId === productId && i.variantId === variantId ? { ...i, quantity: q } : i))
      .filter((i) => i.quantity > 0);
    write(items);
  },
  remove(productId: string, variantId: string | null) {
    write(getSnapshot().filter((i) => !(i.productId === productId && i.variantId === variantId)));
  },
  replace(items: CartItem[]) {
    write(items.slice(0, MAX_CART_LINES));
  },
  clear() {
    write([]);
  },
};

export function useCartItems(): CartItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useCartCount(): number {
  return useCartItems().reduce((sum, i) => sum + i.quantity, 0);
}

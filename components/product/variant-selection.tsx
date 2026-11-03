"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Selection = {
  variantId: string | null;
  setVariantId: (id: string | null) => void;
};

const SelectionContext = createContext<Selection | null>(null);

/**
 * Variação escolhida na página do produto, compartilhada entre o painel de
 * compra (preço), a galeria (fotos), o visualizador 3D (modelo/cor) e o link
 * do código QR. A cor escolhida vai para a URL (?cor=marrom): o link
 * compartilhado e o QR abrem na mesma cor.
 */
export function VariantSelectionProvider({
  initialVariantId,
  colors,
  children,
}: {
  initialVariantId: string | null;
  /** Variações com cor e o nome delas no link. */
  colors: { id: string; slug: string }[];
  children: React.ReactNode;
}) {
  const [variantId, setState] = useState<string | null>(initialVariantId);

  // ?cor=marrom na chegada (link compartilhado ou código QR).
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("cor");
    const match = colors.find((c) => c.slug === slug);
    if (!match) return;
    const timer = setTimeout(() => setState(match.id), 0);
    return () => clearTimeout(timer);
    // Só na chegada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setVariantId = useCallback(
    (id: string | null) => {
      setState(id);
      const color = colors.find((c) => c.id === id);
      const url = new URL(window.location.href);
      if (color) url.searchParams.set("cor", color.slug);
      else url.searchParams.delete("cor");
      window.history.replaceState(window.history.state, "", url);
    },
    [colors],
  );

  const value = useMemo(() => ({ variantId, setVariantId }), [variantId, setVariantId]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** null fora da página de produto (ex.: componentes usados soltos em testes). */
export function useVariantSelection(): Selection | null {
  return useContext(SelectionContext);
}

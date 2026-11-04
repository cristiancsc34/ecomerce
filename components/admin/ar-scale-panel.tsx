"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { prepareArAction, type ArCheckResult } from "@/lib/admin/actions/ai";
import type { ModelBoundsCm, ProductDimensions } from "@/lib/catalog/types";
import { Button } from "@/components/ui/button";
import { RulerIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";

const cm = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const box = (b: { widthCm: number; depthCm: number; heightCm: number }) => `${cm(b.widthCm)} × ${cm(b.depthCm)} × ${cm(b.heightCm)} cm`;

/** O que falta no catálogo para conferir o tamanho real (largura, profundidade, altura). */
export function missingDimensions(d: ProductDimensions): string[] {
  return [!d.widthCm && "largura", !d.lengthCm && "profundidade", !d.heightCm && "altura"].filter(Boolean) as string[];
}

/**
 * Estúdio → "Arquivo do iPhone em tamanho real": mostra se o modelo 3D foi
 * conferido com as medidas do catálogo (±2 cm) e o .usdz publicado em tamanho
 * real; quando não, o aviso diz o porquê (o .usdz no tamanho do modelo continua,
 * para a câmera abrir no mesmo toque). O botão confere de novo (ex.: depois de
 * corrigir as medidas).
 */
export function ArScalePanel({
  productId,
  canEdit,
  realScale,
  boundsCm,
  dimensions,
  lastCheck,
}: {
  productId: string;
  canEdit: boolean;
  /** Conferido e ainda igual às medidas atuais do catálogo. */
  realScale: boolean;
  boundsCm: ModelBoundsCm | null;
  dimensions: ProductDimensions;
  /** Resultado da última conferência feita pelo estúdio ao gerar o 3D. */
  lastCheck: ArCheckResult | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ArCheckResult | { status: "erro"; message: string } | null>(null);
  const missing = missingDimensions(dimensions);

  async function check() {
    setBusy(true);
    setResult(null);
    const r = await prepareArAction(productId);
    setBusy(false);
    setResult(r.ok ? r.data : { status: "erro", message: r.error });
    if (r.ok) router.refresh();
  }

  // A última conferência do estúdio pode ter ficado para trás: "ok" com as medidas
  // de antes (alguém mudou o catálogo depois) ou "faltam medidas" já cadastradas.
  const outdatedOk = lastCheck?.status === "ok" && !realScale;
  const outdated = outdatedOk || (lastCheck?.status === "sem-medidas" && missing.length === 0);
  const shown = result ?? (realScale || outdated ? null : lastCheck);
  return (
    <div className="mt-4 rounded-2xl border border-line bg-white p-3" data-testid="ar-tamanho-real">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <RulerIcon className="h-5 w-5 text-air-blue-ink" /> Arquivo do iPhone em tamanho real (.usdz)
      </p>
      {realScale && boundsCm && !result ? (
        <Notice tone="success" className="mt-2" title="Tamanho real conferido">
          Modelo com {box(boundsCm)}, dentro de 2 cm das medidas do catálogo. Na loja, o AR mostra a peça em tamanho real
          (no iPhone, pelo arquivo .usdz).
        </Notice>
      ) : shown ? (
        <Notice
          tone={shown.status === "ok" ? "success" : shown.status === "erro" ? "danger" : "warning"}
          role="status"
          className="mt-2"
          title={shown.status === "ok" ? "Tamanho real conferido" : shown.status === "erro" ? "Não foi possível conferir" : "Tamanho real não conferido"}
        >
          {shown.message}
        </Notice>
      ) : (
        <Notice tone="warning" className="mt-2" title="Tamanho real não conferido">
          {missing.length
            ? `Cadastre ${missing.join(", ")} nas especificações. Sem as medidas, o AR mostra o tamanho aproximado (o cliente ajusta).`
            : outdatedOk
              ? "As medidas do catálogo mudaram depois da conferência. Confira de novo para voltar ao tamanho real."
              : "As medidas ainda não foram conferidas com o modelo 3D."}
        </Notice>
      )}
      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={check} loading={busy} loadingLabel="Conferindo…" disabled={missing.length > 0}>
            <RulerIcon className="h-4 w-4" /> Conferir medidas e gerar o arquivo do iPhone
          </Button>
          <span className="text-xs text-muted">
            {missing.length ? "Precisa de largura, profundidade e altura no catálogo." : "Tolerância de 2 cm em cada medida."}
          </span>
        </div>
      ) : null}
    </div>
  );
}

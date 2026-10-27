"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  deleteMediaAction,
  moveMediaAction,
  setPrimaryMediaAction,
  updateMediaAction,
  uploadMediaAction,
} from "@/lib/admin/actions/media";
import type { ActionResult } from "@/lib/admin/types";
import type { ProductMedia } from "@/lib/catalog/types";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES } from "@/lib/media/validate";
import { useHydrated } from "@/lib/use-hydrated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { controlClasses, FieldError, HelpText, Label } from "@/components/ui/field";
import { ArrowDownIcon, ArrowUpIcon, CubeIcon, TrashIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { ConfirmButton } from "./confirm-dialog";

const TYPE_LABEL = { image: "Imagem", video: "Vídeo", model_3d: "Modelo 3D" } as const;

export function MediaManager({ productId, media, canEdit }: { productId: string; media: ProductMedia[]; canEdit: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const sorted = [...media].sort((a, b) => a.sortOrder - b.sortOrder);

  function run(task: () => Promise<ActionResult>, success: string) {
    startTransition(async () => {
      const result = await task();
      setMessage(result.ok ? { tone: "success", text: success } : { tone: "danger", text: result.error });
      if (result.ok) router.refresh();
    });
  }

  return (
    <section aria-labelledby="midia-titulo" className="rounded-[1.25rem] border border-line bg-white p-5 sm:p-6">
      <h2 id="midia-titulo" className="text-lg font-bold">
        Fotos, vídeos e 3D
      </h2>
      <p className="mt-1 text-sm text-muted">
        Ideal: foto frontal/¾, lateral (altura), detalhe do tecido e foto ambientada. O original é guardado como enviado.
      </p>

      <div role="status" aria-live="polite" className="mt-4 min-h-6">
        {message ? (
          <p className={`text-sm font-medium ${message.tone === "success" ? "text-success" : "text-danger"}`}>{message.text}</p>
        ) : null}
      </div>

      {sorted.length ? (
        <ol className="mt-2 space-y-4" aria-busy={pending}>
          {sorted.map((m, i) => (
            <MediaRow
              key={m.id}
              media={m}
              index={i}
              total={sorted.length}
              canEdit={canEdit && !pending}
              onMove={(dir) => run(() => moveMediaAction(productId, m.id, dir), "Ordem atualizada.")}
              onPrimary={() => run(() => setPrimaryMediaAction(m.id), "Foto principal definida.")}
              onSave={(altText, isIllustrative) => run(() => updateMediaAction(m.id, { altText, isIllustrative }), "Texto alternativo salvo.")}
              onDelete={async () => {
                const result = await deleteMediaAction(m.id);
                setMessage(result.ok ? { tone: "success", text: "Mídia removida." } : { tone: "danger", text: result.error });
                if (result.ok) router.refresh();
              }}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted">Nenhuma mídia enviada ainda.</p>
      )}

      {canEdit ? <UploadForm productId={productId} onDone={(text) => { setMessage({ tone: "success", text }); router.refresh(); }} /> : null}
    </section>
  );
}

function MediaRow({
  media,
  index,
  total,
  canEdit,
  onMove,
  onPrimary,
  onSave,
  onDelete,
}: {
  media: ProductMedia;
  index: number;
  total: number;
  canEdit: boolean;
  onMove: (dir: "up" | "down") => void;
  onPrimary: () => void;
  onSave: (altText: string, isIllustrative: boolean) => void;
  onDelete: () => Promise<void>;
}) {
  const [alt, setAlt] = useState(media.altText);
  const [illustrative, setIllustrative] = useState(media.isIllustrative);
  const changed = alt !== media.altText || illustrative !== media.isIllustrative;
  const id = `media-${media.id}`;
  const altError = alt.trim().length < 5 ? "Descreva em pelo menos 5 caracteres." : undefined;

  return (
    <li className="grid gap-4 rounded-2xl border border-line bg-cloud p-4 sm:grid-cols-[9rem_1fr]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-pale-blue">
        {media.type === "image" ? (
          <Image src={media.url} alt="" fill sizes="144px" unoptimized={media.url.endsWith(".svg")} className="object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-deep-fjord">
            <CubeIcon className="h-8 w-8" />
            <span className="text-xs font-semibold">{TYPE_LABEL[media.type]}</span>
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-deep-fjord">
            {index + 1}. {TYPE_LABEL[media.type]}
          </span>
          {media.isPrimary ? <Badge tone="dark">Principal</Badge> : null}
          {media.isIllustrative ? <Badge tone="demo">Ilustrativa</Badge> : null}
          {media.aiGenerated ? (
            <Badge tone={media.pendingReview ? "warm" : "info"}>{media.pendingReview ? "IA · aguardando conferência" : "IA · aprovada"}</Badge>
          ) : null}
          {media.width && media.height ? (
            <span className="text-xs text-muted">
              {media.width}×{media.height}
            </span>
          ) : null}
        </div>
        <div>
          <Label htmlFor={`${id}-alt`}>Texto alternativo</Label>
          <input
            id={`${id}-alt`}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            maxLength={300}
            disabled={!canEdit}
            aria-invalid={altError ? true : undefined}
            aria-describedby={`${id}-alt-help${altError ? ` ${id}-alt-error` : ""}`}
            className={controlClasses}
          />
          <HelpText id={`${id}-alt-help`}>Descreva o que aparece, para quem usa leitor de tela.</HelpText>
          <FieldError id={`${id}-alt-error`}>{altError}</FieldError>
        </div>
        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={illustrative}
            onChange={(e) => setIllustrative(e.target.checked)}
            disabled={!canEdit}
            className="h-5 w-5 accent-[var(--color-deep-fjord)]"
          />
          Ilustrativa (não é foto real do produto) — a loja mostra o aviso
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={!canEdit || !changed || Boolean(altError)} onClick={() => onSave(alt.trim(), illustrative)}>
            Salvar texto
          </Button>
          {media.type === "image" && !media.isPrimary ? (
            <Button size="sm" variant="soft" disabled={!canEdit || media.pendingReview} onClick={onPrimary}>
              Tornar principal
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={!canEdit || index === 0} onClick={() => onMove("up")}>
            <ArrowUpIcon className="h-4 w-4" />
            <span className="sr-only">Mover mídia {index + 1} para cima</span>
          </Button>
          <Button size="sm" variant="ghost" disabled={!canEdit || index === total - 1} onClick={() => onMove("down")}>
            <ArrowDownIcon className="h-4 w-4" />
            <span className="sr-only">Mover mídia {index + 1} para baixo</span>
          </Button>
          <ConfirmButton
            label={
              <>
                <TrashIcon className="h-4 w-4" /> Remover
              </>
            }
            triggerVariant="ghost"
            disabled={!canEdit}
            title="Remover esta mídia?"
            description="O arquivo será apagado do armazenamento se nenhum outro produto o usar. Esta ação não pode ser desfeita."
            confirmLabel="Remover"
            onConfirm={onDelete}
          />
        </div>
      </div>
    </li>
  );
}

function UploadForm({ productId, onDone }: { productId: string; onDone: (text: string) => void }) {
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // onSubmit (e não `action`): o React 19 limpa formulários com `action` ao
  // terminar, e quem errou o arquivo perderia o texto alternativo digitado.
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setFieldErrors({});
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setFieldErrors({ file: "Escolha um arquivo." });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setFieldErrors({ file: "O arquivo passa de 4 MB. Comprima e tente de novo." });
      return;
    }
    if (String(formData.get("altText") ?? "").trim().length < 5) {
      setFieldErrors({ altText: "Descreva a imagem em pelo menos 5 caracteres." });
      return;
    }
    setBusy(true);
    try {
      const result = await uploadMediaAction(productId, formData);
      if (!result.ok) {
        const fields = result.fieldErrors ?? {};
        setFieldErrors(fields);
        // Erro de um campo aparece junto dele; o aviso geral fica para o resto.
        setError(Object.keys(fields).length ? null : result.error);
        return;
      }
      formRef.current?.reset();
      onDone("Arquivo enviado.");
    } catch {
      setError("Falha no envio. Verifique sua conexão e o tamanho do arquivo (até 4 MB).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      data-ready={hydrated ? "true" : undefined}
      className="mt-6 space-y-4 rounded-2xl border border-dashed border-line p-4"
    >
      <h3 className="font-semibold">Enviar arquivo</h3>
      {error ? (
        <Notice tone="danger" role="alert" title="Não foi possível enviar">
          {error}
        </Notice>
      ) : null}
      <div>
        <Label htmlFor="upload-file">Arquivo</Label>
        <input
          id="upload-file"
          name="file"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          required
          aria-describedby={`upload-file-help${fieldErrors.file ? " upload-file-error" : ""}`}
          aria-invalid={fieldErrors.file ? true : undefined}
          className="block w-full text-sm text-ink file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-pale-blue file:px-4 file:font-semibold file:text-deep-fjord hover:file:bg-sky-mist"
        />
        <HelpText id="upload-file-help">
          JPG, PNG, WebP ou AVIF (mín. 400 px), MP4/WebM ou modelo 3D GLB. Até 4 MB.
        </HelpText>
        <FieldError id="upload-file-error">{fieldErrors.file}</FieldError>
      </div>
      <div>
        <Label htmlFor="upload-alt">Texto alternativo</Label>
        <input
          id="upload-alt"
          name="altText"
          required
          minLength={5}
          maxLength={300}
          placeholder="Ex.: Colchão Brisa visto de lado, mostrando a altura"
          aria-invalid={fieldErrors.altText ? true : undefined}
          aria-describedby={fieldErrors.altText ? "upload-alt-error" : undefined}
          className={controlClasses}
        />
        <FieldError id="upload-alt-error">{fieldErrors.altText}</FieldError>
      </div>
      <label className="flex items-center gap-3 text-sm text-ink">
        <input type="checkbox" name="isIllustrative" className="h-5 w-5 accent-[var(--color-deep-fjord)]" />
        É ilustrativa (montagem, ilustração ou imagem gerada) — não é foto real
      </label>
      {/* Antes da hidratação o envio não funcionaria: o botão só habilita depois. */}
      <Button type="submit" loading={busy} loadingLabel="Enviando…" disabled={!hydrated}>
        Enviar
      </Button>
    </form>
  );
}

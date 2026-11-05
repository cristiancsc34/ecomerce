"use client";

import Image from "next/image";
import { useId, useState, type ReactNode } from "react";
import { discardColorJobAction, publishColorVariantAction, requestColorVariantAction } from "@/lib/admin/actions/colors";
import { isPending, type AiJobView, type ColorPhotoView } from "@/lib/admin/ai-types";
import {
  COLOR_COST_LABEL,
  COLOR_NAME_MAX,
  parseColorInput,
  VIEW_TITLE,
  type CatalogView,
  type ColorSource,
} from "@/lib/admin/colors";
import { centsToInput } from "@/lib/catalog/money";
import type { ProductMedia, ProductVariant } from "@/lib/catalog/types";
import { Badge } from "@/components/ui/badge";
import { Button, Spinner } from "@/components/ui/button";
import { controlClasses, HelpText, Label } from "@/components/ui/field";
import { SparkIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { ConfirmButton } from "./confirm-dialog";

const viewTitle = (view: string | null) => (view && view in VIEW_TITLE ? VIEW_TITLE[view as CatalogView] : "Foto");

function Swatch({ hex, label }: { hex: string; label?: string }) {
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 rounded-full border border-line align-[-0.2em]"
      style={{ backgroundColor: hex }}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    />
  );
}

/** Campo de cor: seletor da tela + texto (#RRGGBB ou R, G, B), sempre iguais. */
function ColorField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
}) {
  const hex = parseColorInput(value);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (seletor)`}
          value={(hex ?? "#808080").toLowerCase()}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-line bg-white p-1 disabled:cursor-default"
        />
        <input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="#6B4A35 ou 107, 74, 53"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={value.trim() !== "" && !hex}
          aria-describedby={`${id}-ajuda`}
          disabled={disabled}
          className={controlClasses}
        />
      </div>
      <HelpText id={`${id}-ajuda`}>
        {value.trim() && !hex ? "Use #RRGGBB (ex.: #6B4A35) ou R, G, B (ex.: 107, 74, 53)." : "Código #RRGGBB ou RGB do tecido."}
      </HelpText>
    </div>
  );
}

export function ColorStudio({
  productId,
  canEdit,
  hydrated,
  jobs,
  workerOnline,
  canColor,
  sources,
  media,
  variants,
  productPriceCents,
  blocker,
  pendingProgress,
  onMessage,
  onChanged,
}: {
  productId: string;
  canEdit: boolean;
  hydrated: boolean;
  /** Tarefas color_variant do produto, em ordem. */
  jobs: AiJobView[];
  workerOnline: boolean;
  canColor: boolean;
  /** Fotos de catálogo aprovadas que servem de base (uma por ângulo). */
  sources: ColorSource[];
  /** Toda a mídia do produto (para achar o "antes" e as fotos de cor). */
  media: ProductMedia[];
  variants: ProductVariant[];
  productPriceCents: number | null;
  /** Motivo para não poder criar cores neste produto (ou null). */
  blocker: string | null;
  /** Barra de progresso da tarefa em andamento (desenhada pelo Estúdio). */
  pendingProgress: ReactNode;
  onMessage: (text: string, ok: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const formId = useId();
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  // A mensagem aparece também aqui, perto da etapa (o Estúdio mostra a dele no topo).
  const say = (text: string, ok: boolean) => {
    setNote({ text, ok });
    onMessage(text, ok);
  };
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [requesting, setRequesting] = useState(false);
  const colors = variants.filter((v) => v.colorHex).sort((a, b) => a.sortOrder - b.sortOrder);
  const pendingJob = jobs.find(isPending) ?? null;
  const latest = jobs.at(-1) ?? null;
  const pendingByJob = new Map<string, ProductMedia[]>();
  for (const m of media) {
    if (m.colorJobId && m.pendingReview) pendingByJob.set(m.colorJobId, [...(pendingByJob.get(m.colorJobId) ?? []), m]);
  }
  const toReview = jobs.filter((j) => j.status === "succeeded" && j.color && pendingByJob.has(j.id));
  const hex = parseColorInput(color);
  const canRequest = hydrated && canEdit && !blocker && sources.length > 0 && !pendingJob && (!workerOnline || canColor);

  async function request() {
    setRequesting(true);
    const result = await requestColorVariantAction(productId, { name, color });
    setRequesting(false);
    if (!result.ok) return say(result.error, false);
    say(`Cor “${name.trim()}” pedida: as fotos ficam prontas em cerca de 1 minuto.`, true);
    setName("");
    setColor("");
    await onChanged();
  }

  return (
    <>
      <h3 id="estudio-cores" className="mt-6 flex scroll-mt-32 items-center gap-2 font-bold">
        <SparkIcon className="h-5 w-5 text-air-blue-ink" /> 5. Cores <Badge tone="neutral">opcional</Badge>
      </h3>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Outra cor do mesmo produto, a partir das fotos de catálogo aprovadas: o GPT troca só a cor do tecido. Só cores que a
        loja realmente vende. Você confere foto por foto antes de ir para a loja, onde elas aparecem como “Imagem
        ilustrativa” até chegar a foto real da cor.
      </p>

      <p role="status" aria-live="polite" className={`mt-1 min-h-5 text-sm font-medium ${note?.ok ? "text-success" : "text-danger"}`}>
        {note?.text}
      </p>

      {colors.length ? (
        <ul aria-label="Cores deste produto" className="mt-2 flex flex-wrap gap-2 text-sm" data-testid="cores-do-produto">
          {colors.map((v, i) => (
            <li key={v.id}>
              <Badge tone={i === 0 ? "info" : "neutral"}>
                <Swatch hex={v.colorHex!} /> {v.name}
                {i === 0 ? " · cor das fotos originais" : null}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {blocker ? (
        <div className="mt-2">
          <Notice tone="warning" title="Este produto não pode ganhar cores agora">
            {blocker}
          </Notice>
        </div>
      ) : !sources.length ? (
        <p className="mt-2 text-sm text-muted">Primeiro aprove as fotos de catálogo (etapa 2): elas são a base de cada cor.</p>
      ) : workerOnline && !canColor ? (
        <div className="mt-2">
          <Notice tone="warning" title="Gerador de cores ainda não ligado">
            Falta a chave da OpenAI (<code>OPENAI_API_KEY</code>) na Vercel.
          </Notice>
        </div>
      ) : null}

      {canEdit && !blocker && sources.length ? (
        <form
          className="mt-3 grid gap-3 rounded-2xl border border-line bg-cloud p-3 sm:grid-cols-2"
          aria-label="Nova cor"
          onSubmit={(e) => {
            e.preventDefault();
            void request();
          }}
        >
          <div>
            <Label htmlFor={`${formId}-nome`}>Nome da cor</Label>
            <input
              id={`${formId}-nome`}
              type="text"
              maxLength={COLOR_NAME_MAX}
              placeholder="ex.: Linho bege"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canRequest}
              className={controlClasses}
            />
          </div>
          <ColorField id={`${formId}-cor`} label="Cor do tecido" value={color} onChange={setColor} disabled={!canRequest} />
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" loading={requesting} loadingLabel="Pedindo…" disabled={!canRequest || !name.trim() || !hex}>
              <SparkIcon className="h-5 w-5" /> Gerar fotos nesta cor
            </Button>
            <span className="text-sm text-muted">
              {sources.length} {sources.length === 1 ? "foto" : "fotos"} ({sources.map((s) => viewTitle(s.view).toLowerCase()).join(", ")}) ·{" "}
              {COLOR_COST_LABEL}
            </span>
          </div>
        </form>
      ) : null}

      {pendingJob ? (
        <div className="mt-4 rounded-2xl border border-line bg-cloud p-3" data-testid="cor-gerando">
          <p className="text-sm font-semibold">
            {pendingJob.color ? (
              <>
                <Swatch hex={pendingJob.color.hex} /> Cor “{pendingJob.color.name}”
              </>
            ) : (
              "Cor nova"
            )}
          </p>
          <ol className="mt-2 grid grid-cols-2 gap-2" aria-label="Fotos na cor nova sendo criadas">
            {(pendingJob.color?.sourceMediaIds ?? []).map((id, i) => {
              const source = sources.find((s) => s.media.id === id);
              return (
                <li key={id} className="flex aspect-[4/3] items-center justify-center gap-2 overflow-hidden rounded-xl bg-pale-blue text-xs font-semibold text-air-blue-ink">
                  {pendingJob.status === "running" ? <Spinner className="h-5 w-5" /> : null}
                  {viewTitle(source?.view ?? null) === "Foto" ? `Foto ${i + 1}` : viewTitle(source?.view ?? null)}
                </li>
              );
            })}
          </ol>
          {pendingProgress}
        </div>
      ) : null}
      {latest?.status === "failed" && latest.error ? <p className="mt-2 text-sm text-danger">{latest.error}</p> : null}

      {toReview.map((job) => (
        <ColorReview
          key={job.id}
          job={job}
          pending={pendingByJob.get(job.id) ?? []}
          media={media}
          canEdit={canEdit}
          firstColor={!colors.length}
          defaultPriceCents={colors[0]?.priceCents ?? productPriceCents}
          onMessage={say}
          onChanged={onChanged}
        />
      ))}
    </>
  );
}

function ColorReview({
  job,
  pending,
  media,
  canEdit,
  firstColor,
  defaultPriceCents,
  onMessage,
  onChanged,
}: {
  job: AiJobView;
  pending: ProductMedia[];
  media: ProductMedia[];
  canEdit: boolean;
  firstColor: boolean;
  defaultPriceCents: number | null;
  onMessage: (text: string, ok: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const id = useId();
  const color = job.color!;
  const byId = new Map(media.map((m) => [m.id, m]));
  const pendingIds = new Set(pending.map((m) => m.id));
  const photos = color.photos.filter((p) => pendingIds.has(p.mediaId));
  // Fotos sem relatório (ex.: tarefa antiga) também aparecem.
  const extra = pending.filter((m) => !photos.some((p) => p.mediaId === m.id));
  const rows: { photo: ColorPhotoView | null; after: ProductMedia }[] = [
    ...photos.flatMap((p) => (byId.get(p.mediaId) ? [{ photo: p, after: byId.get(p.mediaId)! }] : [])),
    ...extra.map((m) => ({ photo: null, after: m })),
  ];
  const [chosen, setChosen] = useState(() => new Set(rows.map((r) => r.after.id)));
  const [price, setPrice] = useState(centsToInput(defaultPriceCents));
  const [stock, setStock] = useState("");
  const measuredOriginal = photos.find((p) => p.originalHex)?.originalHex ?? "";
  const [original, setOriginal] = useState({ name: "", color: measuredOriginal, price: centsToInput(defaultPriceCents), stock: "" });

  // Só as escolhidas que ainda existem (uma foto pode ter sido apagada em "Fotos na loja").
  const selected = rows.map((r) => r.after.id).filter((mediaId) => chosen.has(mediaId));

  async function publish() {
    const result = await publishColorVariantAction(job.id, {
      mediaIds: selected,
      price,
      stock,
      ...(firstColor ? { original } : {}),
    });
    onMessage(result.ok ? `Cor “${color.name}” publicada.` : result.error, result.ok);
    if (result.ok) await onChanged();
  }

  async function discard() {
    const result = await discardColorJobAction(job.id);
    onMessage(result.ok ? `Fotos da cor “${color.name}” descartadas.` : result.error, result.ok);
    if (result.ok) await onChanged();
  }

  const fieldClass = `${controlClasses} max-w-48`;
  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="mt-4 rounded-2xl border border-line bg-white p-3 sm:p-4"
      data-testid="cor-conferir"
      data-cor={color.name}
    >
      <h4 id={`${id}-titulo`} className="flex flex-wrap items-center gap-2 font-semibold">
        <Swatch hex={color.hex} /> Conferir a cor “{color.name}” <span className="font-normal text-muted">({color.hex})</span>
      </h4>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Compare cada foto com a original: a peça tem de ser a mesma (formato, madeira, peças e acabamento), sem nada
        acrescentado. Só o tecido muda de cor. Desmarque a foto que não estiver boa.
      </p>
      <ol className="mt-3 space-y-3" aria-label={`Fotos na cor ${color.name}`}>
        {rows.map(({ photo, after }) => {
          const before = photo ? byId.get(photo.sourceMediaId) : undefined;
          const title = viewTitle(photo?.view ?? null);
          return (
            <li key={after.id} className="rounded-xl border border-line bg-cloud p-2" data-testid="foto-cor">
              <div className="grid grid-cols-2 gap-2">
                <figure>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-white">
                    {before ? <Image src={before.url} alt={`Antes: ${before.altText}`} fill sizes="(min-width: 640px) 320px, 50vw" className="object-cover" /> : null}
                  </div>
                  <figcaption className="mt-1 text-xs text-muted">Antes · {title}</figcaption>
                </figure>
                <figure>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-white">
                    <Image src={after.url} alt={`Depois: ${after.altText}`} fill sizes="(min-width: 640px) 320px, 50vw" className="object-cover" />
                  </div>
                  <figcaption className="mt-1 text-xs text-muted">Depois · {title}</figcaption>
                </figure>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {photo?.colorHex ? (
                    <span className="inline-flex items-start gap-2">
                      <Swatch hex={photo.colorHex} />
                      <span>
                        Cor medida no tecido: {photo.colorHex}
                        {photo.colorDeltaE !== null ? ` (diferença ${photo.colorDeltaE.toLocaleString("pt-BR")} da pedida)` : null}
                      </span>
                    </span>
                  ) : null}
                  {photo?.warnings.map((w) => (
                    <Badge key={w} tone="warm">
                      {w}
                    </Badge>
                  ))}
                </p>
                {canEdit ? (
                  <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={chosen.has(after.id)}
                      onChange={(e) => {
                        const next = new Set(chosen);
                        if (e.target.checked) next.add(after.id);
                        else next.delete(after.id);
                        setChosen(next);
                      }}
                    />
                    Usar esta foto<span className="sr-only"> ({title})</span>
                  </label>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {canEdit ? (
        <div className="mt-4 space-y-4">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold">Preço e estoque da cor “{color.name}”</legend>
            <div>
              <Label htmlFor={`${id}-preco`}>Preço (R$)</Label>
              <input id={`${id}-preco`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1.299,90" className={fieldClass} />
            </div>
            <div>
              <Label htmlFor={`${id}-estoque`} optional>
                Estoque
              </Label>
              <input id={`${id}-estoque`} inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} className={fieldClass} />
            </div>
          </fieldset>

          {firstColor ? (
            <fieldset className="grid gap-3 rounded-xl border border-line bg-cloud p-3 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold">Cor atual (a das fotos originais)</legend>
              <p className="text-sm text-muted sm:col-span-2">
                É a primeira cor: o produto passa a ter o seletor “Cor”, e a cor das fotos originais entra em primeiro lugar.
                {measuredOriginal ? " A cor abaixo foi medida nas fotos: ajuste para a do tecido de verdade." : null}
              </p>
              <div>
                <Label htmlFor={`${id}-orig-nome`}>Nome da cor atual</Label>
                <input
                  id={`${id}-orig-nome`}
                  maxLength={COLOR_NAME_MAX}
                  placeholder="ex.: Azul-marinho"
                  value={original.name}
                  onChange={(e) => setOriginal({ ...original, name: e.target.value })}
                  className={controlClasses}
                />
              </div>
              <ColorField id={`${id}-orig-cor`} label="Cor atual do tecido" value={original.color} onChange={(c) => setOriginal({ ...original, color: c })} />
              <div>
                <Label htmlFor={`${id}-orig-preco`}>Preço da cor atual (R$)</Label>
                <input
                  id={`${id}-orig-preco`}
                  inputMode="decimal"
                  value={original.price}
                  onChange={(e) => setOriginal({ ...original, price: e.target.value })}
                  placeholder="1.299,90"
                  className={fieldClass}
                />
              </div>
              <div>
                <Label htmlFor={`${id}-orig-estoque`} optional>
                  Estoque da cor atual
                </Label>
                <input
                  id={`${id}-orig-estoque`}
                  inputMode="numeric"
                  value={original.stock}
                  onChange={(e) => setOriginal({ ...original, stock: e.target.value })}
                  className={fieldClass}
                />
              </div>
            </fieldset>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <ConfirmButton
              label={`Publicar a cor “${color.name}”`}
              variant="primary"
              triggerVariant="primary"
              disabled={!selected.length}
              title={`Publicar a cor “${color.name}” na loja?`}
              description={
                <>
                  A cor aparece no seletor da página do produto com {selected.length === 1 ? "esta foto" : `estas ${selected.length} fotos`},
                  marcadas como “Imagem ilustrativa”. Confira também se o nome e a descrição do produto citam a cor antiga.
                </>
              }
              requireCheck="Conferi cada foto com a original: é a mesma peça (formato, madeira, peças e acabamento), nada foi acrescentado e só o tecido mudou de cor."
              confirmLabel="Publicar a cor"
              onConfirm={publish}
            />
            <ConfirmButton
              label="Descartar estas fotos"
              triggerVariant="ghost"
              title={`Descartar as fotos da cor “${color.name}”?`}
              description="As fotos geradas são apagadas. As fotos de catálogo continuam."
              confirmLabel="Descartar"
              onConfirm={discard}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

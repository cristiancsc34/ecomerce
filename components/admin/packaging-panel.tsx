"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { saveProductPackagingAction } from "@/lib/admin/actions/packaging";
import type { ProductPackaging } from "@/lib/admin/packaging";
import { MAX_BOXES, type ShippingBox } from "@/lib/shipping/packages";
import { Button } from "@/components/ui/button";
import { controlClasses, FieldError } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

type BoxText = Record<keyof ShippingBox, string>;

const FIELDS: { key: keyof ShippingBox; label: string; unit: string }[] = [
  { key: "weightKg", label: "Peso", unit: "kg" },
  { key: "lengthCm", label: "Comprimento", unit: "cm" },
  { key: "widthCm", label: "Largura", unit: "cm" },
  { key: "heightCm", label: "Altura", unit: "cm" },
];

const EMPTY: BoxText = { weightKg: "", lengthCm: "", widthCm: "", heightCm: "" };
const toText = (b: ShippingBox): BoxText => ({
  weightKg: String(b.weightKg).replace(".", ","),
  lengthCm: String(b.lengthCm).replace(".", ","),
  widthCm: String(b.widthCm).replace(".", ","),
  heightCm: String(b.heightCm).replace(".", ","),
});
/** "32,5" → 32.5; vazio ou inválido → NaN (o servidor recusa com a mensagem do campo). */
const toNumber = (v: string) => (v.trim() ? Number(v.trim().replace(",", ".")) : NaN);
const toBox = (t: BoxText): ShippingBox => ({
  weightKg: toNumber(t.weightKg),
  lengthCm: toNumber(t.lengthCm),
  widthCm: toNumber(t.widthCm),
  heightCm: toNumber(t.heightCm),
});

function BoxesEditor({
  boxes,
  onChange,
  disabled,
  errors,
  errorPrefix,
  label,
}: {
  boxes: BoxText[];
  onChange: (next: BoxText[]) => void;
  disabled: boolean;
  errors: Record<string, string>;
  errorPrefix: string;
  label: string;
}) {
  const id = useId();
  return (
    <div className="space-y-3">
      {boxes.map((box, i) => (
        <fieldset key={i} className="rounded-xl border border-line bg-cloud p-3">
          <legend className="px-1 text-sm font-semibold text-ink">
            {label} — caixa {i + 1}
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIELDS.map((f) => {
              const fid = `${id}-${i}-${f.key}`;
              const error = errors[`${errorPrefix}.${i}.${f.key}`];
              return (
                <div key={f.key}>
                  <label htmlFor={fid} className="mb-1 block text-sm font-medium text-ink">
                    {f.label} ({f.unit})
                  </label>
                  <input
                    id={fid}
                    inputMode="decimal"
                    value={box[f.key]}
                    disabled={disabled}
                    aria-invalid={error ? true : undefined}
                    onChange={(e) => onChange(boxes.map((b, j) => (j === i ? { ...b, [f.key]: e.target.value } : b)))}
                    className={controlClasses}
                  />
                  <FieldError>{error}</FieldError>
                </div>
              );
            })}
          </div>
          {disabled ? null : (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange(boxes.filter((_, j) => j !== i))}>
              Remover caixa {i + 1}
            </Button>
          )}
        </fieldset>
      ))}
      {disabled ? null : (
        <Button variant="soft" size="sm" onClick={() => onChange([...boxes, { ...EMPTY }])} disabled={boxes.length >= MAX_BOXES}>
          Adicionar caixa
        </Button>
      )}
    </div>
  );
}

/**
 * Aba Preço → "Embalagem para o frete": peso e medidas de cada caixa do produto JÁ EMBALADO (um sofá pode vir em 2
 * caixas). Com as caixas cadastradas e a integração ligada, a loja cota o frete com as transportadoras pelo CEP.
 * Sem caixas, o frete fica "a combinar". Nada é preenchido sozinho: só o que a equipe medir.
 */
export function PackagingPanel({
  productId,
  canEdit,
  packaging,
  carrierEnabled,
}: {
  productId: string;
  canEdit: boolean;
  packaging: ProductPackaging;
  /** Integração com a transportadora ligada na Vercel (só informa; as caixas podem ser cadastradas antes). */
  carrierEnabled: boolean;
}) {
  const router = useRouter();
  const [product, setProduct] = useState<BoxText[]>(packaging.available ? packaging.product.map(toText) : []);
  const [variants, setVariants] = useState(
    packaging.available ? packaging.variants.map((v) => ({ id: v.id, name: v.name, own: v.boxes !== null, boxes: (v.boxes ?? []).map(toText) })) : [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!packaging.available) {
    return (
      <section aria-labelledby="embalagem-titulo" className="mt-4 rounded-2xl border border-line bg-white p-4 sm:p-6">
        <h2 id="embalagem-titulo" className="text-lg font-bold">
          Embalagem para o frete
        </h2>
        <Notice tone="info" className="mt-3">
          O cadastro de peso e medidas da embalagem fica disponível depois de aplicar a migração
          20261119000200_frete_transportadoras.sql no banco. Até lá, o frete segue pelas formas de entrega da loja ou
          “a combinar”.
        </Notice>
      </section>
    );
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setErrors({});
    const r = await saveProductPackagingAction(productId, {
      product: product.map(toBox),
      variants: variants.map((v) => ({ id: v.id, boxes: v.own ? v.boxes.map(toBox) : null })),
    });
    setSaving(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      setMessage({ tone: "danger", text: r.error });
      return;
    }
    setMessage({ tone: "success", text: "Embalagem salva." });
    router.refresh();
  }

  return (
    <section aria-labelledby="embalagem-titulo" className="mt-4 rounded-2xl border border-line bg-white p-4 sm:p-6" data-testid="embalagem-frete">
      <h2 id="embalagem-titulo" className="text-lg font-bold">
        Embalagem para o frete
      </h2>
      <p className="mt-1 text-sm text-muted">
        Peso e medidas de cada caixa com o produto <strong>já embalado</strong> (meça com a fita e pese a caixa pronta).
        Sem isso, a loja não cota com as transportadoras e o frete fica “a combinar”.
        {carrierEnabled ? " A cotação com as transportadoras está ligada." : " A cotação com as transportadoras ainda está desligada (veja Entrega e avisos)."}
      </p>

      <div className="mt-5 space-y-5">
        {product.length === 0 && !canEdit ? <p className="text-sm text-muted">Sem caixas cadastradas.</p> : null}
        <BoxesEditor boxes={product} onChange={setProduct} disabled={!canEdit || saving} errors={errors} errorPrefix="product" label="Produto" />

        {variants.length ? (
          <div className="space-y-4 border-t border-line pt-4">
            <p className="text-sm text-muted">
              Opções com embalagem diferente (ex.: tamanhos de colchão) podem ter caixas próprias. Sem marcar, usam as
              caixas do produto.
            </p>
            {variants.map((v, vi) => (
              <div key={v.id} className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-deep-fjord"
                    checked={v.own}
                    disabled={!canEdit || saving}
                    onChange={(e) => setVariants((all) => all.map((x, j) => (j === vi ? { ...x, own: e.target.checked } : x)))}
                  />
                  {v.name}: caixas próprias
                </label>
                {v.own ? (
                  <BoxesEditor
                    boxes={v.boxes}
                    onChange={(next) => setVariants((all) => all.map((x, j) => (j === vi ? { ...x, boxes: next } : x)))}
                    disabled={!canEdit || saving}
                    errors={errors}
                    errorPrefix={`variants.${vi}.boxes`}
                    label={v.name}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {message ? (
          <Notice tone={message.tone} role="status">
            {message.text}
          </Notice>
        ) : null}
        {canEdit ? (
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar embalagem"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

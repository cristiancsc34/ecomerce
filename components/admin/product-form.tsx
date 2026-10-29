"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { get, useFieldArray, useForm, useWatch, type FieldErrors, type Path, type UseFormRegister } from "react-hook-form";
import { copyDraftAction } from "@/lib/admin/actions/ai";
import { saveProductAction } from "@/lib/admin/actions/products";
import { productToFormValues } from "@/lib/admin/form-values";
import { useHydrated } from "@/lib/use-hydrated";
import { slugify } from "@/lib/catalog/slug";
import type { ProductTab } from "@/lib/admin/readiness";
import { FIRMNESS_LABELS, FIRMNESS_LEVELS, SIZE_INFO, SIZE_KEYS, type Category, type Product } from "@/lib/catalog/types";
import {
  formOutputToSaveInput,
  productFormSchema,
  type ProductFormOutput,
  type ProductFormValues,
} from "@/lib/validation/product";
import type { CopyDraft } from "@/lib/ai/copy-draft";
import { Button } from "@/components/ui/button";
import { controlClasses, FieldError, HelpText, Label } from "@/components/ui/field";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PlusIcon, SparkIcon, TrashIcon } from "@/components/ui/icons";

type FormPath = Path<ProductFormValues>;

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-line bg-white p-4 sm:p-6">
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function TextField({
  name,
  label,
  register,
  errors,
  help,
  optional,
  multiline,
  rows,
  prefix,
  inputMode,
  placeholder,
  counter,
  maxLength,
  className = "",
}: {
  name: FormPath;
  label: string;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  help?: ReactNode;
  optional?: boolean;
  multiline?: boolean;
  rows?: number;
  prefix?: string;
  inputMode?: "decimal" | "numeric" | "text";
  placeholder?: string;
  counter?: number;
  maxLength?: number;
  className?: string;
}) {
  const id = `f-${name.replace(/\./g, "-")}`;
  const error = (get(errors, name) as { message?: string } | undefined)?.message;
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    placeholder,
    ...register(name),
  };
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} optional={optional}>
          {label}
        </Label>
        {maxLength !== undefined && counter !== undefined ? (
          <span className={`mb-1.5 text-xs ${counter > maxLength ? "font-semibold text-danger" : "text-muted"}`} aria-live="polite">
            {counter}/{maxLength}
          </span>
        ) : null}
      </div>
      {multiline ? (
        <textarea className={`${controlClasses} min-h-28`} rows={rows ?? 4} {...common} />
      ) : prefix ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">{prefix}</span>
          <input className={`${controlClasses} pl-10`} inputMode={inputMode} {...common} />
        </div>
      ) : (
        <input className={controlClasses} inputMode={inputMode} {...common} />
      )}
      {help ? <HelpText id={`${id}-help`}>{help}</HelpText> : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

/** Em que aba fica cada campo (para levar a pessoa até o erro ao salvar). */
function tabOfField(field: string): ProductTab {
  const root = field.split(".")[0];
  if (["name", "categoryId", "shortDescription", "description"].includes(root)) return "informacoes";
  if (["price", "compareAtPrice", "sku", "stockQuantity", "variants"].includes(root)) return "preco";
  if (["slug", "seoTitle", "seoDescription"].includes(root)) return "seo";
  return "detalhes";
}

/** Campos de colchão (firmeza, camadas, tamanhos-padrão) só aparecem em categorias de colchão. */
function isMattressCategory(slug: string | undefined): boolean {
  return Boolean(slug && /colch/.test(slug));
}

export function ProductForm({
  product,
  categories,
  canEdit,
  siteUrl,
  tab,
  onTabChange,
  onDirtyChange,
  aiCopyEnabled = false,
}: {
  product: Product;
  categories: Pick<Category, "id" | "name" | "slug">[];
  canEdit: boolean;
  siteUrl: string;
  /** Aba aberta; na aba de fotos o formulário fica escondido (mas montado: nada se perde). */
  tab: ProductTab;
  onTabChange: (tab: ProductTab) => void;
  /** Avisa o painel lateral (publicar só depois de salvar). */
  onDirtyChange?: (dirty: boolean) => void;
  /** A chave da OpenAI está no servidor: mostra o "Aprimorar descrição". */
  aiCopyEnabled?: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [slugTouched, setSlugTouched] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProductFormValues, unknown, ProductFormOutput>({
    resolver: zodResolver(productFormSchema),
    defaultValues: productToFormValues(product),
    mode: "onBlur",
  });

  // Depois de salvar, a página recarrega o produto com os ids das variações
  // criadas; sem isso, o próximo salvamento as recriaria (e quebraria sacolas).
  const syncedVersion = useRef(product.updatedAt);
  useEffect(() => {
    if (product.updatedAt === syncedVersion.current) return;
    syncedVersion.current = product.updatedAt;
    if (!isDirty) reset(productToFormValues(product));
  }, [product, isDirty, reset]);

  const variants = useFieldArray({ control, name: "variants", keyName: "key" });
  const specs = useFieldArray({ control, name: "extraSpecs" });
  const faq = useFieldArray({ control, name: "faq" });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  // Aviso ao sair com alterações não salvas.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Enquanto o slug não for editado à mão, ele acompanha o nome.
  const nameField = register("name", {
    onChange: (e) => {
      if (!slugTouched) setValue("slug", slugify(String(e.target.value)), { shouldDirty: true });
    },
  });
  const slugField = register("slug", { onChange: () => setSlugTouched(true) });

  const goToFirstError = (fields: string[]) => {
    const first = fields[0];
    if (!first) return;
    onTabChange(tabOfField(first));
    requestAnimationFrame(() => document.getElementById(`f-${first.replace(/\./g, "-")}`)?.focus());
  };

  const onSubmit = handleSubmit(
    async (out) => {
      setServerError(null);
      const result = await saveProductAction(product.id, formOutputToSaveInput(out));
      if (!result.ok) {
        setServerError(result.error);
        const fields = Object.keys(result.fieldErrors ?? {});
        for (const field of fields) setError(field as FormPath, { type: "server", message: result.fieldErrors![field] });
        goToFirstError(fields);
        return;
      }
      reset(getValues());
      setSavedAt(new Date());
      router.refresh();
    },
    (errs) => {
      setServerError("Revise os campos destacados.");
      goToFirstError(Object.keys(errs));
    },
  );

  // "Aprimorar descrição": usa a leitura das fotos que a IA já fez e guardou (não gasta de novo).
  const [improving, setImproving] = useState<"idle" | "busy" | "writing">("idle");
  const [improved, setImproved] = useState<{ tone: "success" | "danger"; text: string; draft?: CopyDraft } | null>(null);
  async function improveDescription() {
    setImproving("busy");
    setImproved(null);
    const started = Date.now();
    for (;;) {
      const r = await copyDraftAction(product.id);
      if (!r.ok) {
        setImproved({ tone: "danger", text: r.error });
        break;
      }
      if (r.data.status === "ready") {
        const d = r.data.draft;
        const opts = { shouldDirty: true, shouldValidate: true } as const;
        setValue("shortDescription", d.shortDescription, opts);
        setValue("description", d.description, opts);
        // Os textos do Google só entram se ainda estiverem vazios (não apaga o que alguém escreveu).
        if (!getValues("seoTitle")) setValue("seoTitle", d.seoTitle, opts);
        if (!getValues("seoDescription")) setValue("seoDescription", d.seoDescription, opts);
        setImproved({ tone: "success", text: "Descrição preenchida a partir das fotos. Revise e toque em Salvar.", draft: d });
        break;
      }
      setImproving("writing");
      if (Date.now() - started > 90_000) {
        setImproved({ tone: "danger", text: "A IA ainda está escrevendo. Tente de novo em instantes." });
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    setImproving("idle");
  }

  const [seoTitle, seoDescription, name, shortDescription, slug, categoryId] = useWatch({
    control,
    name: ["seoTitle", "seoDescription", "name", "shortDescription", "slug", "categoryId"],
  });
  const mattress = isMattressCategory(categories.find((c) => c.id === categoryId)?.slug);
  const nameError = errors.name?.message;
  const slugError = errors.slug?.message;
  const showBar = tab !== "fotos" || isDirty || Boolean(serverError);

  return (
    <form onSubmit={onSubmit} noValidate aria-label={`Editar ${product.name}`}>
      <fieldset disabled={!canEdit || isSubmitting} className="min-w-0">
        <div hidden={tab !== "informacoes"} className="space-y-4">
          <Section id="sec-basico" title="Informações do produto" description="O que o cliente lê na loja.">
            <div>
              <Label htmlFor="f-name">Nome do produto</Label>
              <input
                id="f-name"
                className={controlClasses}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "f-name-error" : undefined}
                {...nameField}
              />
              <FieldError id="f-name-error">{nameError}</FieldError>
            </div>
            <div>
              <Label htmlFor="f-categoryId">Categoria</Label>
              <select id="f-categoryId" className={controlClasses} {...register("categoryId")}>
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <FieldError>{errors.categoryId?.message}</FieldError>
            </div>
            {aiCopyEnabled ? (
              <div className="rounded-xl border border-line bg-cloud p-3" data-testid="aprimorar-descricao">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={improveDescription}
                    loading={improving !== "idle"}
                    loadingLabel={improving === "writing" ? "A IA está terminando de escrever…" : "Buscando…"}
                    disabled={!hydrated}
                  >
                    <SparkIcon className="h-5 w-5" /> Aprimorar descrição
                  </Button>
                  <span className="text-xs text-muted">
                    Texto vendável a partir das fotos, lidas pela IA uma vez por produto. Nada é salvo sem você tocar em Salvar.
                  </span>
                </div>
                {improved ? (
                  <div role="status" className="mt-2 space-y-2 text-sm">
                    <p className={improved.tone === "success" ? "text-success" : "text-danger"}>{improved.text}</p>
                    {improved.draft?.unconfirmedNumbers.length ? (
                      <p className="text-danger">
                        Confira: o texto cita {improved.draft.unconfirmedNumbers.join(", ")}, que não está nos dados confirmados.
                      </p>
                    ) : null}
                    {improved.draft?.nameSuggestions.length ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted">Nomes sugeridos (toque para usar):</span>
                        {improved.draft.nameSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            className="min-h-9 rounded-full border border-line bg-white px-3 text-sm hover:bg-pale-blue"
                            onClick={() => setValue("name", suggestion, { shouldDirty: true, shouldValidate: true })}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <TextField
              name="shortDescription"
              label="Descrição curta"
              optional
              register={register}
              errors={errors}
              help="Uma frase que aparece logo abaixo do nome."
              counter={(shortDescription ?? "").length}
              maxLength={240}
            />
            <TextField
              name="description"
              label="Descrição completa"
              multiline
              rows={8}
              register={register}
              errors={errors}
              help="Deixe uma linha em branco entre parágrafos. Não inclua medidas, materiais ou garantias que não foram confirmados."
            />
          </Section>
        </div>

        <div hidden={tab !== "preco"} className="space-y-4">
          <Section id="sec-preco" title="Preço e estoque" description={variants.fields.length ? "Com variações, o preço de cada uma é definido abaixo." : undefined}>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField name="price" label="Preço" optional prefix="R$" inputMode="decimal" placeholder="0,00" register={register} errors={errors} />
              <TextField
                name="compareAtPrice"
                label="Preço “de”"
                optional
                prefix="R$"
                inputMode="decimal"
                register={register}
                errors={errors}
                help="Só se for um preço real praticado antes (nada de desconto fictício)."
              />
              <TextField
                name="stockQuantity"
                label="Estoque"
                optional
                inputMode="numeric"
                register={register}
                errors={errors}
                help="Vazio = a loja não mostra disponibilidade."
              />
              <TextField name="sku" label="Código interno (SKU)" optional register={register} errors={errors} />
            </div>
          </Section>

          <Section
            id="sec-variacoes"
            title="Variações"
            description={mattress ? "Cada tamanho tem preço próprio. Use as medidas reais do produto." : "Use se o produto tiver opções com preço próprio (ex.: cores ou tecidos)."}
          >
            {variants.fields.length ? (
              <ol className="space-y-4">
                {variants.fields.map((field, i) => {
                  const base = `variants.${i}` as const;
                  return (
                    <li key={field.key} data-variant-id={field.id} className="rounded-2xl border border-line bg-cloud p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-deep-fjord">Variação {i + 1}</p>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => variants.move(i, i - 1)} disabled={i === 0}>
                            <ArrowUpIcon className="h-4 w-4" />
                            <span className="sr-only">Mover variação {i + 1} para cima</span>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => variants.move(i, i + 1)} disabled={i === variants.fields.length - 1}>
                            <ArrowDownIcon className="h-4 w-4" />
                            <span className="sr-only">Mover variação {i + 1} para baixo</span>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => variants.remove(i)}>
                            <TrashIcon className="h-4 w-4" /> Remover
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {mattress ? (
                          <div>
                            <Label htmlFor={`f-${base}-size`} optional>
                              Tamanho-padrão
                            </Label>
                            <select
                              id={`f-${base}-size`}
                              className={controlClasses}
                              {...register(`${base}.size`, {
                                onChange: (e) => {
                                  const key = e.target.value as keyof typeof SIZE_INFO;
                                  const info = SIZE_INFO[key];
                                  if (!info) return;
                                  const current = getValues(base);
                                  if (!current.name) setValue(`${base}.name`, `${info.label} (${info.widthCm} × ${info.lengthCm} cm)`, { shouldDirty: true });
                                  if (!current.widthCm) setValue(`${base}.widthCm`, String(info.widthCm), { shouldDirty: true });
                                  if (!current.lengthCm) setValue(`${base}.lengthCm`, String(info.lengthCm), { shouldDirty: true });
                                },
                              })}
                            >
                              <option value="">Outro / não se aplica</option>
                              {SIZE_KEYS.map((k) => (
                                <option key={k} value={k}>
                                  {SIZE_INFO[k].label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        <TextField
                          name={`${base}.name`}
                          label="Nome exibido"
                          placeholder={mattress ? "" : "Ex.: Tecido azul"}
                          register={register}
                          errors={errors}
                          className={mattress ? "sm:col-span-2 lg:col-span-3" : "sm:col-span-2"}
                        />
                        <TextField name={`${base}.price`} label="Preço" prefix="R$" inputMode="decimal" register={register} errors={errors} />
                        <TextField name={`${base}.stockQuantity`} label="Estoque" optional inputMode="numeric" register={register} errors={errors} />
                        {mattress ? (
                          <>
                            <TextField name={`${base}.widthCm`} label="Largura (cm)" optional inputMode="decimal" register={register} errors={errors} />
                            <TextField name={`${base}.lengthCm`} label="Comprimento (cm)" optional inputMode="decimal" register={register} errors={errors} />
                          </>
                        ) : null}
                        <TextField name={`${base}.sku`} label="SKU" optional register={register} errors={errors} className="sm:col-span-2" />
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-muted">Nenhuma variação: a loja usa o preço acima.</p>
            )}
            <Button
              variant="secondary"
              onClick={() => variants.append({ name: "", sku: "", price: "", stockQuantity: "", size: "", widthCm: "", lengthCm: "" })}
              disabled={variants.fields.length >= 20}
            >
              <PlusIcon className="h-4 w-4" /> {mattress ? "Adicionar tamanho" : "Adicionar variação"}
            </Button>
          </Section>
        </div>

        <div hidden={tab !== "detalhes"} className="space-y-4">
          <Section id="sec-medidas" title="Medidas" description="Só o que foi medido ou confirmado. Campos vazios não aparecem na loja.">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <TextField name="heightCm" label="Altura (cm)" optional inputMode="decimal" register={register} errors={errors} />
              {!mattress ? (
                <>
                  <TextField name="widthCm" label="Largura (cm)" optional inputMode="decimal" register={register} errors={errors} />
                  <TextField name="lengthCm" label="Profundidade (cm)" optional inputMode="decimal" register={register} errors={errors} />
                </>
              ) : null}
              <TextField name="weightKg" label="Peso (kg)" optional inputMode="decimal" register={register} errors={errors} />
            </div>
          </Section>

          <Section id="sec-specs" title="Especificações" description="Preencha só o que foi confirmado com o fabricante.">
            {mattress ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor="f-firmness" optional>
                    Firmeza
                  </Label>
                  <select id="f-firmness" className={controlClasses} {...register("firmness")}>
                    <option value="">Não informada</option>
                    {FIRMNESS_LEVELS.map((f) => (
                      <option key={f} value={f}>
                        {FIRMNESS_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </div>
                <TextField name="layersText" label="Camadas (de cima para baixo)" optional multiline rows={3} register={register} errors={errors} help="Uma por linha." />
              </div>
            ) : null}
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField name="materialsText" label="Materiais" optional multiline rows={3} register={register} errors={errors} help="Um por linha. Ex.: Madeira de eucalipto" />
              <div className="space-y-5">
                <TextField name="fabric" label="Tecido / revestimento" optional register={register} errors={errors} />
                <TextField name="warranty" label="Garantia" optional register={register} errors={errors} help="Como consta no termo do fabricante." />
              </div>
            </div>
            <TextField name="careText" label="Cuidados" optional multiline rows={3} register={register} errors={errors} help="Um cuidado por linha." />

            <div>
              <p className="mb-2 text-sm font-medium text-ink">Outras especificações</p>
              {specs.fields.length ? (
                <ul className="space-y-3">
                  {specs.fields.map((field, i) => (
                    <li key={field.id} className="grid items-start gap-3 sm:grid-cols-[1fr_2fr_auto]">
                      <TextField name={`extraSpecs.${i}.label`} label="Nome" register={register} errors={errors} />
                      <TextField name={`extraSpecs.${i}.value`} label="Valor" register={register} errors={errors} />
                      <Button variant="ghost" size="sm" className="sm:mt-7" onClick={() => specs.remove(i)}>
                        <TrashIcon className="h-4 w-4" />
                        <span className="sr-only">Remover especificação {i + 1}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button variant="soft" size="sm" className="mt-3" onClick={() => specs.append({ label: "", value: "" })}>
                <PlusIcon className="h-4 w-4" /> Adicionar especificação
              </Button>
            </div>
          </Section>

          <Section id="sec-faq" title="Perguntas frequentes" description="Respostas verificadas, específicas deste produto.">
            {faq.fields.length ? (
              <ol className="space-y-4">
                {faq.fields.map((field, i) => (
                  <li key={field.id} className="space-y-3 rounded-2xl border border-line bg-cloud p-4">
                    <TextField name={`faq.${i}.question`} label={`Pergunta ${i + 1}`} register={register} errors={errors} />
                    <TextField name={`faq.${i}.answer`} label="Resposta" multiline rows={3} register={register} errors={errors} />
                    <Button variant="ghost" size="sm" onClick={() => faq.remove(i)}>
                      <TrashIcon className="h-4 w-4" /> Remover pergunta
                    </Button>
                  </li>
                ))}
              </ol>
            ) : null}
            <Button variant="soft" size="sm" onClick={() => faq.append({ question: "", answer: "" })} disabled={faq.fields.length >= 20}>
              <PlusIcon className="h-4 w-4" /> Adicionar pergunta
            </Button>
          </Section>
        </div>

        <div hidden={tab !== "seo"} className="space-y-4">
          <Section id="sec-seo" title="Link e Google" description="Opcional. Sem preenchimento, a loja usa o nome e a descrição curta.">
            <div>
              <Label htmlFor="f-slug">Endereço na loja</Label>
              <div className="flex items-stretch overflow-hidden rounded-xl border border-line focus-within:border-air-blue">
                <span className="hidden items-center bg-pale-blue px-3 text-sm text-muted sm:flex">/produtos/</span>
                <input
                  id="f-slug"
                  className="min-h-11 w-full min-w-0 border-0 bg-white px-3 text-base text-ink focus-visible:outline-none"
                  aria-invalid={slugError ? true : undefined}
                  aria-describedby={`f-slug-help${slugError ? " f-slug-error" : ""}`}
                  {...slugField}
                />
              </div>
              <HelpText id="f-slug-help">
                Mudar depois de publicado quebra links já compartilhados.{" "}
                <button type="button" className="link" onClick={() => { setSlugTouched(false); setValue("slug", slugify(String(name ?? "")), { shouldDirty: true }); }}>
                  Gerar a partir do nome
                </button>
              </HelpText>
              <FieldError id="f-slug-error">{slugError}</FieldError>
            </div>
            <TextField name="seoTitle" label="Título no Google" optional register={register} errors={errors} counter={(seoTitle ?? "").length} maxLength={70} />
            <TextField
              name="seoDescription"
              label="Descrição no Google"
              optional
              multiline
              rows={3}
              register={register}
              errors={errors}
              counter={(seoDescription ?? "").length}
              maxLength={170}
            />
            <div className="rounded-2xl border border-line bg-cloud p-4" aria-label="Prévia no buscador">
              <p className="text-xs text-muted">Prévia aproximada no Google</p>
              <p className="mt-1 truncate text-sm text-success">
                {siteUrl}/produtos/{slug || "…"}
              </p>
              <p className="truncate text-lg text-air-blue-ink">{seoTitle || name || "Título do produto"}</p>
              <p className="line-clamp-2 text-sm text-ink">{seoDescription || shortDescription || "Descrição do produto."}</p>
            </div>
          </Section>
        </div>
      </fieldset>

      {/* Espaço para a barra fixa não cobrir o fim do formulário. */}
      {showBar ? <div className="h-20" aria-hidden="true" /> : null}

      <div
        hidden={!showBar}
        className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgb(19_41_64/0.08)] backdrop-blur lg:bottom-0 lg:left-60 lg:px-10"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div role="status" aria-live="polite" className="min-h-6 min-w-0 whitespace-nowrap text-sm">
            {serverError ? (
              <span className="font-medium text-danger">{serverError}</span>
            ) : isDirty ? (
              <span className="font-medium text-[#8a4b0f]">
                <span className="sm:hidden">Não salvo</span>
                <span className="hidden sm:inline">Alterações não salvas</span>
              </span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1 font-medium text-success">
                <CheckIcon className="h-4 w-4" /> Salvo às {savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : (
              <span className="text-muted">Tudo salvo</span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {isDirty ? (
              <Button variant="ghost" onClick={() => { reset(productToFormValues(product)); setServerError(null); }} disabled={isSubmitting}>
                Descartar
              </Button>
            ) : null}
            {/* Antes da hidratação, um envio nativo mandaria os campos na URL (GET). */}
            <Button type="submit" loading={isSubmitting} loadingLabel="Salvando…" disabled={!canEdit || !hydrated || !isDirty}>
              <span className="sm:hidden">Salvar</span>
              <span className="hidden sm:inline">Salvar alterações</span>
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { get, useFieldArray, useForm, useWatch, type FieldErrors, type Path, type UseFormRegister } from "react-hook-form";
import { saveProductAction } from "@/lib/admin/actions/products";
import { productToFormValues } from "@/lib/admin/form-values";
import { useHydrated } from "@/lib/use-hydrated";
import { slugify } from "@/lib/catalog/slug";
import { FIRMNESS_LABELS, FIRMNESS_LEVELS, SIZE_INFO, SIZE_KEYS, type Category, type Product } from "@/lib/catalog/types";
import {
  formOutputToSaveInput,
  productFormSchema,
  type ProductFormOutput,
  type ProductFormValues,
} from "@/lib/validation/product";
import { Button } from "@/components/ui/button";
import { controlClasses, FieldError, HelpText, Label } from "@/components/ui/field";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";

type FormPath = Path<ProductFormValues>;

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-[1.25rem] border border-line bg-white p-5 sm:p-6">
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

export function ProductForm({
  product,
  categories,
  canEdit,
  siteUrl,
}: {
  product: Product | null;
  categories: Pick<Category, "id" | "name">[];
  canEdit: boolean;
  siteUrl: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const isNew = !product;
  const [slugTouched, setSlugTouched] = useState(!isNew);
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

  const variants = useFieldArray({ control, name: "variants", keyName: "key" });
  const specs = useFieldArray({ control, name: "extraSpecs" });
  const faq = useFieldArray({ control, name: "faq" });

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

  const onSubmit = handleSubmit(
    async (out) => {
      setServerError(null);
      const result = await saveProductAction(product?.id ?? null, formOutputToSaveInput(out));
      if (!result.ok) {
        setServerError(result.error);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          setError(field as FormPath, { type: "server", message });
        }
        return;
      }
      if (isNew) {
        router.push(`/admin/produtos/${result.data.id}?criado=1`);
        return;
      }
      reset(getValues());
      setSavedAt(new Date());
      router.refresh();
    },
    () => setServerError("Revise os campos destacados."),
  );

  const [seoTitle, seoDescription, name, shortDescription, slug] = useWatch({
    control,
    name: ["seoTitle", "seoDescription", "name", "shortDescription", "slug"],
  });
  const nameError = errors.name?.message;
  const slugError = errors.slug?.message;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label={isNew ? "Novo produto" : `Editar ${product?.name}`}>
      {!canEdit ? (
        <Notice tone="info" title="Somente leitura">
          Produtos publicados ou arquivados só podem ser alterados por administradores.
        </Notice>
      ) : null}

      <fieldset disabled={!canEdit || isSubmitting} className="min-w-0 space-y-6">
        <Section id="sec-basico" title="Informações básicas">
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
            <Label htmlFor="f-slug">Endereço na loja (slug)</Label>
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
              Gerado a partir do nome. Mudar depois de publicado quebra links já compartilhados.
            </HelpText>
            <FieldError id="f-slug-error">{slugError}</FieldError>
          </div>
          <div>
            <Label htmlFor="f-categoryId" optional>
              Categoria
            </Label>
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
          <TextField
            name="shortDescription"
            label="Descrição curta"
            optional
            register={register}
            errors={errors}
            help="Aparece nos cards da loja. Uma frase objetiva."
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
            help="Texto simples. Deixe uma linha em branco entre parágrafos. Não inclua benefícios, certificações ou prazos não confirmados."
          />
        </Section>

        <Section
          id="sec-preco"
          title="Preço e estoque"
          description="Se o produto tiver tamanhos, o preço de cada tamanho é definido nas variações abaixo."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField name="price" label="Preço" optional prefix="R$" inputMode="decimal" placeholder="1.299,90" register={register} errors={errors} />
            <TextField
              name="compareAtPrice"
              label="Preço “de”"
              optional
              prefix="R$"
              inputMode="decimal"
              register={register}
              errors={errors}
              help="Só use se for um preço real praticado antes. Nada de desconto fictício."
            />
            <TextField name="sku" label="SKU" optional register={register} errors={errors} />
            <TextField
              name="stockQuantity"
              label="Estoque"
              optional
              inputMode="numeric"
              register={register}
              errors={errors}
              help="Deixe vazio se o estoque não for controlado aqui (a loja não mostra disponibilidade)."
            />
          </div>
        </Section>

        <Section
          id="sec-variacoes"
          title="Tamanhos e variações"
          description="Cada tamanho tem preço próprio. Use as medidas reais do produto."
        >
          {variants.fields.length ? (
            <ol className="space-y-4">
              {variants.fields.map((field, i) => {
                const base = `variants.${i}` as const;
                return (
                  <li key={field.key} className="rounded-2xl border border-line bg-cloud p-4">
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
                      <TextField name={`${base}.name`} label="Nome exibido" register={register} errors={errors} className="sm:col-span-2 lg:col-span-3" />
                      <TextField name={`${base}.widthCm`} label="Largura (cm)" optional inputMode="decimal" register={register} errors={errors} />
                      <TextField name={`${base}.lengthCm`} label="Comprimento (cm)" optional inputMode="decimal" register={register} errors={errors} />
                      <TextField name={`${base}.price`} label="Preço" prefix="R$" inputMode="decimal" register={register} errors={errors} />
                      <TextField name={`${base}.stockQuantity`} label="Estoque" optional inputMode="numeric" register={register} errors={errors} />
                      <TextField name={`${base}.sku`} label="SKU" optional register={register} errors={errors} className="sm:col-span-2" />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted">Nenhuma variação. Sem variações, a loja usa o preço do produto.</p>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              variants.append({ name: "", sku: "", price: "", stockQuantity: "", size: "", widthCm: "", lengthCm: "" })
            }
            disabled={variants.fields.length >= 20}
          >
            <PlusIcon className="h-4 w-4" /> Adicionar tamanho
          </Button>
        </Section>

        <Section
          id="sec-specs"
          title="Especificações confirmadas"
          description="Preencha só o que foi confirmado com o fabricante. Campos vazios não aparecem na loja."
        >
          <div className="grid gap-5 sm:grid-cols-3">
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
            <TextField name="heightCm" label="Altura (cm)" optional inputMode="decimal" register={register} errors={errors} />
            <TextField name="weightKg" label="Peso do produto (kg)" optional inputMode="decimal" register={register} errors={errors} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField name="materialsText" label="Materiais" optional multiline rows={4} register={register} errors={errors} help="Um por linha." />
            <TextField name="layersText" label="Camadas (de cima para baixo)" optional multiline rows={4} register={register} errors={errors} help="Uma por linha." />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField name="fabric" label="Tecido" optional register={register} errors={errors} />
            <TextField name="warranty" label="Garantia" optional register={register} errors={errors} help="Como consta no termo do fabricante." />
          </div>
          <TextField name="careText" label="Cuidados" optional multiline rows={3} register={register} errors={errors} help="Um cuidado por linha." />

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Outras especificações</p>
            {specs.fields.length ? (
              <ul className="space-y-3">
                {specs.fields.map((field, i) => (
                  <li key={field.id} className="grid items-start gap-3 sm:grid-cols-[1fr_2fr_auto]">
                    <TextField name={`extraSpecs.${i}.label`} label="Rótulo" register={register} errors={errors} />
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

        <Section id="sec-faq" title="Perguntas frequentes do produto" description="Respostas verificadas, específicas deste produto.">
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

        <Section id="sec-seo" title="SEO" description="Opcional. Sem preenchimento, a loja usa o nome e a descrição curta.">
          <TextField
            name="seoTitle"
            label="Título para buscadores"
            optional
            register={register}
            errors={errors}
            counter={(seoTitle ?? "").length}
            maxLength={70}
          />
          <TextField
            name="seoDescription"
            label="Descrição para buscadores"
            optional
            multiline
            rows={3}
            register={register}
            errors={errors}
            counter={(seoDescription ?? "").length}
            maxLength={170}
          />
          <div className="rounded-2xl border border-line bg-cloud p-4" aria-label="Prévia no buscador">
            <p className="text-xs text-muted">Prévia aproximada no buscador</p>
            <p className="mt-1 truncate text-sm text-success">
              {siteUrl}/produtos/{slug || "…"}
            </p>
            <p className="truncate text-lg text-air-blue-ink">{seoTitle || name || "Título do produto"}</p>
            <p className="line-clamp-2 text-sm text-ink">{seoDescription || shortDescription || "Descrição do produto."}</p>
          </div>
        </Section>
      </fieldset>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="status" aria-live="polite" className="min-h-6 text-sm">
            {serverError ? (
              <span className="font-medium text-danger">{serverError}</span>
            ) : isDirty ? (
              <span className="text-muted">Alterações não salvas</span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1 font-medium text-success">
                <CheckIcon className="h-4 w-4" /> Salvo às {savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
          </div>
          {/* Antes da hidratação, um envio nativo mandaria os campos na URL (GET). */}
          <Button type="submit" size="lg" loading={isSubmitting} loadingLabel="Salvando…" disabled={!canEdit || !hydrated}>
            {isNew ? "Criar rascunho" : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </form>
  );
}

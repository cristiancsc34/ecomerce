"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createProductDraftAction } from "@/lib/admin/actions/products";
import type { Category } from "@/lib/catalog/types";
import { useHydrated } from "@/lib/use-hydrated";
import { Button } from "@/components/ui/button";
import { controlClasses, FieldError, HelpText, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

/** Cadastro rápido: nome + categoria. Fotos, preço e o resto vêm na página do produto. */
export function NewProductForm({ categories }: { categories: Pick<Category, "id" | "name">[] }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  // Com uma categoria só, ela já vem escolhida.
  const [categoryId, setCategoryId] = useState(categories.length === 1 ? categories[0].id : "");

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await createProductDraftAction({ name, categoryId });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) setError(result.error);
        return;
      }
      router.push(`/admin/produtos/${result.data.id}?criado=1`);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-2xl border border-line bg-white p-4 sm:p-6">
      {error ? (
        <Notice tone="danger" role="alert" title="Não foi possível criar">
          {error}
        </Notice>
      ) : null}
      <div>
        <Label htmlFor="novo-nome">Nome do produto</Label>
        <input
          id="novo-nome"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoComplete="off"
          autoFocus
          placeholder="Ex.: Poltrona Azul"
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={`novo-nome-help${fieldErrors.name ? " novo-nome-error" : ""}`}
          className={controlClasses}
        />
        <HelpText id="novo-nome-help">Dá para mudar depois. A IA também sugere um nome a partir das fotos.</HelpText>
        <FieldError id="novo-nome-error">{fieldErrors.name}</FieldError>
      </div>
      <div>
        <Label htmlFor="novo-categoria" optional>
          Categoria
        </Label>
        <select
          id="novo-categoria"
          name="categoryId"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={controlClasses}
        >
          <option value="">Escolher depois</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <FieldError>{fieldErrors.categoryId}</FieldError>
      </div>
      <Button type="submit" loading={pending} loadingLabel="Criando…" disabled={!hydrated || name.trim().length < 2} className="w-full sm:w-auto">
        Criar e enviar fotos
      </Button>
    </form>
  );
}

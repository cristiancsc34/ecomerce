"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { deleteCategoryAction, saveCategoryAction, type CategoryFormState } from "@/lib/admin/actions/categories";
import { slugify } from "@/lib/catalog/slug";
import type { Category } from "@/lib/catalog/types";
import { useHydrated } from "@/lib/use-hydrated";
import { Button } from "@/components/ui/button";
import { controlClasses, FieldError, Label } from "@/components/ui/field";
import { ConfirmButton } from "./confirm-dialog";

const initial: CategoryFormState = { ok: false, error: null };

export function CategoryForm({ category, canDelete }: { category?: Category & { productCount: number }; canDelete: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveCategoryAction, initial);
  const hydrated = useHydrated();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const slugTouched = useRef(Boolean(category));
  const prefix = category ? `cat-${category.id}` : "cat-nova";

  useEffect(() => {
    if (state.ok && state.savedAt) {
      if (!category) formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, state.savedAt, category, router]);

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_6rem]" noValidate>
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <div>
        <Label htmlFor={`${prefix}-name`}>Nome</Label>
        <input
          id={`${prefix}-name`}
          name="name"
          defaultValue={category?.name}
          required
          onChange={(e) => {
            if (!slugTouched.current && slugRef.current) slugRef.current.value = slugify(e.target.value);
          }}
          aria-invalid={state.fieldErrors?.name ? true : undefined}
          className={controlClasses}
        />
        <FieldError>{state.fieldErrors?.name}</FieldError>
      </div>
      <div>
        <Label htmlFor={`${prefix}-slug`}>Endereço (slug)</Label>
        <input
          id={`${prefix}-slug`}
          ref={slugRef}
          name="slug"
          defaultValue={category?.slug}
          required
          onChange={() => {
            slugTouched.current = true;
          }}
          aria-invalid={state.fieldErrors?.slug ? true : undefined}
          className={controlClasses}
        />
        <FieldError>{state.fieldErrors?.slug}</FieldError>
      </div>
      <div>
        <Label htmlFor={`${prefix}-order`}>Ordem</Label>
        <input
          id={`${prefix}-order`}
          name="sortOrder"
          type="number"
          min={0}
          max={999}
          defaultValue={category?.sortOrder ?? 0}
          className={controlClasses}
        />
      </div>
      <div className="sm:col-span-3">
        <Label htmlFor={`${prefix}-desc`} optional>
          Descrição
        </Label>
        <input id={`${prefix}-desc`} name="description" defaultValue={category?.description ?? ""} maxLength={300} className={controlClasses} />
        <FieldError>{state.fieldErrors?.description}</FieldError>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="submit" size="sm" loading={pending} loadingLabel="Salvando…" disabled={!hydrated}>
          {category ? "Salvar" : "Criar categoria"}
        </Button>
        {category && canDelete ? (
          <ConfirmButton
            label="Excluir"
            triggerVariant="ghost"
            disabled={category.productCount > 0}
            title={`Excluir “${category.name}”?`}
            description="A categoria será removida. Só é possível excluir categorias sem produtos."
            confirmLabel="Excluir"
            onConfirm={async () => {
              const r = await deleteCategoryAction(category.id);
              if (!r.ok) setDeleteError(r.error);
              else router.refresh();
            }}
          />
        ) : null}
        <p role="status" className="text-sm">
          {state.error ? <span className="font-medium text-danger">{state.error}</span> : null}
          {deleteError ? <span className="font-medium text-danger">{deleteError}</span> : null}
          {state.ok && !state.error ? <span className="font-medium text-success">Salvo.</span> : null}
        </p>
      </div>
    </form>
  );
}

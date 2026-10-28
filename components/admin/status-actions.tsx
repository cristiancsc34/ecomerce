"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  changeStatusAction,
  deleteProductAction,
  duplicateProductAction,
  markAsRealProductAction,
} from "@/lib/admin/actions/products";
import type { ProductStatus } from "@/lib/catalog/types";
import type { StaffRole } from "@/lib/auth/staff";
import { Button } from "@/components/ui/button";
import { CopyIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { ConfirmButton } from "./confirm-dialog";

export function StatusActions({
  productId,
  status,
  isDemo,
  role,
  publishIssues,
  isDirtyHint,
}: {
  productId: string;
  status: ProductStatus;
  isDemo: boolean;
  role: StaffRole;
  publishIssues: string[];
  isDirtyHint?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const isAdmin = role === "admin";

  function change(to: ProductStatus) {
    setError(null);
    setIssues([]);
    startTransition(async () => {
      const result = await changeStatusAction(productId, to);
      if (!result.ok) {
        setError(result.error);
        setIssues(Object.values(result.fieldErrors ?? {}));
        return;
      }
      router.refresh();
    });
  }

  // A lista do que falta fica no painel "Pronto para vender"; aqui só as ações.
  const canPublish = isAdmin && publishIssues.length === 0 && !isDirtyHint && (status === "draft" || status === "review");

  return (
    <div className="space-y-4">
      {error ? (
        <Notice tone="danger" role="alert" title={error}>
          {issues.length ? (
            <ul className="list-disc space-y-1 pl-5">
              {issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}
      {isDirtyHint && (status === "draft" || status === "review") ? (
        <p className="text-sm font-medium text-[#8a4b0f]">Salve as alterações antes de publicar.</p>
      ) : null}

      <div className="flex flex-col gap-2">
        {status === "draft" ? (
          <Button variant="secondary" onClick={() => change("review")} loading={pending} loadingLabel="Aguarde…">
            Enviar para revisão
          </Button>
        ) : null}
        {status === "review" ? (
          <Button variant="ghost" onClick={() => change("draft")} disabled={pending}>
            Voltar para rascunho
          </Button>
        ) : null}
        {status === "draft" || status === "review" ? (
          isAdmin ? (
            <ConfirmButton
              label="Publicar"
              triggerVariant="primary"
              size="md"
              disabled={!canPublish || pending}
              variant="primary"
              title="Publicar na loja?"
              description="O produto ficará visível para todos os visitantes, com os dados e fotos atuais."
              requireCheck="Confirmo que preço, medidas, especificações e fotos foram verificados."
              confirmLabel="Publicar agora"
              onConfirm={() => change("published")}
            />
          ) : (
            <p className="text-sm text-muted">Somente administradores publicam.</p>
          )
        ) : null}
        {status === "published" && isAdmin ? (
          <ConfirmButton
            label="Despublicar (voltar para rascunho)"
            size="md"
            title="Tirar da loja?"
            description="O produto deixa de aparecer para os visitantes. Links compartilhados passarão a mostrar “não encontrado”."
            confirmLabel="Despublicar"
            onConfirm={() => change("draft")}
          />
        ) : null}
        {(status === "draft" || status === "review" || status === "published") && isAdmin ? (
          <ConfirmButton
            label="Arquivar"
            size="md"
            triggerVariant="ghost"
            title="Arquivar este produto?"
            description="Produtos arquivados saem da loja e ficam guardados no painel. Dá para restaurar depois."
            confirmLabel="Arquivar"
            onConfirm={() => change("archived")}
          />
        ) : null}
        {status === "archived" && isAdmin ? (
          <Button variant="secondary" onClick={() => change("draft")} loading={pending} loadingLabel="Aguarde…">
            Restaurar como rascunho
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await duplicateProductAction(productId);
              if (!result.ok) return setError(result.error);
              router.push(`/admin/produtos/${result.data.id}?duplicado=1`);
            })
          }
        >
          <CopyIcon className="h-4 w-4" /> Duplicar
        </Button>
      </div>

      {isDemo && isAdmin && status === "draft" ? (
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-sm text-ink">
            Este é um produto de demonstração. Para vendê-lo, substitua nome, preço, fotos e especificações pelos dados
            reais e converta.
          </p>
          <ConfirmButton
            label="Converter em produto real"
            title="Converter em produto real?"
            description="Depois de convertido, o produto poderá ser publicado. Fotos marcadas como ilustrativas continuam com o aviso."
            requireCheck="Confirmo que substituí todos os dados de demonstração por dados reais verificados."
            confirmLabel="Converter"
            variant="primary"
            onConfirm={async () => {
              const result = await markAsRealProductAction(productId);
              if (!result.ok) return setError(result.error);
              router.refresh();
            }}
          />
        </div>
      ) : null}

      {isAdmin && (status === "draft" || status === "archived") ? (
        <div className="border-t border-line pt-4">
          <ConfirmButton
            label="Excluir produto"
            triggerVariant="ghost"
            title="Excluir definitivamente?"
            description="O produto, as variações e as mídias (que não forem usadas por outro produto) serão apagados. Esta ação não pode ser desfeita."
            requireCheck="Entendo que não dá para desfazer."
            confirmLabel="Excluir"
            onConfirm={async () => {
              const result = await deleteProductAction(productId);
              if (!result.ok) return setError(result.error);
              router.push("/admin/produtos");
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

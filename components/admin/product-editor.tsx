"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ProductTab, ReadinessItem } from "@/lib/admin/readiness";
import type { StaffRole } from "@/lib/auth/staff";
import type { Category, Product } from "@/lib/catalog/types";
import { CheckIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { ProductForm } from "./product-form";
import { StatusActions } from "./status-actions";
import { StatusBadge } from "./status-badge";
import { ReadinessMeter } from "./ui";

const TABS: { id: ProductTab; label: string }[] = [
  { id: "fotos", label: "Fotos e 3D" },
  { id: "informacoes", label: "Informações" },
  { id: "preco", label: "Preço" },
  { id: "detalhes", label: "Detalhes" },
  { id: "seo", label: "Link e Google" },
];

/**
 * Página de edição do produto: abas (uma tarefa por vez) + painel "Pronto para
 * vender" que leva direto ao que falta. O formulário fica sempre montado, então
 * trocar de aba nunca perde o que foi digitado.
 */
export function ProductEditor({
  product,
  categories,
  canEdit,
  siteUrl,
  role,
  initialTab,
  readiness,
  publishIssues,
  photos,
  history,
  aiCopyEnabled = false,
}: {
  product: Product;
  categories: Pick<Category, "id" | "name" | "slug">[];
  canEdit: boolean;
  siteUrl: string;
  role: StaffRole;
  initialTab: ProductTab;
  readiness: ReadinessItem[];
  publishIssues: string[];
  /** Estúdio de IA + fotos na loja (aba "Fotos e 3D"). */
  photos: ReactNode;
  history: ReactNode;
  /** A chave da OpenAI está no servidor ("Aprimorar descrição" na aba Informações). */
  aiCopyEnabled?: boolean;
}) {
  const [tab, setTab] = useState<ProductTab>(initialTab);
  const [dirty, setDirty] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const tabRefs = useRef(new Map<ProductTab, HTMLButtonElement>());

  const done = readiness.filter((i) => i.done).length;
  const pendingTabs = new Set(readiness.filter((i) => !i.done).map((i) => i.tab));
  const live = product.status === "published";

  function go(next: ProductTab, focusTab = false) {
    setTab(next);
    // Mantém a aba no endereço (voltar/recarregar cai no mesmo lugar).
    const url = new URL(window.location.href);
    url.search = next === "fotos" ? "" : `?aba=${next}`;
    window.history.replaceState(window.history.state, "", url);
    if (focusTab) tabRefs.current.get(next)?.focus();
    else document.getElementById("painel-aba")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = TABS.findIndex((t) => t.id === tab);
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      go(e.key === "Home" ? TABS[0].id : TABS[TABS.length - 1].id, true);
    } else if (step) {
      e.preventDefault();
      go(TABS[(i + step + TABS.length) % TABS.length].id, true);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        {/* Abas: grudam no topo para trocar de assunto sem rolar de volta. */}
        <div className="sticky top-14 z-20 -mx-4 border-b border-line bg-cloud/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:px-0">
          <div role="tablist" aria-label="Partes do cadastro" className="-mb-px flex gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const selected = t.id === tab;
              const pending = pendingTabs.has(t.id) && !live;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    if (el) tabRefs.current.set(t.id, el);
                  }}
                  type="button"
                  role="tab"
                  id={`aba-${t.id}`}
                  aria-selected={selected}
                  aria-controls="painel-aba"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => go(t.id)}
                  onKeyDown={onTabKey}
                  className={`relative inline-flex min-h-12 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold transition-colors ${
                    selected ? "border-deep-fjord text-deep-fjord" : "border-transparent text-muted hover:text-deep-fjord"
                  }`}
                >
                  {t.label}
                  {pending ? (
                    <span className="h-2 w-2 rounded-full bg-[#d98a2b]" aria-label="(falta algo)" role="img" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div id="painel-aba" role="tabpanel" aria-labelledby={`aba-${tab}`} className="scroll-mt-32 pt-4 lg:scroll-mt-16">
          {canEdit ? null : (
            <Notice tone="info" title="Somente leitura" className="mb-4">
              Produtos publicados ou arquivados só podem ser alterados por administradores.
            </Notice>
          )}
          <div hidden={tab !== "fotos"} className="space-y-4">
            {photos}
          </div>
          <ProductForm
            product={product}
            categories={categories}
            canEdit={canEdit}
            siteUrl={siteUrl}
            tab={tab}
            onTabChange={(t) => go(t)}
            onDirtyChange={setDirty}
            aiCopyEnabled={aiCopyEnabled}
          />
        </div>
      </div>

      {/* No celular o painel vem antes das abas, recolhido num resumo de uma linha. */}
      <aside className="order-first min-w-0 space-y-4 xl:order-none xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:self-start xl:overflow-y-auto">
        <section aria-labelledby="pronto-titulo" className="rounded-2xl border border-line bg-white">
          <div className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <h2 id="pronto-titulo" className="font-bold text-deep-fjord">
                {live ? "Na loja" : "Pronto para vender"}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={product.status} />
                {live ? null : <ReadinessMeter done={done} total={readiness.length} />}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex min-h-10 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-deep-fjord hover:bg-pale-blue xl:hidden"
              aria-expanded={panelOpen}
              aria-controls="pronto-conteudo"
              onClick={() => setPanelOpen((v) => !v)}
            >
              {panelOpen ? "Fechar" : live ? "Opções" : "Ver o que falta"}
            </button>
          </div>

          <div id="pronto-conteudo" className={`${panelOpen ? "block" : "hidden"} space-y-4 border-t border-line p-4 xl:block`}>
            {live ? null : (
              <ul aria-label="Checklist para publicar" className="space-y-1">
                {readiness.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setPanelOpen(false);
                        go(item.tab);
                      }}
                      className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-cloud"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          item.done ? "bg-success text-white" : "border-2 border-line"
                        }`}
                      >
                        {item.done ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-semibold ${item.done ? "text-muted" : "text-ink"}`}>
                          {item.label}
                          <span className="sr-only">{item.done ? " (pronto)" : " (falta)"}</span>
                        </span>
                        {item.hint ? <span className="block text-xs text-muted">{item.hint}</span> : null}
                      </span>
                      {item.done ? null : <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <StatusActions
              productId={product.id}
              status={product.status}
              isDemo={product.isDemo}
              role={role}
              publishIssues={publishIssues}
              isDirtyHint={dirty}
            />
          </div>
        </section>

        {/* Histórico: sempre visível no computador; no celular, junto com o painel aberto. */}
        <div className={`${panelOpen ? "block" : "hidden"} xl:block`}>{history}</div>
      </aside>
    </div>
  );
}

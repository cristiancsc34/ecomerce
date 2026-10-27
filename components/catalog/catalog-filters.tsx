import Link from "next/link";
import { FIRMNESS_LABELS, SIZE_INFO } from "@/lib/catalog/types";
import { SORT_LABELS, SORT_OPTIONS, type CatalogFacets, type CatalogQuery } from "@/lib/catalog/query";
import { buttonClasses } from "@/components/ui/button";
import { controlClasses } from "@/components/ui/field";
import { FilterForm } from "./filter-form";

const checkboxClasses =
  "h-5 w-5 shrink-0 rounded border-line text-deep-fjord accent-[var(--color-deep-fjord)] focus-visible:outline-air-blue";

/**
 * Painel de filtros. Só mostra grupos que existem nos dados
 * (não exibimos filtros de atributos ainda não cadastrados).
 */
export function CatalogFilters({
  idPrefix,
  action,
  query,
  facets,
  showCategory,
  showSearch,
}: {
  idPrefix: string;
  action: string;
  query: CatalogQuery;
  facets: CatalogFacets;
  showCategory: boolean;
  showSearch: boolean;
}) {
  const id = (k: string) => `${idPrefix}-${k}`;

  return (
    <FilterForm action={action} className="space-y-6">
      {showSearch ? (
        <div>
          <label htmlFor={id("q")} className="mb-1.5 block text-sm font-semibold text-deep-fjord">
            Buscar
          </label>
          <input id={id("q")} name="q" type="search" defaultValue={query.q} placeholder="Nome, firmeza, material…" className={controlClasses} />
        </div>
      ) : query.q ? (
        <input type="hidden" name="q" value={query.q} />
      ) : null}

      <div>
        <label htmlFor={id("ordem")} className="mb-1.5 block text-sm font-semibold text-deep-fjord">
          Ordenar por
        </label>
        <select id={id("ordem")} name="ordem" defaultValue={query.ordem} className={controlClasses}>
          {SORT_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {SORT_LABELS[o]}
            </option>
          ))}
        </select>
      </div>

      {showCategory && facets.categories.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-deep-fjord">Categoria</legend>
          <div className="space-y-1">
            <label className="flex min-h-11 items-center gap-3">
              <input type="radio" name="categoria" value="" defaultChecked={!query.categoria} className={checkboxClasses} />
              <span>Todas</span>
            </label>
            {facets.categories.map((c) => (
              <label key={c.slug} className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  name="categoria"
                  value={c.slug}
                  defaultChecked={query.categoria === c.slug}
                  className={checkboxClasses}
                />
                <span>
                  {c.name} <span className="text-muted">({c.count})</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : query.categoria && showCategory ? (
        <input type="hidden" name="categoria" value={query.categoria} />
      ) : null}

      {facets.sizes.length ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-deep-fjord">Tamanho</legend>
          <div className="space-y-1">
            {facets.sizes.map(({ key, count }) => (
              <label key={key} className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  name="tamanho"
                  value={key}
                  defaultChecked={query.tamanhos.includes(key)}
                  className={checkboxClasses}
                />
                <span>
                  {SIZE_INFO[key].label}{" "}
                  <span className="text-muted">
                    ({SIZE_INFO[key].widthCm}×{SIZE_INFO[key].lengthCm} cm) · {count}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {facets.firmness.length ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-deep-fjord">Firmeza</legend>
          <div className="space-y-1">
            {facets.firmness.map(({ key, count }) => (
              <label key={key} className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  name="firmeza"
                  value={key}
                  defaultChecked={query.firmezas.includes(key)}
                  className={checkboxClasses}
                />
                <span>
                  {FIRMNESS_LABELS[key]} <span className="text-muted">· {count}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {facets.price ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-deep-fjord">Preço (R$)</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={id("min")} className="mb-1 block text-sm text-muted">
                Mínimo
              </label>
              <input
                id={id("min")}
                name="preco_min"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder={String(facets.price.minReais)}
                defaultValue={query.precoMin ?? ""}
                className={controlClasses}
              />
            </div>
            <div>
              <label htmlFor={id("max")} className="mb-1 block text-sm text-muted">
                Máximo
              </label>
              <input
                id={id("max")}
                name="preco_max"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder={String(facets.price.maxReais)}
                defaultValue={query.precoMax ?? ""}
                className={controlClasses}
              />
            </div>
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={buttonClasses({ size: "md" })}>
          Aplicar filtros
        </button>
        <Link href={action} className={buttonClasses({ variant: "ghost", size: "md" })} scroll={false}>
          Limpar
        </Link>
      </div>
    </FilterForm>
  );
}

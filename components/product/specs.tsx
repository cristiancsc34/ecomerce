import { formatPrice } from "@/lib/catalog/money";
import { sortedVariants } from "@/lib/catalog/product-helpers";
import { FIRMNESS_LABELS, SIZE_INFO, type Product } from "@/lib/catalog/types";
import { Notice } from "@/components/ui/notice";

function formatCm(n: number) {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`;
}

/** Tabela de medidas por tamanho, com altura do produto quando confirmada. */
export function SizeTable({ product }: { product: Product }) {
  const variants = sortedVariants(product);
  if (!variants.length) return null;
  const height = product.dimensions.heightCm;
  return (
    <div>
      <h3 className="mb-3 text-lg font-semibold">Medidas por tamanho</h3>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[28rem] text-left text-[0.9375rem]">
          <caption className="sr-only">Medidas e preços de {product.name} por tamanho</caption>
          <thead className="bg-pale-blue text-deep-fjord">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Tamanho</th>
              <th scope="col" className="px-4 py-3 font-semibold">Largura × comprimento</th>
              <th scope="col" className="px-4 py-3 font-semibold">Altura</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Preço</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {variants.map((v) => {
              const w = v.widthCm ?? (v.size ? SIZE_INFO[v.size].widthCm : null);
              const l = v.lengthCm ?? (v.size ? SIZE_INFO[v.size].lengthCm : null);
              return (
                <tr key={v.id}>
                  <th scope="row" className="px-4 py-3 font-medium text-ink">
                    {v.size ? SIZE_INFO[v.size].label : v.name}
                  </th>
                  <td className="px-4 py-3">{w && l ? `${w} × ${l} cm` : "—"}</td>
                  <td className="px-4 py-3">{height ? formatCm(height) : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-deep-fjord">{formatPrice(v.priceCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-muted">
        Os nomes dos tamanhos variam entre fabricantes. Confira as medidas em centímetros com a base da sua cama.
      </p>
    </div>
  );
}

type Row = { label: string; value: React.ReactNode };

/**
 * Especificações confirmadas. O que não foi confirmado não aparece; quando
 * itens essenciais ainda faltam, um aviso diz isso claramente.
 */
export function SpecsList({ product, showPending = product.isDemo }: { product: Product; showPending?: boolean }) {
  const a = product.attributes;
  const d = product.dimensions;
  const rows: Row[] = [];

  if (a.firmness) rows.push({ label: "Firmeza", value: FIRMNESS_LABELS[a.firmness] });
  if (d.heightCm) rows.push({ label: "Altura", value: formatCm(d.heightCm) });
  if (d.widthCm && d.lengthCm) rows.push({ label: "Largura × comprimento", value: `${d.widthCm} × ${d.lengthCm} cm` });
  if (d.weightKg) rows.push({ label: "Peso do produto", value: `${d.weightKg.toLocaleString("pt-BR")} kg` });
  if (a.materials?.length) rows.push({ label: "Materiais", value: <List items={a.materials} /> });
  if (a.layers?.length) rows.push({ label: "Camadas (de cima para baixo)", value: <List items={a.layers} ordered /> });
  if (a.fabric) rows.push({ label: "Tecido", value: a.fabric });
  if (a.warranty) rows.push({ label: "Garantia", value: a.warranty });
  for (const s of a.extraSpecs ?? []) rows.push({ label: s.label, value: s.value });

  const pending = [
    !a.materials?.length && "materiais",
    !a.layers?.length && "camadas",
    !a.warranty && "garantia",
    !a.care?.length && "cuidados",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      {rows.length ? (
        <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {rows.map((r) => (
            <div key={r.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
              <dt className="font-medium text-muted">{r.label}</dt>
              <dd className="text-ink">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {product.isDemo && rows.length ? (
        <p className="text-sm text-muted">Firmeza e altura deste produto de demonstração são ilustrativas.</p>
      ) : null}

      {a.care?.length ? (
        <div>
          <h3 className="mb-2 text-lg font-semibold">Cuidados</h3>
          <List items={a.care} />
        </div>
      ) : null}

      {showPending && pending.length ? (
        <Notice tone="warning" title="Informações aguardando confirmação">
          {capitalize(joinPt(pending))} ainda não foram confirmados com o fabricante. Só publicamos esses dados depois de
          verificados.
        </Notice>
      ) : null}
    </div>
  );
}

function List({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </Tag>
  );
}

function joinPt(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}


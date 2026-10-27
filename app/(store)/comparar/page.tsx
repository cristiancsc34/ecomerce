import type { Metadata } from "next";
import Link from "next/link";
import { formatPrice } from "@/lib/catalog/money";
import { fromPriceCents, primaryImage, productSizes } from "@/lib/catalog/product-helpers";
import { getVisibleProducts } from "@/lib/catalog/queries";
import { FIRMNESS_LABELS, SIZE_INFO, type Product } from "@/lib/catalog/types";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { FirmnessScale } from "@/components/product/firmness-scale";
import { ProductImage } from "@/components/product/product-image";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Comparar colchões",
  description: "Compare firmeza, altura, tamanhos, materiais e garantia dos colchões lado a lado.",
  alternates: { canonical: "/comparar" },
};

type Row = { label: string; render: (p: Product) => React.ReactNode };

const NOT_CONFIRMED = <span className="text-muted">A confirmar</span>;

const ROWS: Row[] = [
  {
    label: "Firmeza",
    render: (p) => (p.attributes.firmness ? <FirmnessScale value={p.attributes.firmness} compact /> : NOT_CONFIRMED),
  },
  {
    label: "Altura",
    render: (p) => (p.dimensions.heightCm ? `${p.dimensions.heightCm} cm` : NOT_CONFIRMED),
  },
  {
    label: "Tamanhos",
    render: (p) => {
      const sizes = productSizes(p);
      return sizes.length ? sizes.map((s) => SIZE_INFO[s].label).join(", ") : NOT_CONFIRMED;
    },
  },
  {
    label: "Preço",
    render: (p) => {
      const from = fromPriceCents(p);
      if (from === null) return NOT_CONFIRMED;
      return (
        <span>
          a partir de <strong className="text-deep-fjord">{formatPrice(from)}</strong>
          {p.isDemo ? <span className="block text-xs text-muted">ilustrativo</span> : null}
        </span>
      );
    },
  },
  {
    label: "Materiais",
    render: (p) => (p.attributes.materials?.length ? p.attributes.materials.join(", ") : NOT_CONFIRMED),
  },
  {
    label: "Camadas",
    render: (p) => (p.attributes.layers?.length ? `${p.attributes.layers.length} camadas` : NOT_CONFIRMED),
  },
  {
    label: "Garantia",
    render: (p) => p.attributes.warranty ?? NOT_CONFIRMED,
  },
];

export default async function ComparePage() {
  const products = await getVisibleProducts();

  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Comparar" }]} />
      <header className="mb-8 mt-4 max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Compare os colchões</h1>
        <p className="mt-3 text-lg text-ink/85">
          Lado a lado, só com informações confirmadas. O que ainda não foi verificado aparece como “a confirmar”.
        </p>
      </header>

      {products.length === 0 ? (
        <EmptyState title="Nada para comparar ainda">Os primeiros produtos estão sendo preparados.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-[1.25rem] border border-line bg-white" tabIndex={0} role="region" aria-label="Tabela de comparação">
          <table className="w-full min-w-[40rem] border-collapse text-left text-[0.9375rem]">
            <caption className="sr-only">Comparação de {products.length} colchões</caption>
            <thead>
              <tr>
                <td className="sticky left-0 z-10 w-36 bg-white p-4" />
                {products.map((p) => (
                  <th key={p.id} scope="col" className="min-w-52 p-4 align-top font-normal">
                    <ProductImage
                      media={primaryImage(p)}
                      sizes="240px"
                      className="mb-3 rounded-xl"
                      showIllustrativeBadge={false}
                    />
                    <Link href={`/produtos/${p.slug}`} className="text-lg font-semibold text-deep-fjord hover:underline">
                      {p.name}
                    </Link>
                    {p.isDemo ? (
                      <div className="mt-1">
                        <Badge tone="demo">Demonstração</Badge>
                      </div>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="sticky left-0 z-10 bg-white p-4 align-top font-semibold text-muted">
                    {row.label}
                  </th>
                  {products.map((p) => (
                    <td key={p.id} className="p-4 align-top text-ink">
                      {row.render(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {products.some((p) => p.isDemo) ? (
        <p className="mt-4 text-sm text-muted">
          Produtos de demonstração: firmeza, altura e preços são ilustrativos. As imagens são ilustrações.
        </p>
      ) : null}
      <p className="mt-2 text-sm text-muted">
        Legenda de firmeza: {Object.values(FIRMNESS_LABELS).join(" → ")}.
      </p>
    </div>
  );
}

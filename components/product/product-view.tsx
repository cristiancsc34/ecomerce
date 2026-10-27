import { Suspense } from "react";
import { siteUrl } from "@/config/site";
import { galleryMedia, model3d, primaryImage } from "@/lib/catalog/product-helpers";
import type { Product } from "@/lib/catalog/types";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo/structured-data";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { FaqList } from "@/components/ui/faq-list";
import { Notice } from "@/components/ui/notice";
import { FirmnessScale } from "./firmness-scale";
import { Gallery } from "./gallery";
import { ProductGrid } from "./product-card";
import { PurchasePanel, PurchasePanelWithParams } from "./purchase-panel";
import { SizeTable, SpecsList } from "./specs";
import { Viewer3D } from "./viewer-3d";

/** Texto simples em parágrafos (sem HTML vindo do banco). */
function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-4 text-[1.0625rem] leading-relaxed text-ink">
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </div>
  );
}

/**
 * Página de produto completa. Usada pela vitrine e pela pré-visualização do
 * painel (`preview`), que mostra rascunhos sem dados estruturados.
 */
export function ProductView({
  product,
  related,
  preview = false,
}: {
  product: Product;
  related: Product[];
  preview?: boolean;
}) {
  const media = galleryMedia(product);
  const model = model3d(product);
  const base = siteUrl();
  const productLd = preview ? null : productJsonLd(product, base);
  const panelProduct = {
    id: product.id,
    name: product.name,
    priceCents: product.priceCents,
    compareAtPriceCents: product.compareAtPriceCents,
    stockQuantity: product.stockQuantity,
    variants: product.variants,
    isDemo: product.isDemo,
  };

  const crumbs = [
    { label: "Início", href: "/" },
    { label: "Produtos", href: "/produtos" },
    ...(product.category ? [{ label: product.category.name, href: `/categorias/${product.category.slug}` }] : []),
    { label: product.name },
  ];

  return (
    <article className="container-page py-6 sm:py-10">
      {productLd ? (
        <>
          <JsonLd data={productLd} />
          <JsonLd
            data={breadcrumbJsonLd(
              [
                { name: "Início", path: "/" },
                { name: "Produtos", path: "/produtos" },
                ...(product.category ? [{ name: product.category.name, path: `/categorias/${product.category.slug}` }] : []),
                { name: product.name, path: `/produtos/${product.slug}` },
              ],
              base,
            )}
          />
        </>
      ) : null}

      <Breadcrumbs items={crumbs} />

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <Gallery media={media} productName={product.name} />
        </div>

        <div className="min-w-0 space-y-6">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {product.category ? <span className="text-sm font-semibold text-air-blue-ink">{product.category.name}</span> : null}
              {product.isDemo ? <Badge tone="demo">Produto demonstrativo</Badge> : null}
              {preview ? <Badge tone="dark">Pré-visualização</Badge> : null}
            </div>
            <h1 className="text-3xl font-bold sm:text-4xl">{product.name}</h1>
            {product.shortDescription ? <p className="text-lg text-ink/85">{product.shortDescription}</p> : null}
          </header>

          {product.isDemo ? (
            <Notice tone="demo" title="Produto de demonstração">
              Nome, preço, firmeza, altura e imagens são ilustrativos. Este produto não está à venda.
            </Notice>
          ) : null}

          {product.attributes.firmness ? (
            <FirmnessScale value={product.attributes.firmness} illustrative={product.isDemo} />
          ) : null}

          {preview ? (
            <PurchasePanel product={panelProduct} />
          ) : (
            <Suspense fallback={<PurchasePanel product={panelProduct} />}>
              <PurchasePanelWithParams product={panelProduct} />
            </Suspense>
          )}
        </div>
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0 space-y-12">
          {product.description ? (
            <section aria-labelledby="descricao-titulo">
              <h2 id="descricao-titulo" className="mb-4 text-2xl font-bold">
                Sobre este produto
              </h2>
              <Paragraphs text={product.description} />
            </section>
          ) : null}

          <section aria-labelledby="especificacoes-titulo" className="space-y-8">
            <h2 id="especificacoes-titulo" className="text-2xl font-bold">
              Especificações
            </h2>
            <SpecsList product={product} showPending={product.isDemo || preview} />
            <SizeTable product={product} />
          </section>

          {model ? <Viewer3D model={model} poster={primaryImage(product)} productName={product.name} /> : null}
        </div>

        {product.faq.length ? (
          <section aria-labelledby="faq-produto-titulo" className="min-w-0">
            <h2 id="faq-produto-titulo" className="mb-4 text-2xl font-bold">
              Dúvidas sobre este produto
            </h2>
            <FaqList items={product.faq} />
          </section>
        ) : null}
      </div>

      {related.length ? (
        <section aria-labelledby="relacionados-titulo" className="mt-16">
          <h2 id="relacionados-titulo" className="mb-6 text-2xl font-bold">
            Você também pode gostar
          </h2>
          <ProductGrid products={related} />
        </section>
      ) : null}

      {/* Espaço para a barra fixa de compra no celular não cobrir o fim da página. */}
      <div className="h-20 lg:hidden" aria-hidden="true" />
    </article>
  );
}

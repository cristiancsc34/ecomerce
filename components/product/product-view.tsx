import { Suspense } from "react";
import { siteUrl } from "@/config/site";
import { galleryMedia, hasConfirmedSpecs, model3d, primaryImage } from "@/lib/catalog/product-helpers";
import type { Product } from "@/lib/catalog/types";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { FaqList } from "@/components/ui/faq-list";
import { FirmnessScale } from "./firmness-scale";
import { Gallery } from "./gallery";
import { PurchasePanel, PurchasePanelWithParams } from "./purchase-panel";
import { SizeTable, SpecsList } from "./specs";
import { Viewer3D } from "./viewer-3d";

/** Texto simples em parágrafos (sem HTML vindo do banco). */
function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[0.9375rem] leading-relaxed text-ink sm:text-base">
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

/** Bloco branco da página de produto (estilo marketplace). */
function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="bg-white px-4 py-5 sm:rounded-lg sm:px-6">
      <h2 id={id} className="mb-3 text-base font-bold uppercase tracking-wide text-deep-fjord">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Página de produto. Usada pela vitrine e pela pré-visualização do painel
 * (`preview`), que mostra rascunhos sem dados estruturados.
 */
export function ProductView({ product, preview = false }: { product: Product; preview?: boolean }) {
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
  const showSpecs = hasConfirmedSpecs(product) || product.variants.length > 0;

  return (
    <article className="mx-auto w-full max-w-[80rem] sm:px-6 sm:pt-6 lg:px-8">
      {productLd ? (
        <>
          <JsonLd data={productLd} />
          <JsonLd
            data={breadcrumbJsonLd(
              [
                { name: "Início", path: "/" },
                ...(product.category ? [{ name: product.category.name, path: `/categorias/${product.category.slug}` }] : []),
                { name: product.name, path: `/produtos/${product.slug}` },
              ],
              base,
            )}
          />
        </>
      ) : null}

      <div className="grid gap-2 bg-white sm:rounded-lg lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10 lg:p-6">
        <div className="min-w-0">
          <Gallery media={media} productName={product.name} />
        </div>

        <div className="min-w-0 space-y-4 px-4 pb-5 pt-2 lg:px-0 lg:pt-0">
          {preview ? <Badge tone="dark">Pré-visualização</Badge> : null}
          <h1 className="text-xl font-semibold leading-snug text-ink sm:text-2xl">{product.name}</h1>
          {product.shortDescription ? <p className="text-[0.9375rem] text-muted">{product.shortDescription}</p> : null}

          {product.attributes.firmness ? (
            <FirmnessScale value={product.attributes.firmness} illustrative={product.isDemo} />
          ) : null}

          {preview ? (
            <PurchasePanel product={panelProduct} has3d={Boolean(model)} />
          ) : (
            <Suspense fallback={<PurchasePanel product={panelProduct} has3d={Boolean(model)} />}>
              <PurchasePanelWithParams product={panelProduct} has3d={Boolean(model)} />
            </Suspense>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-2 sm:mt-4 sm:space-y-4">
        {model ? (
          <div className="bg-white px-4 py-5 sm:rounded-lg sm:px-6">
            <Viewer3D model={model} poster={primaryImage(product)} productName={product.name} />
          </div>
        ) : null}

        {product.description ? (
          <Block id="descricao-titulo" title="Descrição do produto">
            <Paragraphs text={product.description} />
          </Block>
        ) : null}

        {showSpecs ? (
          <Block id="especificacoes-titulo" title="Especificações">
            <div className="space-y-6">
              <SpecsList product={product} showPending={false} />
              <SizeTable product={product} />
            </div>
          </Block>
        ) : null}

        {product.faq.length ? (
          <Block id="faq-produto-titulo" title="Dúvidas sobre este produto">
            <FaqList items={product.faq} />
          </Block>
        ) : null}

      </div>

      {/* Espaço para a barra fixa de compra no celular não cobrir o fim da página. */}
      <div className="h-16 lg:hidden" aria-hidden="true" />
    </article>
  );
}

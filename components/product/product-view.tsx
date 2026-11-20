import { Suspense } from "react";
import { isDemoMode, siteUrl } from "@/config/site";
import { arFiles, hasConfirmedSpecs, model3d, primaryImage } from "@/lib/catalog/product-helpers";
import { productBreadcrumbs } from "@/lib/catalog/taxonomy";
import { colorOptions, colorVariants, galleryFor } from "@/lib/catalog/variants";
import type { Product } from "@/lib/catalog/types";
import { productStructuredDataAllowed } from "@/lib/seo/robots";
import { productJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/json-ld";
import { PageBreadcrumbs } from "@/components/seo/page-breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { FaqList } from "@/components/ui/faq-list";
import { Paragraphs } from "@/components/ui/paragraphs";
import { FirmnessScale } from "./firmness-scale";
import { ArchitectsSection } from "./architects";
import { ProductMedia } from "./product-media";
import { PurchasePanel, PurchasePanelWithParams } from "./purchase-panel";
import { SizeTable, SpecsList } from "./specs";
import { VariantSelectionProvider } from "./variant-selection";

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
 *
 * Dados para o Google: a trilha (BreadcrumbList) sempre que o produto é real;
 * Product/Offer só com preço real e a trava de indexação aberta (issue #17).
 * Produto de demonstração e pré-visualização: nenhum JSON-LD.
 */
export function ProductView({ product, preview = false }: { product: Product; preview?: boolean }) {
  // Fotos e 3D do produto (sem variação); cada cor pode ter os seus.
  const media = galleryFor(product, null);
  const model = product.media.find((m) => m.type === "model_3d" && m.variantId === null) ?? model3d(product);
  const ar = arFiles(product, model);
  const colors = colorOptions(product);
  const firstColor = colorVariants(product)[0] ?? null;
  // Com cores, a primeira (a das fotos do produto) já vem escolhida; com uma variação só, ela.
  const initialVariantId = firstColor?.id ?? (product.variants.length === 1 ? product.variants[0].id : null);
  const structured = !preview && !product.isDemo && !isDemoMode();
  const productLd = structured && productStructuredDataAllowed() ? productJsonLd(product, siteUrl()) : null;
  const panelProduct = {
    id: product.id,
    name: product.name,
    priceCents: product.priceCents,
    compareAtPriceCents: product.compareAtPriceCents,
    stockQuantity: product.stockQuantity,
    variants: product.variants,
    isDemo: product.isDemo,
  };
  const showSpecs = hasConfirmedSpecs(product) || product.variants.some((v) => v.size || v.widthCm);

  return (
    <article className="mx-auto w-full max-w-[80rem] sm:px-6 sm:pt-6 lg:px-8">
      {productLd ? <JsonLd data={productLd} /> : null}
      <PageBreadcrumbs items={productBreadcrumbs(product)} structured={structured} className="px-4 pb-1 sm:px-0 sm:pb-3" />

      <VariantSelectionProvider initialVariantId={initialVariantId} colors={colors.map((c) => ({ id: c.id, slug: c.slug }))}>
        <div className="grid gap-2 bg-white sm:rounded-lg lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10 lg:p-6">
          <div className="min-w-0">
            <ProductMedia
              media={media}
              model={model}
              poster={primaryImage(product)}
              productId={product.id}
              productName={product.name}
              productSlug={product.slug}
              usdzUrl={ar.usdzUrl}
              realScale={ar.realScale}
              colors={colors}
            />
          </div>

          <div className="min-w-0 space-y-4 px-4 pb-5 pt-2 lg:px-0 lg:pt-0">
            {preview ? <Badge tone="dark">Pré-visualização</Badge> : null}
            <h1 className="text-xl font-semibold leading-snug text-ink sm:text-2xl">{product.name}</h1>
            {showSpecs ? (
              <a href="#especificacoes-titulo" className="link inline-flex min-h-11 items-center text-sm">
                Ver medidas
              </a>
            ) : null}
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
      </VariantSelectionProvider>

      <div className="mt-2 space-y-2 sm:mt-4 sm:space-y-4">
        {showSpecs ? (
          <Block id="especificacoes-titulo" title="Especificações">
            <div className="space-y-6">
              <SpecsList product={product} showPending={false} />
              <SizeTable product={product} />
            </div>
          </Block>
        ) : null}

        {product.description ? (
          <Block id="descricao-titulo" title="Descrição do produto">
            <Paragraphs text={product.description} />
          </Block>
        ) : null}

        {product.faq.length ? (
          <Block id="faq-produto-titulo" title="Dúvidas sobre este produto">
            <FaqList items={product.faq} />
          </Block>
        ) : null}

        {/* No fim da página, discreto: ver architects.tsx. */}
        <ArchitectsSection product={product} />

      </div>

      {/* Espaço para a barra fixa de compra no celular não cobrir o fim da página. */}
      <div className="h-16 lg:hidden" aria-hidden="true" />
    </article>
  );
}

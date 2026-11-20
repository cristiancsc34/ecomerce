import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getVisibleProducts } from "@/lib/catalog/queries";
import { ProductSection, ProductSectionSkeleton } from "@/components/catalog/product-section";
import { JsonLd } from "@/components/seo/json-ld";
import { brand } from "@/config/brand";
import { isDemoMode, siteUrl } from "@/config/site";
import { CATEGORY_DELIVERY_SENTENCE } from "@/content/categorias";
import { OPEN_GRAPH_BASE } from "@/lib/seo/metadata";
import { pageRobots, productStructuredDataAllowed } from "@/lib/seo/robots";
import { itemListJsonLd } from "@/lib/seo/structured-data";

const TITLE = "Todos os produtos";
const DESCRIPTION = `Colchões, sofás e móveis da ${brand.name}. ${CATEGORY_DELIVERY_SENTENCE}`;

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const products = await getVisibleProducts();
  // Catálogo ainda vazio (ou trava de indexação fechada): nada para o Google indexar.
  const robots = pageRobots(products.length > 0);
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/produtos" },
    ...(robots ? { robots } : {}),
    openGraph: { ...OPEN_GRAPH_BASE, type: "website", title: TITLE, description: DESCRIPTION, url: "/produtos" },
  };
}

export default function ProductsPage() {
  return (
    <div className="mx-auto w-full max-w-[80rem] px-1.5 pt-2 sm:px-6 sm:pt-6 lg:px-8">
      <Suspense fallback={<ProductSectionSkeleton />}>
        <Results />
      </Suspense>
    </div>
  );
}

async function Results() {
  // Lista montada a cada visita (os dados vêm do cache): publicar/despublicar aparece na hora.
  await connection();
  const products = await getVisibleProducts();
  const list = isDemoMode() || !productStructuredDataAllowed() ? null : itemListJsonLd(products, siteUrl(), TITLE);
  return (
    <>
      {list ? <JsonLd data={list} /> : null}
      <ProductSection
      id="produtos-titulo"
      title={TITLE}
      headingLevel="h1"
      products={products}
      priorityCount={4}
      empty={{ title: "Catálogo em preparação", text: "Os produtos aparecem aqui assim que forem publicados." }}
      />
    </>
  );
}

import { connection } from "next/server";
import { Suspense } from "react";
import { getVisibleProducts } from "@/lib/catalog/queries";
import { ProductSection, ProductSectionSkeleton } from "@/components/catalog/product-section";

/** A loja abre direto nos produtos (sem página de apresentação). */
export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-[80rem] px-1.5 pt-2 sm:px-6 sm:pt-6 lg:px-8">
      <Suspense fallback={<ProductSectionSkeleton />}>
        <AllProducts />
      </Suspense>
    </div>
  );
}

async function AllProducts() {
  // Lista montada a cada visita (os dados vêm do cache): publicar/despublicar aparece na hora.
  await connection();
  const products = await getVisibleProducts();
  return (
    <ProductSection
      id="produtos-titulo"
      title="Produtos"
      headingLevel="h1"
      products={products}
      priorityCount={4}
      empty={{ title: "Catálogo em preparação", text: "Os produtos aparecem aqui assim que forem publicados." }}
    />
  );
}

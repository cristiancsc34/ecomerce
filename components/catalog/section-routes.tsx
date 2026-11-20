import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCategories, getVisibleProducts } from "@/lib/catalog/queries";
import type { SectionKey } from "@/lib/catalog/sections";
import { facetsOf, resolveSubpage, sectionCategories } from "@/lib/catalog/taxonomy";
import { listingMetadata, sectionView, subpageView } from "@/lib/seo/listing";
import { ListingPage } from "./listing-page";
import { ProductSectionSkeleton } from "./product-section";

/**
 * Peças comuns das rotas /colchoes, /estofados e /moveis (e das subpáginas).
 * O catálogo é lido a cada visita (vem do cache): publicar no painel aparece
 * na hora, como nas outras listagens.
 */

const CONTAINER = "mx-auto w-full max-w-[80rem] px-1.5 pt-2 sm:px-6 sm:pt-6 lg:px-8";

async function catalog() {
  const [products, categories] = await Promise.all([getVisibleProducts(), getCategories()]);
  return { products, categories };
}

export async function sectionMetadata(section: SectionKey): Promise<Metadata> {
  await connection();
  const { products, categories } = await catalog();
  return listingMetadata(sectionView(section, products, categories));
}

async function SectionResults({ section }: { section: SectionKey }) {
  await connection();
  const { products, categories } = await catalog();
  return <ListingPage view={sectionView(section, products, categories)} />;
}

export function SectionRoute({ section }: { section: SectionKey }) {
  return (
    <div className={CONTAINER}>
      <Suspense fallback={<ProductSectionSkeleton />}>
        <SectionResults section={section} />
      </Suspense>
    </div>
  );
}

/**
 * Subpáginas conhecidas no build: as subcategorias fixas (sempre) e as
 * categorias do banco da seção. Falha no catálogo não quebra o build: as
 * categorias são montadas na visita.
 */
export async function subpageStaticParams(section: SectionKey): Promise<{ sub: string }[]> {
  const categories = await getCategories().catch((error: unknown) => {
    console.error(`Seção ${section}: falha ao ler as categorias no generateStaticParams; seguindo só com as subcategorias fixas.`, error);
    return [];
  });
  const slugs = new Set([...facetsOf(section).map((f) => f.slug), ...sectionCategories(categories, section).map((c) => c.slug)]);
  return [...slugs].map((sub) => ({ sub }));
}

export async function subpageMetadata(section: SectionKey, slug: string): Promise<Metadata> {
  await connection();
  const { products, categories } = await catalog();
  const sub = resolveSubpage(section, slug, categories);
  // Já no metadata: o Google recebe 404 de verdade (não um "404 suave" com status 200).
  if (!sub) notFound();
  return listingMetadata(subpageView(sub, products, categories));
}

async function SubpageResults({ section, params }: { section: SectionKey; params: Promise<{ sub: string }> }) {
  await connection();
  const { sub: slug } = await params;
  const { products, categories } = await catalog();
  const sub = resolveSubpage(section, slug, categories);
  if (!sub) notFound();
  return <ListingPage view={subpageView(sub, products, categories)} />;
}

export function SubpageRoute({ section, params }: { section: SectionKey; params: Promise<{ sub: string }> }) {
  return (
    <div className={CONTAINER}>
      <Suspense fallback={<ProductSectionSkeleton />}>
        <SubpageResults section={section} params={params} />
      </Suspense>
    </div>
  );
}

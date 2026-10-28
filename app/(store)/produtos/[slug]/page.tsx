import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { primaryImage } from "@/lib/catalog/product-helpers";
import { getVisibleProductBySlug, getVisibleProducts } from "@/lib/catalog/queries";
import { ProductView } from "@/components/product/product-view";
import { Skeleton } from "@/components/ui/misc";

export async function generateStaticParams() {
  const products = await getVisibleProducts();
  // Cache Components exige ao menos um parâmetro; o placeholder cai em notFound().
  return products.length ? products.map((p) => ({ slug: p.slug })) : [{ slug: "__vazio__" }];
}

export async function generateMetadata({ params }: PageProps<"/produtos/[slug]">): Promise<Metadata> {
  // Lido a cada visita: o "shell" pré-renderizado guardaria o catálogo do momento
  // do build, e algo publicado depois abriria como "não encontrado".
  await connection();
  const { slug } = await params;
  const product = await getVisibleProductBySlug(slug);
  if (!product) return { title: "Produto não encontrado", robots: { index: false } };

  const title = product.seoTitle ?? product.name;
  const description =
    product.seoDescription ?? product.shortDescription ?? `${product.name} — ${brand.tagline}`;
  const image = primaryImage(product);
  const ogImage = image && !image.url.endsWith(".svg") ? [{ url: image.url, alt: image.altText }] : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/produtos/${product.slug}` },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/produtos/${product.slug}`,
      ...(ogImage ? { images: ogImage } : {}),
    },
  };
}

/**
 * O "shell" (cabeçalho, rodapé) é pré-renderizado; o produto é montado a cada
 * visita a partir do catálogo em cache. Assim, publicar ou despublicar no painel
 * aparece na hora (uma página de "não encontrado" guardada antes da publicação
 * não fica presa). Produto inexistente responde com "não encontrado" e `noindex`.
 */
export default function ProductPage({ params }: PageProps<"/produtos/[slug]">) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

async function ProductContent({ params }: Pick<PageProps<"/produtos/[slug]">, "params">) {
  await connection();
  const { slug } = await params;
  const product = await getVisibleProductBySlug(slug);
  if (!product) notFound();
  return <ProductView product={product} />;
}

function ProductSkeleton() {
  return (
    <div className="container-page py-6 sm:py-10" aria-busy="true" aria-label="Carregando produto">
      <Skeleton className="h-5 w-64" />
      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
        <Skeleton className="aspect-[4/3] rounded-[1.5rem]" />
        <div className="space-y-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}

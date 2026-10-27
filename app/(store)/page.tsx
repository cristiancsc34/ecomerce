import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { imageMedia, model3d } from "@/lib/catalog/product-helpers";
import { getVisibleProducts } from "@/lib/catalog/queries";
import type { Product } from "@/lib/catalog/types";
import { ProductSection, ProductSectionSkeleton } from "@/components/catalog/product-section";
import { buttonClasses } from "@/components/ui/button";
import { CubeIcon, ImageIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/misc";

/**
 * Página de venda: banner de destaque, vantagens reais da loja, vitrine e
 * chamada para o 3D. Nada de desconto, avaliação ou "mais vendido" inventado.
 */
export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-[80rem] space-y-3 px-2 pt-2 sm:space-y-5 sm:px-6 sm:pt-6 lg:px-8">
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}

async function HomeContent() {
  // Montada a cada visita (os dados vêm do cache): publicar/despublicar aparece na hora.
  await connection();
  const products = await getVisibleProducts();
  const featured = products.find((p) => model3d(p)) ?? products[0] ?? null;
  const with3d = products.filter((p) => model3d(p));

  return (
    <>
      <Hero product={featured} />
      <Highlights has3d={with3d.length > 0} />
      <div id="produtos" className="scroll-mt-20">
        <ProductSection
          id="produtos-titulo"
          title="Escolha o seu"
          products={products}
          priorityCount={2}
          empty={{ title: "Catálogo em preparação", text: "Os produtos aparecem aqui assim que forem publicados." }}
        />
      </div>
      {with3d[0] ? <Showcase3D product={with3d[0]} /> : null}
    </>
  );
}

/** Foto de destaque do banner: a vista ¾ (a mais vendedora), senão a principal. */
function heroImage(product: Product) {
  const images = imageMedia(product);
  return images.find((m) => m.url.includes("tres-quartos")) ?? images[1] ?? images[0] ?? null;
}

function Hero({ product }: { product: Product | null }) {
  const image = product ? heroImage(product) : null;
  return (
    <section
      aria-labelledby="destaque-titulo"
      // Mesmo degradê das fotos de catálogo: a foto se funde ao banner, sem emenda.
      className="grid grid-cols-[minmax(0,1fr)_48%] items-center overflow-hidden rounded-xl bg-gradient-to-b from-[#F9F5EF] to-[#EFE7DB] sm:grid-cols-[minmax(0,1fr)_42%]"
    >
      <div className="py-4 pl-4 pr-1 sm:py-10 sm:pl-10 lg:pl-14">
        <p className="text-xs font-bold uppercase tracking-wider text-air-blue-ink sm:text-sm">Cadeiras e poltronas</p>
        <h1 id="destaque-titulo" className="mt-1.5 text-[1.375rem] font-bold leading-tight text-deep-fjord sm:text-4xl lg:text-5xl">
          Conforto e estilo para a sua casa
        </h1>
        <p className="mt-4 hidden text-lg text-ink/80 sm:block">Veja cada peça de todos os ângulos e gire em 3D antes de escolher.</p>
        <a href="#produtos" className={buttonClasses({ size: "md", className: "mt-3 sm:mt-6 sm:min-h-12 sm:px-7 sm:text-base" })}>
          Ver produtos
        </a>
      </div>
      <div className="relative aspect-square">
        {image && product ? (
          <Link href={`/produtos/${product.slug}`} tabIndex={-1} aria-hidden="true">
            <Image
              src={image.url}
              alt=""
              fill
              priority
              sizes="(min-width: 1280px) 560px, 45vw"
              className="object-cover object-center"
            />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function Highlights({ has3d }: { has3d: boolean }) {
  const items = [
    { icon: ImageIcon, title: "Todos os ângulos", text: "Frente, lado, costas e ¾ de cada peça" },
    ...(has3d ? [{ icon: CubeIcon, title: "Veja em 3D", text: "Gire e aproxime antes de escolher" }] : []),
  ];
  return (
    <ul aria-label="Vantagens" className={`grid gap-2 sm:gap-4 ${items.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
      {items.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex min-w-0 items-center gap-2.5 rounded-lg bg-white p-3 shadow-[var(--shadow-soft)] sm:gap-4 sm:p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pale-blue text-air-blue-ink sm:h-11 sm:w-11">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold leading-tight text-deep-fjord sm:text-base">{title}</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted sm:text-sm">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Showcase3D({ product }: { product: Product }) {
  const image = heroImage(product);
  return (
    <section aria-labelledby="vitrine-3d-titulo" className="overflow-hidden rounded-xl bg-deep-fjord text-white">
      <div className="grid grid-cols-[minmax(0,1fr)_38%] items-center sm:grid-cols-[minmax(0,1fr)_32%]">
        <div className="py-5 pl-4 pr-2 sm:py-8 sm:pl-10">
          <p className="inline-flex items-center gap-1.5 rounded bg-white/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wider">
            <CubeIcon className="h-4 w-4" /> Em 3D
          </p>
          <h2 id="vitrine-3d-titulo" className="mt-2 text-lg font-bold leading-tight text-white sm:text-3xl">
            Gire a {product.name} em 3D
          </h2>
          <p className="mt-1.5 text-sm text-white/80 sm:text-base">Veja de todos os lados, como se estivesse na loja.</p>
          <Link
            href={`/produtos/${product.slug}#visualizador-3d`}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-deep-fjord hover:bg-pale-blue sm:text-base"
          >
            <CubeIcon className="h-5 w-5" /> Girar em 3D
          </Link>
        </div>
        <div className="p-3 sm:p-6">
          <div className="relative aspect-square overflow-hidden rounded-lg">
            {image ? <Image src={image.url} alt="" fill sizes="(min-width: 1024px) 400px, 38vw" className="object-cover" /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-3 sm:space-y-5" aria-busy="true" aria-label="Carregando a loja">
      <Skeleton className="aspect-[2/1] rounded-xl sm:aspect-[3/1]" />
      <ProductSectionSkeleton />
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { brand } from "@/config/brand";
import { STORE_FAQ } from "@/content/faq";
import { model3d, primaryImage } from "@/lib/catalog/product-helpers";
import { getCategoriesWithProducts, getVisibleProducts } from "@/lib/catalog/queries";
import { ProductGrid } from "@/components/product/product-card";
import { ProductImage } from "@/components/product/product-image";
import { ButtonLink } from "@/components/ui/button";
import { FaqList } from "@/components/ui/faq-list";
import { ChevronRightIcon, CubeIcon, EyeIcon, LayersIcon, RulerIcon } from "@/components/ui/icons";
import { EmptyState, SectionHeading } from "@/components/ui/misc";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Benefits />
      <FeaturedProducts />
      <Categories />
      <GuideTeaser />
      <ThreeDTeaser />
      <section aria-labelledby="faq-titulo" className="container-page py-14 sm:py-20">
        <SectionHeading id="faq-titulo" eyebrow="Dúvidas" title="Perguntas frequentes" />
        <div className="max-w-3xl">
          <FaqList items={STORE_FAQ} />
        </div>
      </section>
    </>
  );
}

function Hero() {
  const { hero } = brand;
  return (
    <section className="bg-gradient-to-b from-pale-blue to-cloud">
      <div className="container-page grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-20">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-air-blue-ink">{brand.name}</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]">
            {brand.slogan}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink/85">{brand.tagline} Compare tamanhos e firmeza com calma, com todas as informações à vista.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={brand.ctaPrimary.href} size="lg">
              {brand.ctaPrimary.label}
            </ButtonLink>
            <ButtonLink href={brand.ctaSecondary.href} size="lg" variant="secondary">
              {brand.ctaSecondary.label}
            </ButtonLink>
          </div>
        </div>
        <figure className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[1.5rem] border border-white bg-sky-mist shadow-[var(--shadow-lift)]">
            <Image
              src={hero.image}
              alt={hero.alt}
              fill
              sizes="(min-width: 1024px) 560px, 100vw"
              loading="eager"
              fetchPriority="high"
              unoptimized={hero.image.endsWith(".svg")}
              className="object-cover"
            />
          </div>
          {hero.isIllustrative ? (
            <figcaption className="mt-2 text-right text-xs text-muted">Imagem ilustrativa</figcaption>
          ) : null}
        </figure>
      </div>
    </section>
  );
}

const BENEFITS = [
  {
    icon: LayersIcon,
    title: "Especificações confirmadas",
    text: "Medidas, materiais e garantia só aparecem na loja depois de verificados.",
  },
  {
    icon: RulerIcon,
    title: "Ajuda para escolher",
    text: "Guia de tamanhos e firmeza, com medidas sempre em centímetros.",
  },
  {
    icon: EyeIcon,
    title: "Imagens identificadas",
    text: "Quando uma imagem é ilustrativa, você vê o aviso. Sem surpresas.",
  },
];

function Benefits() {
  return (
    <section aria-label="Por que comprar aqui" className="container-page -mt-2 py-8 sm:py-10">
      <ul className="grid gap-4 sm:grid-cols-3">
        {BENEFITS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-4 rounded-[1.25rem] border border-line bg-white p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pale-blue text-air-blue-ink">
              <Icon className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="mt-1 text-[0.9375rem] text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function FeaturedProducts() {
  const products = (await getVisibleProducts()).slice(0, 3);
  return (
    <section aria-labelledby="destaques-titulo" className="container-page py-10 sm:py-14">
      <SectionHeading
        id="destaques-titulo"
        eyebrow="Produtos"
        title="Conheça os colchões"
        description="Escolha pelo tamanho da sua cama e pela firmeza que você prefere."
        action={
          products.length ? (
            <Link href="/produtos" className="link inline-flex min-h-11 items-center gap-1 font-medium">
              Ver todos <ChevronRightIcon className="h-4 w-4" />
            </Link>
          ) : null
        }
      />
      {products.length ? (
        <ProductGrid products={products} />
      ) : (
        <EmptyState title="Catálogo em preparação">
          Estamos confirmando fotos, medidas e especificações dos primeiros produtos. Volte em breve.
        </EmptyState>
      )}
    </section>
  );
}

async function Categories() {
  const categories = await getCategoriesWithProducts();
  // Uma única categoria não precisa de bloco próprio: os produtos já aparecem acima.
  if (categories.length < 2) return null;
  const products = await getVisibleProducts();
  return (
    <section aria-labelledby="categorias-titulo" className="container-page py-10 sm:py-14">
      <SectionHeading id="categorias-titulo" eyebrow="Categorias" title="Navegue por categoria" />
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => {
          const cover = products.find((p) => p.category?.slug === c.slug);
          return (
            <li key={c.id}>
              <Link
                href={`/categorias/${c.slug}`}
                className="group block overflow-hidden rounded-[1.25rem] border border-line bg-white hover:shadow-[var(--shadow-lift)]"
              >
                <ProductImage media={cover ? primaryImage(cover) : null} sizes="(min-width: 1024px) 400px, 100vw" />
                <span className="flex items-center justify-between p-5">
                  <span className="text-lg font-semibold text-deep-fjord">{c.name}</span>
                  <span className="text-sm text-muted">
                    {c.productCount} {c.productCount === 1 ? "produto" : "produtos"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GuideTeaser() {
  const steps = [
    { n: 1, title: "Tamanho", text: "Meça a base da sua cama e escolha o tamanho em centímetros." },
    { n: 2, title: "Firmeza", text: "Considere como você dorme e a sensação que prefere." },
    { n: 3, title: "Detalhes", text: "Compare altura, materiais e garantia confirmados." },
  ];
  return (
    <section aria-labelledby="guia-titulo" className="py-10 sm:py-14">
      <div className="container-page">
        <div className="rounded-[1.5rem] bg-deep-fjord px-6 py-10 text-white sm:px-10 sm:py-14">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-sky-mist">Guia de escolha</p>
              <h2 id="guia-titulo" className="text-3xl font-bold text-white">
                Encontre o colchão que combina com o seu jeito de dormir
              </h2>
              <p className="mt-3 text-white/85">Três perguntas rápidas e você vê as opções que fazem mais sentido.</p>
              <ButtonLink href="/guia" variant="secondary" size="lg" className="mt-6 border-white">
                {brand.ctaPrimary.label}
              </ButtonLink>
            </div>
            <ol className="grid gap-4 sm:grid-cols-3">
              {steps.map((s) => (
                <li key={s.n} className="rounded-2xl bg-white/10 p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-mist font-bold text-deep-fjord">
                    {s.n}
                  </span>
                  <h3 className="mt-3 font-semibold text-white">{s.title}</h3>
                  <p className="mt-1 text-sm text-white/85">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Só aparece quando existe ao menos um modelo 3D aprovado (publicado com o produto). */
async function ThreeDTeaser() {
  const products = await getVisibleProducts();
  const withModel = products.find((p) => model3d(p));
  if (!withModel) return null;
  const model = model3d(withModel)!;
  return (
    <section aria-labelledby="tres-d-titulo" className="container-page py-10 sm:py-14">
      <div className="grid items-center gap-8 rounded-[1.5rem] border border-line bg-white p-6 sm:p-10 lg:grid-cols-2">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-air-blue-ink">
            <CubeIcon className="h-5 w-5" /> Visualização 3D
          </p>
          <h2 id="tres-d-titulo" className="text-2xl font-bold sm:text-3xl">
            {withModel.name} de todos os lados, em 3D
          </h2>
          <p className="mt-3 text-muted">
            O modelo 3D só é carregado quando você pede, para a página continuar leve.
            {model.isIllustrative ? " Este modelo é ilustrativo." : null}
          </p>
          <ButtonLink href={`/produtos/${withModel.slug}#visualizador-3d`} variant="secondary" className="mt-6">
            Abrir visualização 3D
          </ButtonLink>
        </div>
        <ProductImage media={primaryImage(withModel)} sizes="(min-width: 1024px) 560px, 100vw" className="rounded-2xl" />
      </div>
    </section>
  );
}

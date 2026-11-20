import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoMode, siteUrl } from "@/config/site";
import { GUIAS, guiaBySlug } from "@/content/guias";
import { JsonLd } from "@/components/seo/json-ld";
import { PageBreadcrumbs } from "@/components/seo/page-breadcrumbs";
import { OPEN_GRAPH_BASE } from "@/lib/seo/metadata";
import { pageRobots } from "@/lib/seo/robots";
import { articleJsonLd } from "@/lib/seo/structured-data";

export function generateStaticParams() {
  // Cache Components exige ao menos um parâmetro; sem guia publicado, o placeholder cai em notFound().
  return GUIAS.length ? GUIAS.map((g) => ({ slug: g.slug })) : [{ slug: "__vazio__" }];
}

export async function generateMetadata({ params }: PageProps<"/guias/[slug]">): Promise<Metadata> {
  const guia = guiaBySlug((await params).slug);
  if (!guia) notFound();
  const path = `/guias/${guia.slug}`;
  const robots = pageRobots(true);
  return {
    title: guia.title,
    description: guia.description,
    alternates: { canonical: path },
    ...(robots ? { robots } : {}),
    openGraph: {
      ...OPEN_GRAPH_BASE,
      type: "article",
      title: guia.title,
      description: guia.description,
      url: path,
      publishedTime: guia.datePublished,
      modifiedTime: guia.dateModified,
    },
  };
}

/** Guia de compra: texto, trilha e JSON-LD Article (só com artigo real). */
export default async function GuidePage({ params }: PageProps<"/guias/[slug]">) {
  const guia = guiaBySlug((await params).slug);
  if (!guia) notFound();
  const structured = !isDemoMode();
  const article = structured ? articleJsonLd(guia, siteUrl()) : null;
  return (
    <div className="container-page py-6 sm:py-10">
      {article ? <JsonLd data={article} /> : null}
      <PageBreadcrumbs
        items={[
          { name: "Início", path: "/" },
          { name: "Guias de compra", path: "/guias" },
          { name: guia.title, path: `/guias/${guia.slug}` },
        ]}
        structured={structured}
      />
      <article className="mt-4 max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">{guia.title}</h1>
        <p className="mt-2 text-sm text-muted">
          Por {guia.author} · atualizado em {guia.dateModified.split("-").reverse().join("/")}
        </p>
        <div className="prose-cuxoes mt-6">
          {guia.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <p className="mt-8">
          <Link href={`/categorias/${guia.categorySlug}`} className="link">
            Ver os produtos desta categoria
          </Link>
        </p>
      </article>
    </div>
  );
}

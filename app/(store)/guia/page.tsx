import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import {
  FEEL_LABELS,
  FEEL_PREFERENCES,
  parseGuideAnswers,
  recommendFirmness,
  recommendSizes,
  SLEEP_POSITION_LABELS,
  SLEEP_POSITIONS,
} from "@/lib/catalog/guide";
import { formatPrice } from "@/lib/catalog/money";
import { fromPriceCents, primaryImage } from "@/lib/catalog/product-helpers";
import { applyCatalogQuery, catalogQueryToSearchParams, EMPTY_QUERY } from "@/lib/catalog/query";
import { getVisibleProducts } from "@/lib/catalog/queries";
import { FIRMNESS_LABELS, SIZE_INFO, SIZE_KEYS } from "@/lib/catalog/types";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { GuideFormSync } from "@/components/catalog/guide-form-sync";
import { ProductImage } from "@/components/product/product-image";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { controlClasses } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Guia para escolher seu colchão",
  description: "Como escolher tamanho e firmeza do colchão: medidas em centímetros e orientação por posição de dormir.",
  alternates: { canonical: "/guia" },
};

const radioClasses = "h-5 w-5 shrink-0 accent-[var(--color-deep-fjord)]";

function OptionCard({ name, value, label, defaultChecked }: { name: string; value: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 border-line bg-white px-4 py-3 hover:border-[#b9c9d6] has-[:checked]:border-deep-fjord has-[:checked]:bg-pale-blue">
      <input type="radio" name={name} value={value} required defaultChecked={defaultChecked} className={radioClasses} />
      <span className="font-medium text-ink">{label}</span>
    </label>
  );
}

export default function GuidePage({ searchParams }: PageProps<"/guia">) {
  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Guia de escolha" }]} />
      <header className="mt-4 max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Guia para escolher seu colchão</h1>
        <p className="mt-3 text-lg text-ink/85">
          Responda três perguntas e veja tamanhos e firmezas que costumam combinar com o seu jeito de dormir.
        </p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <GuideForm />
        <GuideFormSync formId="guia-form" />

        <div id="resultado" className="min-w-0 scroll-mt-24">
          <Suspense fallback={<Skeleton className="h-80 w-full rounded-[1.5rem]" />}>
            <Recommendation searchParams={searchParams} />
          </Suspense>
        </div>
      </div>

      <SizesGuide />
      <FirmnessGuide />
    </div>
  );
}

/**
 * Formulário GET: funciona sem JavaScript. É estático (fora de Suspense) para não
 * ser trocado enquanto a pessoa responde; as respostas da URL são marcadas no cliente.
 */
function GuideForm() {
  return (
      <form
      id="guia-form"
      action="/guia#resultado"
      method="get"
      className="min-w-0 space-y-7 rounded-[1.5rem] border border-line bg-white p-5 sm:p-7">
        <fieldset>
          <legend className="mb-3 text-lg font-semibold text-deep-fjord">1. Quem vai dormir no colchão?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <OptionCard name="pessoas" value="um" label="Só eu" />
            <OptionCard name="pessoas" value="dois" label="Duas pessoas" />
          </div>
        </fieldset>

        <div>
          <label htmlFor="guia-cama" className="mb-2 block text-lg font-semibold text-deep-fjord">
            2. Já sabe o tamanho da sua cama?
          </label>
          <select id="guia-cama" name="cama" defaultValue="" className={controlClasses}>
            <option value="">Ainda não sei</option>
            {SIZE_KEYS.map((k) => (
              <option key={k} value={k}>
                {SIZE_INFO[k].label} ({SIZE_INFO[k].widthCm} × {SIZE_INFO[k].lengthCm} cm)
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="mb-3 text-lg font-semibold text-deep-fjord">3. Como você costuma dormir?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SLEEP_POSITIONS.map((p) => (
              <OptionCard key={p} name="posicao" value={p} label={SLEEP_POSITION_LABELS[p]} />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-lg font-semibold text-deep-fjord">E que sensação você prefere?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {FEEL_PREFERENCES.map((f) => (
              <OptionCard key={f} name="sensacao" value={f} label={FEEL_LABELS[f]} defaultChecked={f === "nao-sei"} />
            ))}
          </div>
        </fieldset>

        <button type="submit" className={buttonClasses({ size: "lg", className: "w-full" })}>
          Ver recomendação
        </button>
      </form>
  );
}

async function Recommendation({ searchParams }: Pick<PageProps<"/guia">, "searchParams">) {
  const answers = parseGuideAnswers(await searchParams);
  if (!answers) {
    return (
      <div className="flex h-full flex-col justify-center rounded-[1.5rem] bg-pale-blue p-6 sm:p-8">
        <h2 className="text-2xl font-bold">Sua recomendação aparece aqui</h2>
        <p className="mt-2 text-ink/85">
          Escolha as respostas ao lado e toque em <strong>Ver recomendação</strong>. Você pode mudar de ideia quantas vezes
          quiser.
        </p>
      </div>
    );
  }

  const firmezas = recommendFirmness(answers.posicao, answers.sensacao);
  const tamanhos = recommendSizes(answers.pessoas, answers.cama);
  const query = { ...EMPTY_QUERY, firmezas, tamanhos };
  const products = applyCatalogQuery(await getVisibleProducts(), query);
  const href = `/produtos?${catalogQueryToSearchParams(query).toString()}`;

  return (
    <section aria-labelledby="recomendacao-titulo" className="rounded-[1.5rem] bg-pale-blue p-6 sm:p-8">
      <h2 id="recomendacao-titulo" className="text-2xl font-bold">
        Nossa sugestão para você
      </h2>
      <dl className="mt-4 space-y-3">
        <div>
          <dt className="text-sm font-semibold uppercase tracking-wider text-air-blue-ink">Firmeza</dt>
          <dd className="text-lg font-semibold text-deep-fjord">{firmezas.map((f) => FIRMNESS_LABELS[f]).join(", ")}</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold uppercase tracking-wider text-air-blue-ink">Tamanho</dt>
          <dd className="text-lg font-semibold text-deep-fjord">
            {tamanhos.map((t) => `${SIZE_INFO[t].label} (${SIZE_INFO[t].widthCm} × ${SIZE_INFO[t].lengthCm} cm)`).join(", ")}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-ink/80">
        É uma orientação geral de conforto; cada pessoa sente a firmeza de um jeito. Não substitui a orientação de um
        profissional de saúde.
      </p>

      <div className="mt-6">
        {products.length ? (
          <>
            <p className="mb-4 font-medium text-ink">
              {products.length === 1 ? "1 produto combina" : `${products.length} produtos combinam`} com a sugestão:
            </p>
            <ul className="space-y-3">
              {products.slice(0, 3).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/produtos/${p.slug}${tamanhos.length === 1 ? `?tamanho=${tamanhos[0]}` : ""}`}
                    className="flex items-center gap-4 rounded-2xl border border-line bg-white p-3 hover:border-deep-fjord"
                  >
                    <ProductImage media={primaryImage(p)} sizes="96px" className="w-24 shrink-0 rounded-xl" showIllustrativeBadge={false} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-deep-fjord">{p.name}</span>
                      {p.attributes.firmness ? (
                        <span className="block text-sm text-muted">Firmeza {FIRMNESS_LABELS[p.attributes.firmness].toLowerCase()}</span>
                      ) : null}
                      {fromPriceCents(p) !== null ? (
                        <span className="block text-sm font-medium text-ink">
                          a partir de {formatPrice(fromPriceCents(p)!)}
                          {p.isDemo ? " (ilustrativo)" : ""}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <ButtonLink href={href} className="mt-5">
              Ver {products.length === 1 ? "o produto" : "todos"} no catálogo
            </ButtonLink>
          </>
        ) : (
          <Notice tone="info" title="Ainda não temos um produto com essa combinação">
            <p>
              Veja os mais próximos no <Link href="/produtos" className="link">catálogo completo</Link> ou fale com o{" "}
              <Link href="/atendimento" className="link">atendimento da {brand.name}</Link>.
            </p>
          </Notice>
        )}
      </div>
    </section>
  );
}

function SizesGuide() {
  return (
    <section aria-labelledby="tamanhos-titulo" className="mt-16">
      <h2 id="tamanhos-titulo" className="text-2xl font-bold sm:text-3xl">
        Tamanhos de colchão no Brasil
      </h2>
      <p className="mt-2 max-w-3xl text-muted">
        Meça a base ou o estrado da sua cama. Os nomes comerciais variam um pouco entre fabricantes; por isso, compare
        sempre as medidas em centímetros.
      </p>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-white" tabIndex={0} role="region" aria-label="Tabela de tamanhos">
        <table className="w-full min-w-[30rem] text-left">
          <caption className="sr-only">Medidas usuais de cada tamanho de colchão</caption>
          <thead className="bg-pale-blue text-deep-fjord">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Tamanho</th>
              <th scope="col" className="px-4 py-3 font-semibold">Largura × comprimento</th>
              <th scope="col" className="px-4 py-3 font-semibold">Costuma servir para</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {SIZE_KEYS.map((k) => (
              <tr key={k}>
                <th scope="row" className="px-4 py-3 font-medium text-ink">
                  {SIZE_INFO[k].label}
                </th>
                <td className="px-4 py-3">
                  {SIZE_INFO[k].widthCm} × {SIZE_INFO[k].lengthCm} cm
                </td>
                <td className="px-4 py-3 text-muted">
                  {k === "solteiro" || k === "solteiro-king" ? "Uma pessoa" : "Duas pessoas"}
                  {k === "solteiro-king" ? " (mais espaço e comprimento)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FirmnessGuide() {
  const items = [
    {
      title: "De lado",
      text: "Ombros e quadril pedem mais acomodação. Quem dorme assim costuma preferir firmezas entre macio e médio.",
    },
    {
      title: "De barriga para cima",
      text: "Costuma-se buscar equilíbrio entre apoio e conforto: médio a médio-firme.",
    },
    {
      title: "De bruços",
      text: "Superfícies mais firmes costumam ser preferidas, para o corpo não afundar demais.",
    },
    {
      title: "Duas pessoas",
      text: "Se as preferências forem diferentes, um meio-termo (médio) costuma agradar os dois.",
    },
  ];
  return (
    <section aria-labelledby="firmeza-titulo" className="mt-16">
      <h2 id="firmeza-titulo" className="text-2xl font-bold sm:text-3xl">
        Firmeza e posição de dormir
      </h2>
      <p className="mt-2 max-w-3xl text-muted">
        Orientação geral de conforto. Preferências pessoais variam; em caso de dor ou condição de saúde, procure um
        profissional.
      </p>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((i) => (
          <li key={i.title} className="rounded-[1.25rem] border border-line bg-white p-5">
            <h3 className="font-semibold">{i.title}</h3>
            <p className="mt-2 text-[0.9375rem] text-muted">{i.text}</p>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/comparar" variant="secondary">
          Comparar os colchões
        </ButtonLink>
        <ButtonLink href="/produtos" variant="ghost">
          Ver todos os produtos
        </ButtonLink>
      </div>
    </section>
  );
}

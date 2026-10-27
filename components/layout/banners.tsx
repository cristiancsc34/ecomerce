import Link from "next/link";
import { brand } from "@/config/brand";
import { isDemoMode } from "@/config/site";

/** Aviso permanente do modo demonstração: nada é vendido, tudo é ilustrativo. */
export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="bg-warm-coral/70 text-ink">
      <p className="container-page py-2 text-center text-sm font-medium">
        <strong className="font-semibold">Ambiente de demonstração.</strong> Produtos, preços e imagens são ilustrativos
        — nada está à venda.
      </p>
    </div>
  );
}

/** Barra de aviso opcional (config/brand.ts). Nunca usar para promoção falsa ou urgência fictícia. */
export function AnnouncementBar() {
  const a = brand.announcement;
  if (!a) return null;
  return (
    <div className="bg-deep-fjord text-white">
      <p className="container-page py-2 text-center text-sm">
        {a.href ? (
          <Link href={a.href} className="underline underline-offset-2 hover:no-underline">
            {a.text}
          </Link>
        ) : (
          a.text
        )}
      </p>
    </div>
  );
}

export function SkipLink() {
  return (
    <a
      href="#conteudo"
      className="sr-only z-50 rounded-full bg-deep-fjord px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      Pular para o conteúdo
    </a>
  );
}

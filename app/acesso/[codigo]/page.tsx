import type { Metadata } from "next";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { isSupabaseConfigured } from "@/config/site";
import { linkPeloCodigo } from "@/lib/admin/access-links";
import { ROTULO_AREA } from "@/lib/auth/areas";
import { getStaff } from "@/lib/auth/staff";
import { AccessLinkEnterForm } from "@/components/admin/access-link-enter";
import { LogoMark } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Acesso ao painel", robots: { index: false, follow: false } };

/**
 * Página do link de acesso (docs/PAINEL.md, "Links de acesso"). Mostra para que serve o link e um botão para entrar;
 * abrir o link sozinho não entra (prévias de link do WhatsApp e afins não contam como uso).
 */
export default function AcessoPage({ params }: PageProps<"/acesso/[codigo]">) {
  return (
    <main id="conteudo" className="flex min-h-svh items-center justify-center bg-gradient-to-b from-pale-blue to-cloud px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-deep-fjord">
          <LogoMark className="h-10 w-10" />
          <span className="text-2xl font-bold">{brand.name}</span>
          <span className="rounded-full bg-deep-fjord px-2 py-0.5 text-xs font-semibold text-white">Painel</span>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <h1 className="text-2xl font-bold">Acesso ao painel</h1>
          <Suspense fallback={<p className="mt-4 text-muted">Carregando…</p>}>
            <ConteudoDoAcesso params={params} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function ConteudoDoAcesso({ params }: Pick<PageProps<"/acesso/[codigo]">, "params">) {
  const { codigo } = await params;
  if (!isSupabaseConfigured()) {
    return <p className="mt-2 text-muted">O painel ainda não está conectado.</p>;
  }
  const link = await linkPeloCodigo(codigo);
  if (!link || link.situacao !== "ativo") {
    const motivo = !link ? "Este link não existe." : link.situacao === "revogado" ? "Este link foi revogado." : "Este link venceu.";
    return (
      <Notice tone="warning" className="mt-5" title={motivo}>
        Peça um novo link ao administrador da loja.
      </Notice>
    );
  }
  const atual = await getStaff();
  return (
    <>
      <p className="mt-1 text-muted">
        Link de <strong className="text-ink">{link.label}</strong>.
      </p>
      <p className="mt-4 text-sm font-medium text-ink">Este link abre:</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {link.areas.map((a) => (
          <li key={a} className="rounded-full bg-pale-blue px-3 py-1 text-sm font-semibold text-deep-fjord">
            {ROTULO_AREA[a]}
          </li>
        ))}
      </ul>
      {atual ? (
        <Notice tone="info" className="mt-5" title="Você já está no painel neste aparelho">
          Entrar pelo link troca a conta atual por este acesso.
        </Notice>
      ) : null}
      <AccessLinkEnterForm codigo={codigo} />
      <p className="mt-4 text-center text-xs text-muted">Não repasse este link: quem tiver o link entra.</p>
    </>
  );
}

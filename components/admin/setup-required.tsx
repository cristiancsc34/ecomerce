import Link from "next/link";
import { Notice } from "@/components/ui/notice";

/** Exibido quando o Supabase não está configurado: o painel não funciona sem banco/autenticação. */
export function SetupRequired() {
  return (
    <main id="conteudo" className="container-page flex min-h-dvh max-w-2xl flex-col justify-center py-16">
      <h1 className="text-3xl font-bold">Painel ainda não conectado</h1>
      <p className="mt-3 text-lg text-ink/85">
        O painel administrativo usa o Supabase para login, banco de dados e fotos. Ele ainda não foi configurado neste
        ambiente.
      </p>
      <Notice tone="info" className="mt-6" title="Como ativar">
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>Crie um projeto no Supabase e aplique as migrações de <code>supabase/migrations</code>.</li>
          <li>
            Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> no ambiente.
          </li>
          <li>
            Crie o primeiro administrador com <code>npm run admin:create</code>.
          </li>
        </ol>
        <p className="mt-2">O passo a passo completo está no README do repositório.</p>
      </Notice>
      <Link href="/" className="link mt-8">
        Voltar para a loja
      </Link>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { isSupabaseConfigured } from "@/config/site";
import { pinLoginEnabled } from "@/lib/admin/pin";
import { getStaff } from "@/lib/auth/staff";
import { LoginForm } from "@/components/admin/login-form";
import { PinForm } from "@/components/admin/pin-form";
import { SetupRequired } from "@/components/admin/setup-required";
import { LogoMark } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  return (
    <main id="conteudo" className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-pale-blue to-cloud px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-deep-fjord">
          <LogoMark className="h-10 w-10" />
          <span className="text-2xl font-bold">{brand.name}</span>
          <span className="rounded-full bg-deep-fjord px-2 py-0.5 text-xs font-semibold text-white">Painel</span>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <h1 className="text-2xl font-bold">Entrar no painel</h1>
          <Suspense fallback={<p className="mt-4 text-muted">Carregando…</p>}>
            <LoginContent searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/admin/login">, "searchParams">) {
  // Quem já está logado vai direto para o painel.
  if (await getStaff()) redirect("/admin");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/admin";
  const motivo = typeof params.motivo === "string" ? params.motivo : null;
  const withPin = pinLoginEnabled() && params.modo !== "email";
  const switchHref = (modo: string | null) => {
    const q = new URLSearchParams({ next });
    if (modo) q.set("modo", modo);
    return `/admin/login?${q.toString()}`;
  };

  return (
    <>
      <p className="mt-1 text-muted">{withPin ? "Digite o PIN da loja." : "Acesso restrito à equipe da loja."}</p>
      {motivo === "sem-acesso" ? (
        <Notice tone="info" className="mt-5" title="Faça login para continuar">
          Sua sessão expirou ou esta área exige login.
        </Notice>
      ) : null}
      {withPin ? <PinForm next={next} /> : <LoginForm next={next} />}
      {pinLoginEnabled() ? (
        <p className="mt-6 text-center text-sm">
          <Link href={switchHref(withPin ? "email" : null)} className="link">
            {withPin ? "Entrar com e-mail e senha" : "Entrar com o PIN da loja"}
          </Link>
        </p>
      ) : null}
    </>
  );
}

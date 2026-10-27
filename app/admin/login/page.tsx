import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { isSupabaseConfigured } from "@/config/site";
import { getStaff } from "@/lib/auth/staff";
import { LoginForm } from "@/components/admin/login-form";
import { SetupRequired } from "@/components/admin/setup-required";
import { LogoMark } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  return (
    <main id="conteudo" className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2 text-deep-fjord">
          <LogoMark className="h-10 w-10" />
          <span className="text-2xl font-bold">{brand.name}</span>
        </div>
        <div className="rounded-[1.5rem] border border-line bg-white p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <h1 className="text-2xl font-bold">Entrar no painel</h1>
          <p className="mt-1 text-muted">Acesso restrito à equipe da loja.</p>
          <Suspense fallback={<LoginForm next="/admin" />}>
            <LoginContent searchParams={searchParams} />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          Não há cadastro público. Novas contas são criadas por um administrador.
        </p>
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
  return (
    <>
      {motivo === "sem-acesso" ? (
        <Notice tone="info" className="mt-5" title="Faça login para continuar">
          Sua sessão expirou ou esta área exige login.
        </Notice>
      ) : null}
      <LoginForm next={next} />
    </>
  );
}

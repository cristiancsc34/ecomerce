import Link from "next/link";
import { brand } from "@/config/brand";
import { isSupabaseConfigured } from "@/config/site";
import { signOutAction } from "@/lib/admin/actions/auth";
import { requireStaffPage } from "@/lib/auth/staff";
import { AdminBottomNav, AdminSidebarNav } from "@/components/admin/admin-nav";
import { SetupRequired } from "@/components/admin/setup-required";
import { SkipLink } from "@/components/layout/banners";
import { ExternalIcon, LogoMark, LogoutIcon } from "@/components/ui/icons";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  const staff = await requireStaffPage();
  const roleLabel = staff.role === "admin" ? "Administrador" : "Editor";

  return (
    <div className="min-h-dvh bg-cloud">
      <SkipLink />

      {/* Computador: menu lateral fixo, da altura da tela. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-deep-fjord p-4 text-white lg:flex">
        <Link href="/admin" className="mb-6 flex items-center gap-2 px-1">
          <LogoMark className="h-8 w-8" />
          <span className="font-bold">{brand.name}</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">Painel</span>
        </Link>
        <AdminSidebarNav />
        <div className="mt-auto space-y-1 border-t border-white/15 pt-4 text-sm">
          <a
            href="/"
            target="_blank"
            rel="noopener"
            className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <ExternalIcon className="h-5 w-5" /> Ver loja
          </a>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <LogoutIcon className="h-5 w-5" /> Sair
            </button>
          </form>
          <p className="truncate px-3 pt-2 text-xs text-white/60" title={staff.email ?? undefined}>
            {staff.email} · {roleLabel}
          </p>
        </div>
      </aside>

      {/* Celular: barra de cima simples + abas embaixo. */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-deep-fjord px-4 text-white lg:hidden">
        <Link href="/admin" className="flex items-center gap-2">
          <LogoMark className="h-7 w-7" />
          <span className="font-bold">{brand.name}</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">Painel</span>
        </Link>
        <a href="/" target="_blank" rel="noopener" className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
          <ExternalIcon className="h-5 w-5" />
          <span className="sr-only">Ver loja</span>
        </a>
        <form action={signOutAction}>
          <button type="submit" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
            <LogoutIcon className="h-5 w-5" />
            <span className="sr-only">Sair</span>
          </button>
        </form>
      </header>

      <main id="conteudo" tabIndex={-1} className="px-4 pb-24 pt-5 outline-none sm:px-6 lg:ml-60 lg:px-10 lg:pb-12 lg:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <AdminBottomNav />
    </div>
  );
}

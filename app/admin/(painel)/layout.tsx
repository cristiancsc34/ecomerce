import Link from "next/link";
import { brand } from "@/config/brand";
import { isSupabaseConfigured } from "@/config/site";
import { signOutAction } from "@/lib/admin/actions/auth";
import { requireStaffPage } from "@/lib/auth/staff";
import { AdminNav } from "@/components/admin/admin-nav";
import { SetupRequired } from "@/components/admin/setup-required";
import { SkipLink } from "@/components/layout/banners";
import { LogoMark } from "@/components/ui/icons";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  const staff = await requireStaffPage();

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[15rem_minmax(0,1fr)]">
      <SkipLink />
      <aside className="bg-deep-fjord text-white lg:sticky lg:top-0 lg:h-dvh">
        <div className="flex flex-col gap-4 p-4 lg:h-full lg:p-5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin" className="flex items-center gap-2">
              <LogoMark className="h-8 w-8" />
              <span className="font-bold">{brand.name}</span>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">Painel</span>
            </Link>
          </div>
          <AdminNav />
          <div className="mt-auto hidden space-y-3 border-t border-white/15 pt-4 text-sm lg:block">
            <p className="truncate text-white/85" title={staff.email ?? undefined}>
              {staff.email}
            </p>
            <p className="text-white/70">{staff.role === "admin" ? "Administrador" : "Editor"}</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="inline-flex min-h-10 items-center rounded-lg px-2 text-white/85 underline-offset-2 hover:underline">
                Ver loja
              </Link>
              <form action={signOutAction}>
                <button type="submit" className="inline-flex min-h-10 items-center rounded-lg px-2 text-white/85 underline-offset-2 hover:underline">
                  Sair
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-2 text-sm lg:hidden">
          <span className="truncate text-muted">
            {staff.email} · {staff.role === "admin" ? "Administrador" : "Editor"}
          </span>
          <form action={signOutAction}>
            <button type="submit" className="inline-flex min-h-10 items-center font-medium text-deep-fjord underline-offset-2 hover:underline">
              Sair
            </button>
          </form>
        </div>
        <main id="conteudo" tabIndex={-1} className="px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

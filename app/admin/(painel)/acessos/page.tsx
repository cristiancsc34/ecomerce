import type { Metadata } from "next";
import { listarLinksDeAcesso } from "@/lib/admin/acessos";
import { requireStaffPage } from "@/lib/auth/staff";
import { AccessLinksManager } from "@/components/admin/access-links";
import { PageHeader } from "@/components/admin/ui";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Acessos" };

/** Links de acesso por área (só a administração geral). Ver docs/PAINEL.md, "Links de acesso". */
export default async function AcessosPage() {
  await requireStaffPage("admin");
  let links: Awaited<ReturnType<typeof listarLinksDeAcesso>> | null = null;
  try {
    links = await listarLinksDeAcesso();
  } catch {
    links = null;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Acessos"
        subtitle="Dê acesso a uma parte do painel com um link: itens, pedidos ou entrega. Revogue quando quiser."
      />
      {links ? (
        <AccessLinksManager links={links} />
      ) : (
        <Notice tone="danger" role="alert" title="Não foi possível carregar os links agora">
          Atualize a página para tentar de novo.
        </Notice>
      )}
    </div>
  );
}

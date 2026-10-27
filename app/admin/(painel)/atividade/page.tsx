import type { Metadata } from "next";
import { listAuditEvents } from "@/lib/admin/data";
import { requireStaffPage } from "@/lib/auth/staff";
import { AuditList } from "@/components/admin/audit-list";

export const metadata: Metadata = { title: "Atividade" };

export default async function ActivityPage() {
  await requireStaffPage();
  const events = await listAuditEvents({ limit: 100 });
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Atividade</h1>
        <p className="mt-1 text-muted">
          Trilha das alterações importantes: criação, status, preços, endereço e mídia. Registrada pelo banco de dados.
        </p>
      </header>
      <AuditList events={events} />
    </div>
  );
}

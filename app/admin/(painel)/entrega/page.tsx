import type { Metadata } from "next";
import { getNotificationSettings, listShippingOptions } from "@/lib/admin/shipping";
import { requireStaffPage } from "@/lib/auth/staff";
import { providerStatus } from "@/lib/notifications/providers";
import { NotificationSettingsForm, ShippingOptionsEditor } from "@/components/admin/shipping-settings";
import { Card, PageHeader } from "@/components/admin/ui";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Entrega e avisos" };

export default async function ShippingSettingsPage() {
  const staff = await requireStaffPage("editor", "entrega");
  const [settings, options] = await Promise.all([getNotificationSettings(), listShippingOptions()]);
  // Muda: a administração geral e quem entrou com a senha da área de entrega (mesma regra do banco).
  const isAdmin = staff.role === "admin" || staff.areas.includes("entrega");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Entrega e avisos" subtitle="Onde a loja entrega, por quanto e em quanto tempo, e os avisos automáticos ao cliente." />
      {!settings || !options ? (
        <Notice tone="warning" title="Falta atualizar o banco">
          Aplique a migração supabase/migrations/20261103000300_shipping_notifications.sql.
        </Notice>
      ) : (
        <>
          <Card id="entrega" title="Formas de entrega" description="Nada aparece para o cliente sem estar aqui. CEP fora de todas as regiões: frete a combinar.">
            <ShippingOptionsEditor options={options} isAdmin={isAdmin} />
          </Card>
          <Card id="avisos" title="Avisos automáticos" description="A cada etapa do pedido (do site ou do painel), o cliente recebe um aviso com o link de acompanhamento.">
            <NotificationSettingsForm settings={settings} isAdmin={isAdmin} providers={providerStatus()} />
          </Card>
        </>
      )}
    </div>
  );
}

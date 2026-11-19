import type { Metadata } from "next";
import { getNotificationSettings, listShippingOptions } from "@/lib/admin/shipping";
import { requireStaffPage } from "@/lib/auth/staff";
import { providerStatus } from "@/lib/notifications/providers";
import { carrierPanelStatus } from "@/lib/shipping/carrier";
import { NotificationSettingsForm, ShippingOptionsEditor } from "@/components/admin/shipping-settings";
import { Card, PageHeader } from "@/components/admin/ui";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Entrega e avisos" };

export default async function ShippingSettingsPage() {
  const staff = await requireStaffPage("editor", "entrega");
  const [settings, options, carriers] = await Promise.all([getNotificationSettings(), listShippingOptions(), carrierPanelStatus()]);
  // Muda: a administração geral e quem entrou por um link da área de entrega (mesma regra do banco).
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
          <Card
            id="transportadoras"
            title="Transportadoras (Melhor Envio)"
            description="Cotação automática pelo CEP e pelas caixas de cada produto. Aparece junto das formas de entrega acima; o valor é conferido pela loja ao fechar o pedido."
          >
            {carriers.enabled ? (
              <Notice tone="success" title="Ligada">
                Ambiente: {carriers.ambiente === "sandbox" ? "testes (sandbox)" : "produção"}. CEP de origem:{" "}
                {carriers.cepOrigem?.replace(/^(\d{5})(\d{3})$/, "$1-$2")}. Produto sem caixas cadastradas (aba Preço do
                produto) continua com frete “a combinar”.
                {carriers.tokenExpiresAt ? (
                  <span className="mt-2 block">
                    O token vence em {new Date(carriers.tokenExpiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
                    Gere um novo e troque na Vercel antes disso (sem token válido, as transportadoras somem e o frete fica
                    “a combinar”).
                  </span>
                ) : null}
              </Notice>
            ) : (
              <Notice tone="info" title="Desligada">
                <p>Para ligar, configure na Vercel (só no servidor) e publique de novo:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {carriers.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                  {carriers.migrationApplied === false ? <li>Aplicar a migração 20261119000300_frete_transportadoras.sql no banco</li> : null}
                </ul>
                <p className="mt-2">Passo a passo em docs/FRETE-TRANSPORTADORAS.md.</p>
              </Notice>
            )}
          </Card>
          <Card id="avisos" title="Avisos automáticos" description="A cada etapa do pedido (do site ou do painel), o cliente recebe um aviso com o link de acompanhamento.">
            <NotificationSettingsForm settings={settings} isAdmin={isAdmin} providers={providerStatus()} />
          </Card>
        </>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { TrackOrderForm } from "@/components/orders/track-order-form";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Acompanhar pedido",
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Acompanhar pedido" }]} />
      <div className="mx-auto mt-4 max-w-xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Acompanhe seu pedido</h1>
        <p className="mt-2 text-muted">
          Use o link que enviamos pelo WhatsApp, ou informe o número do pedido e o celular usado na compra. Você não precisa
          de cadastro.
        </p>
        <div className="mt-6 rounded-2xl border border-line bg-white p-4 sm:p-6">
          <TrackOrderForm />
        </div>
        <p className="mt-6 text-sm text-muted">Ainda não comprou ou tem alguma dúvida?</p>
        <ButtonLink href="/atendimento" variant="secondary" className="mt-2">
          Falar com o atendimento
        </ButtonLink>
      </div>
    </div>
  );
}

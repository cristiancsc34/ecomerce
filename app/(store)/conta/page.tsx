import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { UserIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Minha conta",
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Minha conta" }]} />
      <h1 className="mb-6 mt-4 text-3xl font-bold sm:text-4xl">Minha conta</h1>
      <EmptyState
        icon={<UserIcon className="h-7 w-7" />}
        title="Área do cliente em breve"
        action={
          <>
            <ButtonLink href="/produtos">Ver produtos</ButtonLink>
            <ButtonLink href="/atendimento" variant="secondary">
              Falar com o atendimento
            </ButtonLink>
          </>
        }
      >
        A conta de cliente chega junto com a compra online, para acompanhar pedidos e entregas. Por enquanto, você não
        precisa de cadastro para navegar ou montar a sua sacola.
      </EmptyState>
    </div>
  );
}

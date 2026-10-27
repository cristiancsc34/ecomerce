import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { PolicyPage } from "@/components/layout/policy-page";

export const metadata: Metadata = {
  title: "Entrega",
  description: "Como funcionam frete e prazo de entrega.",
  alternates: { canonical: "/politicas/entrega" },
};

export default function ShippingPage() {
  return (
    <PolicyPage title="Entrega" updatedAt="27/10/2026">
      <p>
        A compra online da {brand.name} ainda está em preparação. Por isso, este site ainda não calcula frete nem prazo de
        entrega.
      </p>

      <h2>Quando a compra online for ativada</h2>
      <ul>
        <li>Frete e prazo serão calculados pelo seu CEP, antes do pagamento, com o valor real da transportadora.</li>
        <li>Não exibimos prazos ou valores estimados sem esse cálculo.</li>
        <li>
          Colchões são volumosos: as regiões atendidas e as condições de entrega serão informadas aqui assim que forem
          definidas.
        </li>
      </ul>

      <h2>Enquanto isso</h2>
      <p>
        Para saber se entregamos no seu endereço, fale com o <Link href="/atendimento">atendimento</Link>.
      </p>
    </PolicyPage>
  );
}

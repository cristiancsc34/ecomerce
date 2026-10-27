import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { PolicyPage } from "@/components/layout/policy-page";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: `Condições de uso do site da ${brand.name}.`,
  alternates: { canonical: "/politicas/termos-de-uso" },
};

export default function TermsPage() {
  return (
    <PolicyPage title="Termos de uso" updatedAt="27/10/2026">
      <p>Ao usar este site, você concorda com as condições abaixo.</p>

      <h2>Informações dos produtos</h2>
      <ul>
        <li>Publicamos medidas, materiais, garantia e cuidados somente depois de confirmados com o fabricante.</li>
        <li>Imagens ilustrativas são sempre identificadas como tal.</li>
        <li>
          Produtos marcados como “demonstração” servem apenas para apresentar o site e não estão à venda; seus preços e
          dados são ilustrativos.
        </li>
        <li>Preços e disponibilidade podem mudar; o valor válido é o confirmado no momento da compra.</li>
      </ul>

      <h2>Sacola e compra</h2>
      <p>
        A sacola ajuda a simular valores. Enquanto a compra online não estiver ativa, nenhum pedido é criado pelo site; a
        venda é concluída com o <Link href="/atendimento">atendimento</Link>.
      </p>

      <h2>Propriedade intelectual</h2>
      <p>
        Textos, ilustrações, marca e layout deste site pertencem à {brand.name} ou a seus licenciantes e não podem ser
        reproduzidos sem autorização.
      </p>

      <h2>Privacidade</h2>
      <p>
        O tratamento de dados pessoais segue a nossa <Link href="/politicas/privacidade">política de privacidade</Link>.
      </p>

      <h2>Lei aplicável</h2>
      <p>Estes termos seguem a legislação brasileira, incluindo o Código de Defesa do Consumidor.</p>
    </PolicyPage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { PolicyPage } from "@/components/layout/policy-page";

export const metadata: Metadata = {
  title: "Trocas e devoluções",
  description: "Direito de arrependimento, garantia legal e como pedir troca ou devolução.",
  alternates: { canonical: "/politicas/trocas-e-devolucoes" },
};

export default function ReturnsPage() {
  return (
    <PolicyPage title="Trocas e devoluções" updatedAt="27/10/2026">
      <p>
        Estes são os direitos garantidos pelo Código de Defesa do Consumidor (CDC — Lei nº 8.078/1990). As regras
        operacionais da {brand.name} (como agendar a coleta e prazos internos) serão publicadas aqui antes do início da
        compra online.
      </p>

      <h2>Direito de arrependimento</h2>
      <p>
        Em compras feitas fora da loja física — pela internet ou pelo telefone, por exemplo — você pode desistir em até 7
        dias a contar do recebimento do produto, sem precisar justificar. Os valores pagos são devolvidos (art. 49 do
        CDC).
      </p>

      <h2>Produto com defeito</h2>
      <p>
        Para produtos duráveis, como móveis, o prazo para reclamar de defeitos aparentes é de 90 dias a partir da entrega
        (art. 26 do CDC). Para defeitos ocultos, o prazo começa quando o defeito aparece. A garantia do fabricante, quando
        existir, é informada na página de cada produto e se soma à garantia legal.
      </p>

      <h2>Como pedir</h2>
      <p>
        Fale com o <Link href="/atendimento">atendimento</Link> informando o produto e o motivo. Vamos orientar os próximos
        passos.
      </p>
    </PolicyPage>
  );
}

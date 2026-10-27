import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { LegalValue, PolicyPage } from "@/components/layout/policy-page";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Como tratamos dados pessoais, em linha com a LGPD (Lei nº 13.709/2018).",
  alternates: { canonical: "/politicas/privacidade" },
};

export default function PrivacyPage() {
  const { legal, contact } = brand;
  return (
    <PolicyPage title="Política de privacidade" updatedAt="27/10/2026">
      <p>
        Esta política explica quais dados pessoais o site da {brand.name} trata, para quê e quais são os seus direitos,
        conforme a Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018).
      </p>

      <h2>Quem é o controlador</h2>
      <p>
        Razão social: <LegalValue value={legal.companyName} fallback="a ser informada antes do lançamento" />.
        <br />
        CNPJ: <LegalValue value={legal.cnpj} fallback="a ser informado antes do lançamento" />.
        <br />
        Contato para assuntos de privacidade:{" "}
        <LegalValue value={contact.email} fallback="canal em configuração (veja a página de atendimento)" />.
      </p>

      <h2>O que coletamos hoje</h2>
      <ul>
        <li>
          <strong>Navegação sem cadastro:</strong> você pode ver produtos, usar o guia e montar a sacola sem criar conta e
          sem informar dados pessoais.
        </li>
        <li>
          <strong>Sacola:</strong> fica guardada no seu próprio navegador (armazenamento local). Para mostrar os valores,
          enviamos à loja apenas os códigos dos produtos e as quantidades — nada que identifique você. Não guardamos a
          sacola nos nossos servidores.
        </li>
        <li>
          <strong>Registros técnicos:</strong> o provedor de hospedagem pode registrar dados técnicos de acesso, como
          endereço IP, data e hora, para segurança e funcionamento do site.
        </li>
        <li>
          <strong>Contato:</strong> se você falar com o atendimento, usamos os dados que enviar (como nome e telefone)
          apenas para responder ao seu pedido.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        O site não usa cookies de publicidade nem de análise de audiência. Cookies técnicos são usados somente na área
        administrativa, para manter a sessão da equipe da loja. Se ferramentas de análise forem adicionadas no futuro, só
        serão ativadas com o seu consentimento, quando a lei exigir.
      </p>

      <h2>Compartilhamento</h2>
      <p>
        Não vendemos dados pessoais. Usamos fornecedores de infraestrutura (hospedagem e banco de dados) que tratam dados
        em nosso nome, com medidas de segurança adequadas.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação e informações
        sobre compartilhamento, além de revogar consentimentos (art. 18 da LGPD). Também pode reclamar à Autoridade
        Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>Quando houver compra online</h2>
      <p>
        Para entregar pedidos, será preciso tratar dados como nome, CPF, endereço e contato. Dados de cartão serão
        processados diretamente pelo provedor de pagamento, sem serem armazenados pela {brand.name}. Esta política será
        atualizada antes dessa funcionalidade entrar no ar.
      </p>

      <p>
        Dúvidas? Fale com o <Link href="/atendimento">atendimento</Link>.
      </p>
    </PolicyPage>
  );
}

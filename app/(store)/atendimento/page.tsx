import type { Metadata } from "next";
import Link from "next/link";
import { brand, hasAnyContact, whatsappHref } from "@/config/brand";
import { STORE_FAQ } from "@/content/faq";
import { FaqList } from "@/components/ui/faq-list";
import { ChatIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = {
  title: "Atendimento",
  description: `Fale com a ${brand.name}: canais de atendimento e perguntas frequentes.`,
  alternates: { canonical: "/atendimento" },
};

export default function SupportPage() {
  const { contact } = brand;
  const wa = contact.whatsapp ? whatsappHref(contact.whatsapp) : null;

  return (
    <div className="container-page py-8 sm:py-10">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Atendimento</h1>
        <p className="mt-3 text-lg text-ink/85">
          Tire dúvidas sobre medidas, cores e disponibilidade. Enquanto a compra online não está ativa, é por aqui que
          você compra.
        </p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section aria-labelledby="canais-titulo" className="min-w-0">
          <h2 id="canais-titulo" className="mb-4 text-2xl font-bold">
            Canais
          </h2>
          {hasAnyContact() ? (
            <ul className="space-y-3">
              {wa ? (
                <li>
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-16 items-center gap-4 rounded-[1.25rem] border border-line bg-white p-4 hover:border-deep-fjord"
                  >
                    <ChatIcon className="h-6 w-6 text-air-blue-ink" />
                    <span>
                      <span className="block font-semibold text-deep-fjord">WhatsApp</span>
                      <span className="text-muted">{contact.whatsapp}</span>
                    </span>
                  </a>
                </li>
              ) : null}
              {contact.phone ? (
                <li>
                  <a
                    href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                    className="flex min-h-16 items-center gap-4 rounded-[1.25rem] border border-line bg-white p-4 hover:border-deep-fjord"
                  >
                    <span>
                      <span className="block font-semibold text-deep-fjord">Telefone</span>
                      <span className="text-muted">{contact.phone}</span>
                    </span>
                  </a>
                </li>
              ) : null}
              {contact.email ? (
                <li>
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex min-h-16 items-center gap-4 rounded-[1.25rem] border border-line bg-white p-4 hover:border-deep-fjord"
                  >
                    <span>
                      <span className="block font-semibold text-deep-fjord">E-mail</span>
                      <span className="text-muted">{contact.email}</span>
                    </span>
                  </a>
                </li>
              ) : null}
              {contact.hours ? <li className="text-muted">Horário: {contact.hours}</li> : null}
            </ul>
          ) : (
            <Notice tone="info" title="Canais de atendimento em configuração">
              Os contatos oficiais da {brand.name} ainda não foram publicados. Assim que estiverem confirmados, aparecem
              aqui e no rodapé do site.
            </Notice>
          )}

          <p className="mt-6 text-sm text-muted">
            Ao entrar em contato, usamos seus dados só para responder ao seu pedido. Veja a{" "}
            <Link href="/politicas/privacidade" className="link">
              política de privacidade
            </Link>
            .
          </p>
        </section>

        <section aria-labelledby="faq-atendimento-titulo" className="min-w-0">
          <h2 id="faq-atendimento-titulo" className="mb-4 text-2xl font-bold">
            Perguntas frequentes
          </h2>
          <FaqList items={STORE_FAQ} />
        </section>
      </div>
    </div>
  );
}

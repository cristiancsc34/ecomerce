import type { NotificationChannel, NotificationProvider, OutgoingMessage } from "./types";

/**
 * Provedores de envio. Por enquanto só o de TESTE (não envia nada): a
 * integração real (ex.: Resend/SES para e-mail, WhatsApp Cloud API/Twilio para
 * WhatsApp) entra quando o provedor for escolhido e as credenciais existirem.
 */
export function testProvider(channel: NotificationChannel): NotificationProvider & { sent: OutgoingMessage[] } {
  const sent: OutgoingMessage[] = [];
  return {
    channel,
    name: "teste",
    sent,
    async send(message) {
      sent.push(message);
      return { providerMessageId: `teste-${channel}-${sent.length}` };
    },
  };
}

/** Provedores reais configurados no ambiente. Hoje: nenhum (avisos ficam na fila). */
export function configuredProviders(): NotificationProvider[] {
  return [];
}

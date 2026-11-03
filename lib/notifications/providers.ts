import type { NotificationChannel, NotificationProvider, OutgoingMessage } from "./types";

/**
 * Provedores de envio. Só ligam com as chaves no servidor (variáveis de ambiente; nunca NEXT_PUBLIC_):
 *   E-mail:   RESEND_API_KEY + EMAIL_FROM (ex.: "Cuxões <pedidos@seudominio.com.br>", domínio verificado no Resend).
 *   WhatsApp: WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID (API oficial da Meta; modelos aprovados — docs/CHECKOUT.md).
 * Sem as chaves, nada é enviado (e o painel não deixa ligar os avisos automáticos).
 */

/** Provedor de TESTE: não envia nada, só guarda (testes automáticos). */
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

type Fetch = typeof fetch;

async function failure(res: Response, provider: string): Promise<Error> {
  const body = await res.text().catch(() => "");
  // Só o começo da resposta: o erro vai para a fila e para o painel, sem dados do cliente.
  return new Error(`${provider} respondeu ${res.status}: ${body.replace(/\s+/g, " ").slice(0, 160)}`);
}

/** E-mail pelo Resend (https://resend.com/docs/api-reference/emails/send-email). */
export function resendProvider(apiKey: string, from: string, fetchImpl: Fetch = fetch): NotificationProvider {
  return {
    channel: "email",
    name: "resend",
    async send(message) {
      if (!message.email) throw new Error("mensagem de e-mail sem assunto/HTML");
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // O mesmo aviso nunca sai duas vezes, mesmo se a fila tentar de novo depois de uma queda.
          ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey.slice(0, 256) } : {}),
        },
        body: JSON.stringify({ from, to: [message.to], subject: message.email.subject, html: message.email.html, text: message.text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw await failure(res, "Resend");
      const data = (await res.json()) as { id?: string };
      return { providerMessageId: data.id ?? "resend" };
    },
  };
}

/**
 * WhatsApp pela API oficial da Meta (Cloud API). Avisos que a loja inicia só podem usar MODELOS aprovados pela
 * Meta: o nome do modelo é o evento (ex.: pedido_pago) e o texto tem 3 campos: {{1}} nome, {{2}} pedido, {{3}} link.
 */
export function whatsappCloudProvider(
  token: string,
  phoneNumberId: string,
  apiVersion = "v23.0",
  fetchImpl: Fetch = fetch,
): NotificationProvider {
  return {
    channel: "whatsapp",
    name: "whatsapp-cloud",
    async send(message) {
      if (!message.template) throw new Error("aviso de WhatsApp sem modelo");
      const res = await fetchImpl(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: message.to,
          type: "template",
          template: {
            name: message.template.name,
            language: { code: message.template.language },
            components: [{ type: "body", parameters: message.template.params.map((text) => ({ type: "text", text })) }],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw await failure(res, "WhatsApp");
      const data = (await res.json()) as { messages?: { id?: string }[] };
      return { providerMessageId: data.messages?.[0]?.id ?? "whatsapp" };
    },
  };
}

/** Que canais têm provedor configurado (o painel mostra; sem isso não deixa ligar o aviso automático). */
export function providerStatus(env: Record<string, string | undefined> = process.env): Record<NotificationChannel, boolean> {
  return {
    email: Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim()),
    whatsapp: Boolean(env.WHATSAPP_TOKEN?.trim() && env.WHATSAPP_PHONE_NUMBER_ID?.trim()),
  };
}

/** Provedores reais configurados no ambiente. */
export function configuredProviders(env: Record<string, string | undefined> = process.env): NotificationProvider[] {
  const ready = providerStatus(env);
  const list: NotificationProvider[] = [];
  if (ready.email) list.push(resendProvider(env.RESEND_API_KEY!.trim(), env.EMAIL_FROM!.trim()));
  if (ready.whatsapp) {
    list.push(whatsappCloudProvider(env.WHATSAPP_TOKEN!.trim(), env.WHATSAPP_PHONE_NUMBER_ID!.trim(), env.WHATSAPP_API_VERSION?.trim() || undefined));
  }
  return list;
}

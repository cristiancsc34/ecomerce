import "server-only";
import { brand, whatsappHref } from "@/config/brand";

/**
 * O assistente só aparece com a chave da Anthropic no servidor
 * (ANTHROPIC_API_KEY, nunca NEXT_PUBLIC_*). ASSISTANT_ENABLED=false desliga.
 */
export function assistantEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim()) && process.env.ASSISTANT_ENABLED?.trim() !== "false";
}

/** Para onde mandar quem quer falar com uma pessoa: WhatsApp se configurado, senão a página. */
export function supportUrl(): string {
  return (brand.contact.whatsapp ? whatsappHref(brand.contact.whatsapp) : null) ?? "/atendimento";
}

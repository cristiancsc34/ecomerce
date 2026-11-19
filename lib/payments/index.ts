import "server-only";
import type { SitePaymentMethod } from "@/lib/validation/checkout";

/**
 * Pagamento online (checkout transparente: Pix, cartão e boleto).
 *
 * O banco escolhido é o Blue (Rio de Janeiro), ainda em negociação. Enquanto a API dele não for entregue, nenhum
 * provedor está ligado: o cliente escolhe a forma de pagamento no site, o pedido entra como "recebido" e a loja envia a
 * cobrança e confirma o pagamento pelo painel. Nada aqui simula cobrança ou inventa a API do banco.
 *
 * Para ligar o Blue (quando a documentação chegar):
 *   1. implementar `PaymentProvider` em lib/payments/blue.ts com as chamadas reais da API;
 *   2. configurar na Vercel, só no servidor: PAYMENT_PROVIDER=blue e as chaves do banco (PAYMENT_BLUE_*), mais
 *      PAYMENT_WEBHOOK_SECRET para conferir a assinatura do aviso de pagamento;
 *   3. a confirmação do pedido acontece SÓ pelo aviso assinado do banco (/api/pagamentos/aviso), nunca pelo retorno
 *      do navegador. Ver docs/PAGAMENTO.md.
 */

export type PaymentProviderId = "blue";

/** Cobrança criada no banco para um pedido. Dados do cartão nunca passam pelo nosso servidor (tokenização do banco). */
export type PaymentCharge = {
  providerChargeId: string;
  method: SitePaymentMethod;
  amountCents: number;
  /** Pix: código copia e cola e imagem do QR. */
  pix?: { copyPaste: string; qrCodeUrl: string | null; expiresAt: string | null };
  /** Boleto: linha digitável e PDF. */
  boleto?: { digitableLine: string; pdfUrl: string; dueDate: string };
  /** Cartão: página segura do banco ou dados para o formulário tokenizado. */
  card?: { redirectUrl: string | null };
};

export type PaymentProvider = {
  id: PaymentProviderId;
  createCharge(input: {
    orderCode: string;
    method: SitePaymentMethod;
    amountCents: number;
    customer: { name: string; phone: string; email: string | null };
  }): Promise<PaymentCharge>;
  /** Confere a assinatura do aviso do banco e devolve o que mudou. Lança erro se a assinatura não bater. */
  parseWebhook(rawBody: string, headers: Headers): Promise<{ providerChargeId: string; orderCode: string; status: "paid" | "failed" | "refunded" }>;
};

/** Provedor configurado na Vercel, ou null (pagamento confirmado pela loja, sem cobrança online). */
export function configuredPaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProviderId | null {
  const id = env.PAYMENT_PROVIDER?.trim().toLowerCase();
  if (id === "blue" && env.PAYMENT_WEBHOOK_SECRET?.trim()) return "blue";
  return null;
}

/** O site cobra online? Hoje: não (o Blue ainda não entregou a API). */
export function isOnlinePaymentEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // Só liga quando existir a implementação real do provedor (lib/payments/blue.ts).
  return configuredPaymentProvider(env) !== null && BLUE_IMPLEMENTED;
}

/** Vira true quando lib/payments/blue.ts tiver as chamadas reais da API do Blue. */
const BLUE_IMPLEMENTED = false;

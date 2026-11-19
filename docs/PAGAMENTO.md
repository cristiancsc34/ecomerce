# Pagamento: Pix, cartão e boleto (banco Blue)

**Estado (19/11/2026):** o cliente já escolhe **Pix, cartão ou boleto** no fechamento do pedido (`/finalizar`) e a
escolha fica gravada no pedido (painel → Pedidos). **Nada é cobrado online ainda:** o banco escolhido, o **Blue**
(Rio de Janeiro), está em negociação e a API dele não foi entregue. Até lá, a loja envia a cobrança pela forma escolhida
e marca **Confirmar pagamento** no painel.

## O que já está pronto (engatilhado)

| Peça | Onde | O que faz |
| --- | --- | --- |
| Escolha da forma de pagamento | `components/checkout/checkout-view.tsx`, `lib/validation/checkout.ts` | Pix, cartão ou boleto; obrigatório |
| Gravação no pedido | `supabase/migrations/20261119000100_frete_e_pagamento_no_checkout.sql` | `payment_method` do pedido, conferido no banco |
| Contrato do provedor | `lib/payments/index.ts` | O que o Blue precisa oferecer: criar cobrança (Pix copia e cola, boleto, cartão tokenizado) e aviso assinado |
| Aviso de pagamento (webhook) | `app/api/pagamentos/aviso/route.ts` | **Fechado** (responde 503) até o provedor existir |

## Para ligar o Blue (quando a documentação da API chegar)

1. Implementar `PaymentProvider` em `lib/payments/blue.ts` com as chamadas **reais** da API (nada inventado).
2. Na Vercel, só no servidor (nunca `NEXT_PUBLIC_`): `PAYMENT_PROVIDER=blue`, as chaves do banco (`PAYMENT_BLUE_*`) e
   `PAYMENT_WEBHOOK_SECRET`.
3. O pedido só vira **Pago** pelo aviso **assinado** do banco, com proteção contra aviso repetido. O retorno do
   navegador nunca confirma pagamento.
4. Dados de cartão nunca passam pelo nosso servidor: usar a tokenização/página segura do banco.
5. Testar: pagamento aprovado, recusado, expirado (Pix e boleto), estorno e banco fora do ar.

## Perguntas para o Blue

- Tem API de cobrança para Pix (QR dinâmico), boleto registrado e cartão de crédito (com parcelamento)?
- Como é a tokenização do cartão (SDK no navegador ou página do banco)?
- Envia aviso de pagamento (webhook)? Como é a assinatura?
- Tem ambiente de testes (sandbox)? Quais são as tarifas por Pix, boleto e cartão?

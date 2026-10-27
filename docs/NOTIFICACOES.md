# Avisos de pedido por WhatsApp e e-mail (estrutura)

**Estado:** a estrutura está pronta e testada; **nenhuma mensagem real é enviada** ainda. Falta (1) o checkout com
pagamento confirmado por webhook e (2) escolher os provedores — opções e preços abaixo para comparar.

## Fluxo

```
Pagamento confirmado (webhook VERIFICADO do provedor de pagamento)
   └─▶ servidor grava o pedido e chama planOrderNotifications("pedido_confirmado", pedido)
         └─▶ 1 linha por canal em notification_outbox (idempotente: webhook repetido não duplica)
               └─▶ processador (cron a cada minuto) chama claim_notifications(20)
                     └─▶ dispatchClaimed(linhas, provedores) envia e devolve o que gravar:
                           enviado │ nova tentativa (1 min, 5 min, 30 min, 2 h) │ falha após 5 tentativas
```

Eventos previstos: `pedido_confirmado`, `pedido_enviado` (com link de rastreio, se houver) e `pedido_entregue`.

## O que já existe

| Peça | Arquivo |
| --- | --- |
| Tipos (pedido, mensagem, provedor) | `lib/notifications/types.ts` |
| Textos em português (e-mail texto + HTML, WhatsApp com modelo) | `lib/notifications/templates.ts` |
| Fila: plano idempotente + envio com novas tentativas | `lib/notifications/outbox.ts` |
| Provedor de teste (não envia nada) | `lib/notifications/providers.ts` |
| Tabela `notification_outbox` + `claim_notifications()` | `supabase/migrations/20261029000100_notification_outbox.sql` |
| Testes | `tests/unit/notifications.test.ts`, `tests/db/notifications.test.ts` |

Regras já aplicadas:

- **Sem inventar:** a mensagem só cita itens, valores e código do pedido. Frete só aparece se informado; prazo de
  entrega nunca é prometido; rastreio só com link `https`.
- **WhatsApp só com consentimento** marcado no checkout (`whatsappOptIn`) e número válido com DDI. E-mail só se válido.
- **Segurança:** HTML do e-mail escapado; a tabela só é acessível pela chave de serviço (RLS ligado, sem políticas;
  visitante e equipe logada recebem “permissão negada”).
- **LGPD:** a fila guarda contato do cliente — apagar avisos enviados após 90 dias (tarefa do processador).

Exemplo do aviso de pedido confirmado:

> Olá, Maria!
> Pagamento confirmado! Recebemos o seu pedido CX-1042.
>
> 1× Poltrona Azul Estrutura Clara — R$ 1.299,90
> Total: R$ 1.299,90
>
> Qualquer dúvida, é só responder esta mensagem. Obrigado por comprar na Cuxões!

## Opções de provedor (para escolher)

Preços pesquisados em 27/10/2026 em fontes secundárias — **confirmar na página oficial antes de contratar**.

### WhatsApp

| Opção | Como cobra | Prós | Contras |
| --- | --- | --- | --- |
| **API oficial da Meta (WhatsApp Cloud API)** — direto ou via parceiro (Twilio, Zenvia, Take Blip…) | Por mensagem de modelo entregue; “utilidade” (aviso de pedido) fica por volta de **R$ 0,04–0,08** por mensagem no Brasil; cobrança em reais desde 2026 | Oficial, número verificado, sem risco de bloqueio por uso indevido | Cada modelo de mensagem precisa ser aprovado pela Meta; cadastro da empresa no Meta Business |
| API não oficial (ex.: Z-API, que conecta o WhatsApp Web) | Fixo, ~**R$ 97–99/mês** por número, mensagens ilimitadas | Simples de começar | Fora das regras do WhatsApp: risco de o número ser bloqueado; sem selo verificado. **Não recomendado** para avisos de compra |

**Recomendação:** API oficial (Cloud API). Com poucos pedidos, o custo é de centavos por aviso.

### E-mail

| Opção | Como cobra | Observação |
| --- | --- | --- |
| **Resend** | Grátis até **3.000 e-mails/mês (100/dia)**; Pro **US$ 20/mês** para 50 mil | Simples de integrar; exige verificar o domínio (SPF/DKIM) |
| Amazon SES | Por e-mail enviado, muito barato em volume | Mais configuração (conta AWS, sair do “sandbox”) |

**Recomendação:** Resend no começo (o plano grátis cobre o início da loja).

## O que falta para ligar

1. Checkout com pagamento (Pix/cartão) e **webhook verificado** gravando o pedido.
2. Checkbox no checkout: “Quero receber atualizações do pedido pelo WhatsApp”.
3. Escolher os provedores; criar as contas; aprovar os modelos `pedido_confirmado`, `pedido_enviado` e
   `pedido_entregue` (pt_BR) na Meta; verificar o domínio de e-mail.
4. Implementar o provedor real em `lib/notifications/providers.ts` (`configuredProviders()`), com as chaves só no
   servidor, e o processador (cron) que chama `claim_notifications` → `dispatchClaimed` → grava o resultado.

Fontes de preço: [Meta — preços da plataforma WhatsApp Business](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing),
[Kommo — novas regras de cobrança](https://support.kommo.com/docs/updated-pricing-rules-for-whatsapp-business.md),
[MessageCentral — preços no Brasil](https://www.messagecentral.com/blog/whatsapp-business-api-pricing-brazil),
[Hyperleap — calculadora Brasil 2026](https://hyperleap.ai/whatsapp-pricing-calculator-brazil),
[Cupom Online — comparativo de APIs](https://cupomonline.com.br/melhores-api-whatsapp/),
[Costbench — plano grátis da Resend](https://costbench.com/software/email-api/resend/free-plan/),
[UseCarly — preços da Resend 2026](https://www.usecarly.com/blog/resend-pricing/).

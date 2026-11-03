# Frete por região e avisos automáticos

**Estado (03/11/2026):** pronto e testado, **desligado** até o dono configurar. Complementa a logística
([`LOGISTICA.md`](LOGISTICA.md)) e o pedido feito pelo site ([`FLUXO-DE-COMPRA.md`](FLUXO-DE-COMPRA.md)).

## Frete por região (painel → Entrega e avisos)

Cada **forma de entrega** tem:

- **nome** que o cliente vê e **tipo** (entrega da loja, transportadora ou retirada);
- **CEPs atendidos**, uma faixa por linha: `88000-000 a 88139-999`, um CEP, ou o começo do CEP (ex.: `88`);
- **valor** (vazio = “a combinar”; 0 = grátis) e **prazo** em dias úteis após o pagamento (vazio = não promete prazo);
- **detalhes** (na retirada: endereço e horário) e se está **ativa**.

Só administradores mudam. O público não lê a tabela: consulta pela função `shipping_options_for(cep)`, que devolve as
formas ativas que atendem aquele CEP (a retirada aparece para qualquer CEP). CEP fora de todas as regiões = frete a
combinar, nunca um valor inventado.

**Para o checkout (`/finalizar`):** `lib/shipping/quote.ts`

- `shippingOptionsForCep(cep)` → lista para o cliente escolher (nome, valor ou `null` = a combinar, prazo, detalhes);
- `quoteShipping(cep)` → a entrega mais barata que atende o CEP (`{ optionId, label, cents, prazoDias }`) ou `null`.

O checkout e a função do pedido (`place_site_order`) são da sessão do checkout; ligar o frete neles é o próximo passo
combinado entre as duas.

## Avisos automáticos (e-mail e WhatsApp)

Cada etapa nova do pedido (do site **ou** do painel) entra na fila `notification_outbox` — **só** se o dono ligou o
canal em **Entrega e avisos**, e no WhatsApp **só** com o aceite do cliente. O texto é montado na hora do envio com os dados
atuais do pedido e o link de acompanhamento. Envio logo após cada mudança e, para novas tentativas (1 min, 5 min, 30
min, 2 h; depois de 5, falha), pela rota `/api/avisos` (agendada em `vercel.json`, uma vez por dia no plano gratuito).
Cada pedido mostra no painel o que foi avisado.

O painel só deixa ligar um canal com as chaves configuradas na Vercel (sempre só no servidor, nunca `NEXT_PUBLIC_`):

| Canal | Variáveis | Observação |
| --- | --- | --- |
| E-mail ([Resend](https://resend.com)) | `RESEND_API_KEY`, `EMAIL_FROM` (ex.: `Cuxões <pedidos@seudominio.com.br>`) | Verificar o domínio no Resend (SPF/DKIM). Grátis até 3.000/mês |
| WhatsApp ([Cloud API da Meta](https://developers.facebook.com/docs/whatsapp/cloud-api)) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, opcional `WHATSAPP_API_VERSION` (padrão `v23.0`) | Número verificado no Meta Business e **modelos aprovados** (abaixo) |
| Rota agendada | `CRON_SECRET` | Sem ela, `/api/avisos` fica fechada (os avisos ainda saem logo após cada etapa) |

### Modelos de WhatsApp para aprovar na Meta (categoria “Utilidade”, idioma pt_BR)

Avisos iniciados pela loja só podem usar modelos aprovados. O nome do modelo é o da etapa; o texto tem 3 campos:
`{{1}}` primeiro nome, `{{2}}` número do pedido, `{{3}}` link de acompanhamento. Sugestão de texto:

| Modelo | Texto |
| --- | --- |
| `pedido_recebido` | Olá, {{1}}! Recebemos o seu pedido {{2}}. Acompanhe e veja como pagar: {{3}} |
| `pedido_pago` | Olá, {{1}}! Pagamento confirmado: o pedido {{2}} entrou na fila de preparação. {{3}} |
| `pedido_em_preparacao` | Olá, {{1}}! O pedido {{2}} está sendo preparado. Acompanhe: {{3}} |
| `pedido_enviado` | Olá, {{1}}! O pedido {{2}} foi enviado ou está com a entrega agendada. Detalhes: {{3}} |
| `pedido_saiu_para_entrega` | Olá, {{1}}! O pedido {{2}} saiu para entrega hoje. Deixe alguém para receber. {{3}} |
| `pedido_entregue` | Olá, {{1}}! O pedido {{2}} foi entregue. Algo diferente do combinado? Responda com fotos. {{3}} |
| `pedido_cancelado` | Olá, {{1}}! O pedido {{2}} foi cancelado. Dúvidas? Responda esta mensagem. {{3}} |
| `pedido_devolucao_solicitada` | Olá, {{1}}! Recebemos o pedido de troca/devolução do pedido {{2}}. {{3}} |
| `pedido_devolvido` | Olá, {{1}}! A devolução do pedido {{2}} foi concluída. {{3}} |

Enquanto o WhatsApp oficial não estiver ligado, a equipe continua avisando com um toque (“Abrir no WhatsApp” em cada
pedido).

## Código

| Peça | Arquivo |
| --- | --- |
| Banco: formas de entrega, avisos ligados, fila por etapa | `supabase/migrations/20261103000300_shipping_notifications.sql` |
| Frete: tipos, faixas, consulta por CEP | `lib/shipping/types.ts`, `lib/shipping/ranges.ts`, `lib/shipping/quote.ts` |
| Avisos | `lib/notifications/order-dispatch.ts`, `lib/notifications/providers.ts`, `app/api/avisos/route.ts`, `vercel.json` |
| Painel | `app/admin/(painel)/entrega/`, `components/admin/shipping-settings.tsx`, `components/admin/order-notifications.tsx`, `lib/admin/shipping.ts`, `lib/admin/actions/shipping.ts` |
| Testes | `tests/db/shipping-notifications.test.ts`, `tests/unit/shipping-notifications.test.ts`, `tests/e2e-supabase/shipping.spec.ts` |

## Para colocar no ar

1. Aplicar `supabase/migrations/20261103000300_shipping_notifications.sql` no Supabase do projeto (com o ok do dono).
2. Publicar. Nada muda para o cliente até o dono cadastrar as regiões e ligar os avisos.

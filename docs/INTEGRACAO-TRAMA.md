# Fábrica e logística: integração com o Trama

**Estado (04/11/2026):** pronta e testada, inclusive contra o Trama rodando de verdade (pedido com estoque reservado e
em rota; pedido sem estoque com a ordem de produção aceita pela fábrica; cancelamentos). Liga com três variáveis.

O **Trama** é a plataforma da operação (repositório `angelo-dashboar-`): pedidos, fábrica parceira (ordens de produção),
estoque com etiqueta, expedição, rotas, app do entregador, acerto de caixa e CRM. A loja continua sendo onde o cliente
compra e acompanha o pedido; o Trama é onde o pedido é produzido, separado e entregue.

## Como o pedido anda

```
CLIENTE                        LOJA (Cuxões)                                 TRAMA (fábrica e logística)
───────                        ─────────────                                 ───────────────────────────
Compra no site ──────────────▶ Pedido "Recebido"
(ou pelo WhatsApp)             (fica na loja até a equipe confirmar)
                               Equipe: "Confirmar pagamento"
                               ou "Preparar sem pagamento"
                                 └─ fila order_integration ── POST /pedidos ─▶ Tem unidade livre no estoque?
                                                                               ├─ sim → reserva → Expedição
                                                                               │        (pronto para envio)
                                                                               └─ não → ordem de produção
                                                                                        → Fábrica aceita e produz
                                                                                        → chega ao CD (etiqueta)
                                                                               Expedição agenda data e período
                                                                               Rota sai, entregador entrega
Página do pedido ◀──────────── etapas aplicadas ◀── webhook + GET /pedidos ── cada mudança de etapa
e avisos (WhatsApp/e-mail)
```

**Por que só depois de confirmado:** um pedido "recebido" ainda não teve pagamento nem entrega combinados. Mandar para
a fábrica nessa hora faria produzir o que talvez nunca seja pago. Quando a loja tiver pagamento online, o próprio
pagamento confirmado move o pedido e ele segue sozinho.

## O que o cliente vê

A mesma página de acompanhamento e os mesmos avisos de sempre (a voz é da loja). As etapas vêm do Trama:

| No Trama | Na loja (etapa e recado ao cliente) |
| --- | --- |
| confirmado | sem mudança (aguardando a fábrica ou a reserva) |
| em produção | **Em preparação** · "Seu pedido entrou em produção na fábrica." |
| pronto para envio | **Em preparação** · "Seu pedido está pronto. Vamos combinar a data da entrega com você." (retirada: "pronto para retirar na loja") |
| entrega agendada | **Enviado**, com a data e o período (manhã, tarde, horário comercial) |
| em rota | **Saiu para entrega** |
| entrega não realizada | volta para **Enviado**, sem data · "Não foi possível entregar na data combinada…" |
| entregue | **Entregue** (o pagamento na entrega também marca o pedido como pago) |
| cancelado / devolvido | **Cancelado** / **Devolvido** |

Nada é inventado: a previsão que o Trama calcula fica só no painel da equipe; o cliente vê a data quando a entrega é
agendada. Na linha do tempo do painel, essas etapas aparecem com a nota interna "Atualizado pelo Trama".

**Avisos em dobro:** no Trama, marque **"O site avisa o cliente"** na integração. Assim só a loja manda WhatsApp e
e-mail ao cliente; o Trama continua avisando a equipe dele (sino).

## O que a equipe da loja vê (painel → Pedidos → pedido)

Cartão **Fábrica e logística**:

- *na fila / enviando*: vai sozinho; falha passageira (rede, Trama fora do ar) tenta de novo em 1 min, 5 min, 30 min,
  2 h e 12 h;
- *Pedido no Trama nº …*, a etapa lá, a situação do pagamento lá e a previsão; **Conferir agora** lê a etapa na hora;
- *precisa de atenção*: o Trama recusou (SKU que não existe lá, preço diferente do catálogo de lá, chave errada) ou faltou
  algo (item sem SKU, endereço incompleto). Corrija e use **Enviar de novo**;
- *não enviado*: pedido cancelado antes de ir, ou que já tinha passado da preparação quando a integração foi ligada;
- **cancelamento**: cancelar na loja um pedido que já está no Trama pede o cancelamento lá. Se a fábrica já aceitou a OP
  ou o pedido está a caminho, o Trama recusa e o cartão avisa para resolver lá (**Pedir o cancelamento de novo** repete).

## Regras que valem sempre

- **SKU e preço iguais nos dois catálogos.** Cada produto (ou variação) da loja precisa do mesmo SKU cadastrado no Trama,
  com o mesmo preço. Variação sem SKU própria (ex.: cor escolhida) vai pelo SKU do produto e chega à fábrica como
  "Variação escolhida: …". Diferença de preço volta como erro (`preco_divergente`) no cartão do pedido.
- **Pagamento.** Confirmado pela equipe (Pix, cartão, link) chega ao Trama como pago (`id_transacao_gateway =
  loja:PED-…`, forma real nas observações); "preparar sem pagamento" chega como pagamento na entrega, que o entregador
  do Trama cobra.
- **Frete "a combinar"** vai como 0; o acesso para a entrega (andar, escada, elevador) e a montagem vão nas observações do
  pedido no Trama (que não chegam à fábrica).
- **Transportadora.** O Trama entrega com a própria frota; o pedido com "transportadora" vai como entrega, com a forma
  anotada nas observações.
- **Segurança.** Chave e segredo só no servidor (nunca `NEXT_PUBLIC_`). O webhook confere a assinatura HMAC do corpo cru
  em tempo constante e ignora entregas repetidas (`X-Trama-Entrega`); a etapa é lida de novo pela API, então um webhook
  fora de ordem não volta o pedido para trás. Só o servidor (chave de serviço) escreve na fila e aplica etapas; a equipe
  só lê e pede reenvio.

## Como ligar

1. **No Trama** (dono): Configurações → Integrações → **Nova integração**. Loja que recebe: **Site**. Endereço dos avisos:
   `https://<site da loja>/api/trama/webhook`. Marque **O site avisa o cliente**. Copie a chave e o segredo (aparecem uma
   vez só).
2. **No Trama**, cadastre (ou confira) os produtos com os mesmos SKUs e preços da loja.
3. **Na Vercel da loja** (variáveis do servidor, marcadas como *Sensitive*):
   `TRAMA_API_URL` (endereço do Trama, sem `/api/v1`), `TRAMA_API_KEY` (chave), `TRAMA_WEBHOOK_SEGREDO` (segredo) e,
   se ainda não tiver, `CRON_SECRET`. Faça um novo deploy.
4. Aplique a migração `supabase/migrations/20261104000100_integracao_trama.sql` no Supabase da loja.
5. Teste com um pedido: confirme o pagamento no painel e veja o cartão **Fábrica e logística** mostrar o número no Trama.

Ao ligar, pedidos já confirmados que estavam na fila vão para o Trama; os que já passaram da preparação ficam como "não
enviado" (a loja já cuidou deles).

## Código

| Peça | Arquivo |
| --- | --- |
| Banco: fila, recibos de webhook, etapas vindas do Trama (`trama_apply`), reenvio | `supabase/migrations/20261104000100_integracao_trama.sql` |
| Contrato da API do Trama (tipos e validação) | `lib/trama/contrato.ts` |
| Regras puras: pedido → Trama, etapa do Trama → loja, novas tentativas | `lib/trama/mapear.ts` |
| Chamadas à API (classificadas em ok / corrigir / repetir) | `lib/trama/cliente.ts` |
| Envio da fila, cancelamento, conferência e disparo depois de cada mudança | `lib/trama/sincronizar.ts` |
| Webhook (assinatura, repetidos) e rota agendada | `app/api/trama/webhook/route.ts`, `app/api/trama/sincronizar/route.ts`, `vercel.json` |
| Painel: cartão e ações | `components/admin/order-trama.tsx`, `lib/admin/trama.ts`, `lib/admin/actions/orders.ts` |
| Testes | `tests/unit/trama.test.ts`, `tests/db/integracao-trama.test.ts`, `tests/integration/trama.test.ts` (opcional, contra um Trama local) |

### Testar contra um Trama local

No repositório do Trama: `pnpm db:reset && pnpm dev` e crie uma integração (Configurações → Integrações, como dono).
Na loja:

```bash
TRAMA_INTEGRATION=1 TRAMA_API_URL=http://localhost:3000 TRAMA_API_KEY=trm_live_... npx vitest run tests/integration/trama.test.ts
```

O teste usa os SKUs e preços do seed do Trama e cria pedidos de verdade lá: nunca aponte para o Trama de produção.

## Próximos passos sugeridos

1. Mostrar "pronta entrega" ou "sob encomenda" na página do produto pelo `GET /api/v1/disponibilidade` do Trama.
2. Conferir os SKUs e preços da loja contra o `GET /api/v1/catalogo` do Trama num botão do painel, antes de vender.
3. Com pagamento online, o pagamento confirmado pelo provedor manda o pedido ao Trama sem passar pela equipe.

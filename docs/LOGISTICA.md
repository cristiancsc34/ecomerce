# Logística pós-compra: do pedido à entrega

**Estado (03/11/2026):** a base está pronta e testada, e funciona sem contratar nada. A equipe registra o pedido fechado
pelo atendimento, avança cada etapa no painel, avisa o cliente no WhatsApp com um toque e o cliente acompanha numa
página própria. Frete automático, pagamento online e avisos automáticos dependem de decisões do dono (fim deste
documento).

> **Com o Trama ligado** ([`INTEGRACAO-TRAMA.md`](INTEGRACAO-TRAMA.md)), a partir do pagamento confirmado (ou "preparar
> sem pagamento") o pedido vai para a fábrica e a logística do Trama, e as etapas seguintes (preparação, entrega agendada,
> saiu para entrega, entregue) passam a vir de lá sozinhas. Os botões abaixo continuam funcionando para os pedidos que a
> loja entrega por conta própria.

## O caminho do pedido

```
Venda fechada (WhatsApp, telefone, loja)
  └─▶ Painel → Pedidos → Novo pedido ............................ Pedido recebido
        └─▶ pagamento confirmado (Pix, link, cartão) .......... Pagamento confirmado
              └─▶ separar, embalar ou produzir ................. Em preparação
                    ├─▶ transportadora (código/link de rastreio) ┐
                    ├─▶ entrega da loja (data + período) ........ ├ Enviado
                    │      └─▶ no dia ........................... │ Saiu para entrega
                    │            └─▶ não deu? volta para Enviado (reagendar)
                    └─▶ retirada na loja ......................... (direto para Entregue)
                          └─▶ ................................... Entregue
                                └─▶ cliente pediu troca ......... Troca ou devolução solicitada
                                      └─▶ ........................ Devolvido (ou volta para Entregue)
Em qualquer etapa antes da entrega: Cancelado.
```

A ordem é garantida pelo banco: não dá para pular de “recebido” para “entregue”, nem reabrir um pedido cancelado.

## O que a equipe faz (painel → Pedidos)

1. **Novo pedido:** cliente (nome, celular, e-mail opcional, aceite de avisos pelo WhatsApp), itens do catálogo (o preço
   vem do catálogo quando já está confirmado; pode ser ajustado ao preço combinado) ou item avulso, forma de entrega,
   endereço (o CEP preenche rua, bairro, cidade e UF), **acesso para a entrega** (andar, elevador, escada, largura da
   porta, portaria), montagem, frete (vazio = “a combinar”), desconto e forma de pagamento.
2. **Próximo passo:** botões conforme a etapa e a forma de entrega (ex.: “Confirmar pagamento”, “Agendar a entrega”,
   “Entregar à transportadora”, “Saiu para entrega”, “Marcar como entregue”, “Cliente retirou”). Ao agendar, informe a
   data e o período combinados; na transportadora, o nome, o código e o link de rastreio. Há um **recado para o
   cliente** (aparece para ele) e uma **nota interna** (só a equipe).
3. **Avisar o cliente:** a mensagem da etapa atual fica pronta, com o link de acompanhamento. **Abrir no WhatsApp** abre a
   conversa com o texto preenchido; ou **Copiar mensagem**.
4. **Linha do tempo:** cada etapa com data, hora e recados. Não se edita nem se apaga.
5. Os dados do pedido podem ser corrigidos em “Editar dados do pedido”; os itens só até a preparação.

## O que o cliente vê

- **Link do pedido** (vai em toda mensagem): `/pedido/PED-1001?t=…`. Sem login.
- **Acompanhar pedido** (rodapé da loja, `/conta`): número do pedido + celular usado na compra.
- A página mostra as etapas com ✓, a etapa atual explicada, a data e o período combinados (ou transportadora e
  rastreio), se tem montagem, o histórico com os recados, os itens e os valores, dicas para o dia da entrega e o
  contato da loja.
- **Privacidade:** a página mostra só bairro, cidade e UF; nunca o endereço completo, o celular, as notas internas nem
  quem registrou. Sem o link secreto (ou sem o celular certo), não mostra nada. A consulta pelo celular tem limite de
  tentativas.

## Regras que valem sempre

- **Nada inventado:** a mensagem e a página só citam o que a equipe registrou. Prazo, só a data que a equipe agendou.
  Frete vazio aparece como “a combinar”.
- **Rastreio só com link https.**
- **Valores recalculados no banco** (itens + frete − desconto); desconto maior que o pedido é recusado.
- **WhatsApp só com aceite do cliente:** o painel avisa quando o cliente não marcou que aceita avisos.

## Código

| Peça | Arquivo |
| --- | --- |
| Banco: pedidos, itens, linha do tempo, regras de acesso, ordem das etapas, acompanhamento | `supabase/migrations/20261103000100_orders.sql` |
| Etapas, textos e próximos passos | `lib/orders/status.ts` |
| Mensagens de WhatsApp | `lib/orders/messages.ts` |
| Validação do pedido | `lib/validation/order.ts` |
| Painel: leituras e ações (inclui busca de CEP no ViaCEP) | `lib/admin/orders.ts`, `lib/admin/actions/orders.ts` |
| Painel: telas | `app/admin/(painel)/pedidos/`, `components/admin/order-form.tsx`, `order-steps.tsx` |
| Loja: acompanhamento | `app/(store)/pedido/[codigo]/`, `app/(store)/conta/`, `components/orders/`, `lib/orders/tracking.ts` |
| Testes | `tests/db/orders.test.ts` (acesso, etapas, privacidade), `tests/unit/orders.test.ts` |

## Decisões do dono (com opções)

Pesquisa de mercado feita em 03/11/2026, com as fontes nos links. **Confirme preços e condições na página oficial
antes de contratar.**

### 1. Como cobrar o frete e quem entrega

Correios, Loggi, Total Express e Azul Cargo **não levam colchão em tamanho real** e só levam poltrona se a embalagem
couber nos limites (Correios: 100 cm no maior lado, soma 200 cm, 30 kg —
[Correios](https://www.correios.com.br/enviar/encomendas/saiba-mais-nacional)). Para móveis, as opções reais são:

| Opção | Como funciona | Bom para |
| --- | --- | --- |
| **A. Entrega própria por região** (recomendado para começar) | Tabela de valor e prazo por bairro/cidade ou faixa de CEP, que a loja define. Lojas como Nuvemshop e Shopify oferecem exatamente isso | Loja que entrega na própria cidade ou região |
| B. Transportadora de carga fracionada (ex.: Braspress, Jadlog, Patrus) | Cotação por pedido, contrato com CNPJ. A Braspress tem API de cotação e rastreio só para clientes cadastrados ([Braspress](https://api.braspress.com/home)) | Entregas fora da região |
| C. Plataforma de cotação (ex.: Frenet: plano grátis; Profissional R$ 85/mês aceita contrato e logística própria — [Frenet](https://frenet.com.br/planos-e-precos/)) | Cotação automática no site com várias transportadoras | Quando o volume crescer |

**Próximo passo sugerido:** o dono define as regiões atendidas, o valor e o prazo de cada uma. Com isso, a loja mostra
“Entregamos no seu CEP: R$ X, em até N dias úteis” na página do produto e na sacola, e o valor já entra no pedido.

### 2. Entrega agendada e montagem

Referências: a Tok&Stok agenda por **período** (manhã/tarde) e monta no mesmo dia, cobrando à parte; a Mobly agenda
em parte das regiões e terceiriza a montagem; a MadeiraMadeira não agenda
([Tok&Stok](https://atendimento.tokstok.com.br/articles/5PsN93Df27onq3Wpsj4kV2-Entrega-com-data-agendada),
[Mobly](https://atendimento.mobly.com.br/?post_type=entrega),
[MadeiraMadeira](https://ajuda.madeiramadeira.com.br/hc/pt-br/articles/36477627026843-Posso-agendar-a-entrega)).
O painel já registra data, período e montagem. **Decidir:** a loja monta? Cobra à parte ou está incluída? Até que
andar sobe pela escada?

### 3. Trocas, devoluções e avarias (texto da política)

- **Arrependimento (compra fora da loja física):** 7 dias a partir do recebimento, com devolução integral do que foi
  pago (CDC art. 49); o Procon-SP orienta que a loja não cobre o frete de devolução
  ([TJDFT](https://www.tjdft.jus.br/institucional/imprensa/campanhas-e-produtos/direito-facil/edicao-semanal/direito-ao-arrependimento-de-compra),
  [Procon-SP](https://www.procon.sp.gov.br/wp-content/uploads/2024/08/Guia_de_Comercio_Eletronico.pdf)).
- **Defeito:** 90 dias para reclamar (bem durável) e 30 dias para a loja resolver (CDC arts. 26 e 18).
- **Avaria na entrega:** o padrão das grandes lojas é conferir na hora, recusar ou anotar no comprovante e mandar fotos
  em poucos dias (a Mobly pede em até 7 dias — [Mobly](https://atendimento.mobly.com.br/?trocas-e-devolucoes=meu-produto-chegou-errado-como-proceder)).
- A página do pedido já orienta o cliente a conferir e fotografar. **Decidir:** prazos e quem busca o produto; depois,
  revisar `app/(store)/politicas/trocas-e-devolucoes` e `entrega` com o texto final (de preferência com um advogado).

### 4. Avisos automáticos

| Opção | Custo | Observação |
| --- | --- | --- |
| **Hoje: um toque no painel** (feito) | Nenhum | A equipe envia pelo WhatsApp da loja |
| WhatsApp oficial (Cloud API da Meta) | Por mensagem entregue ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)); tabela em reais repassada por terceiro: utilidade ≈ R$ 0,035 desde 01/10/2026 ([ChatMaxima](https://chatmaxima.com/whatsapp-api-pricing/brazil/)), confirmar na tabela oficial | Modelos de mensagem aprovados pela Meta. 100 pedidos × 5 avisos ≈ R$ 17,50/mês |
| E-mail transacional (ex.: Resend) | Grátis até 3.000/mês ([Resend](https://resend.com/pricing)) | Bom complemento ao WhatsApp |
| API não oficial (ex.: Z-API) | ~R$ 100/mês | **Não recomendado:** fora das regras do WhatsApp, risco de banir o número |

A fila de avisos automáticos já existe (`docs/NOTIFICACOES.md`); falta só escolher o provedor.

### 5. Pagamento

Para vender pelo WhatsApp, o caminho mais simples é **link de pagamento** (Mercado Pago, Asaas, Pagar.me ou Stripe
geram link com Pix e cartão). Taxas publicadas em 03/11/2026, por exemplo: Mercado Pago Pix 0,99%
([Mercado Pago](https://www.mercadopago.com.br/ferramentas-para-vender/link-de-pagamento)); Asaas Pix R$ 1,99 por
cobrança ([Asaas](https://www.asaas.com/precos-e-taxas)). O painel já guarda a forma de pagamento e a confirmação;
com um provedor escolhido, o próprio aviso de pagamento do provedor pode confirmar o pedido sozinho.

## Próximas fases (sugestão)

1. **Já:** usar o painel de pedidos nas vendas do WhatsApp.
2. **Com as regiões e valores do dono:** frete por região no site (página do produto e sacola).
3. **Com o provedor de pagamento:** link de pagamento criado pelo painel e confirmação automática.
4. **Com o WhatsApp oficial:** avisos automáticos a cada etapa (a fila já existe).
5. **Depois:** pedido feito pelo próprio site (checkout), entrando na mesma lista de pedidos.

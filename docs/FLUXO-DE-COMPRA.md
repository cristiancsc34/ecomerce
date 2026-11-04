# Fluxo de compra: do produto à entrega (e depois)

**Estado (03/11/2026):** descreve o que existe no código hoje, incluindo o **checkout do site que está sendo feito
agora** (pedido sem pagamento online). O que ainda não existe aparece marcado como **pendente**. Detalhes da logística
em [`LOGISTICA.md`](LOGISTICA.md); auditoria da loja em [`EXPERIENCIA-DO-CLIENTE.md`](EXPERIENCIA-DO-CLIENTE.md);
como melhorar sempre em [`MELHORIA-CONTINUA.md`](MELHORIA-CONTINUA.md).

**Como a venda fecha hoje:** o cliente faz o pedido no site (ou no WhatsApp), a loja confirma pagamento (Pix ou link)
e entrega **pelo WhatsApp**, e a equipe avança cada etapa no painel. Não há pagamento online.

**Fábrica e logística:** com a integração ligada, o pedido confirmado segue para o Trama, que reserva do estoque ou abre
a ordem de produção, agenda, roteiriza e entrega; cada etapa volta para a página do cliente
([`INTEGRACAO-TRAMA.md`](INTEGRACAO-TRAMA.md)).

## 1. Visão geral

```
CLIENTE (loja)                                   EQUIPE (painel /admin)
─────────────────────────────────────────────    ─────────────────────────────────────────────
Descobre o produto (início, categoria, busca,
assistente "Ajuda")
  └─▶ Página do produto: fotos, girar em 3D,
      "Ver no seu ambiente" (câmera, no celular)
        └─▶ Põe na sacola (só ids e quantidades,
            no navegador)
              └─▶ Sacola: preço recalculado
                  pelo servidor (/api/cart/quote)
                    └─▶ /finalizar: dados, entrega
                        ou retirada, 2 aceites
                          └─▶ place_site_order ───────▶ Pedido novo "Recebido", selo "Site"
                              (banco calcula tudo)       Início: "Aguardando confirmação: N"
                                │
  /pedido/PED-…?t=…&novo=1 ◀────┘
  (link secreto do pedido)
                                                   Abre o pedido → "Abrir no WhatsApp"
  Recebe a mensagem no WhatsApp ◀──────────────── (texto pronto: itens, total, link)
  Combina frete, data e paga (Pix ou link) ──────▶ "Confirmar pagamento" ........... Pago
                                                   "Começar a preparar" ...... Em preparação
                                                   "Agendar a entrega" (data + período)
  Aviso no WhatsApp + página atualizada ◀──────── ......................... Enviado
                                                   No dia: "Saiu para entrega"
  Recebe, confere, assina ─────────────────────── "Marcar como entregue" ...... Entregue
                                                   (retirada: "Cliente retirou" → Entregue)
  Pede troca/devolução (WhatsApp) ──────────────▶ "Cliente pediu troca…" .. Devolução solicitada
                                                   "Produto devolvido" ............ Devolvido
Antes da entrega, a equipe pode cancelar em qualquer etapa ......................... Cancelado
```

A ordem das etapas é a do banco (`private.order_transition_allowed`) e a mesma da tela (`NEXT_STATUSES` em
`lib/orders/status.ts`). Pedido cancelado ou devolvido não reabre.

## 2. Passo a passo do cliente

| # | Etapa | O que o cliente vê e faz | Onde está no código |
| --- | --- | --- | --- |
| 1 | Descobre | Início, categorias, busca e o assistente **“Ajuda”** (responde só com o catálogo; o que não foi confirmado ele diz que não sabe) | `app/(store)/`, `docs/ASSISTENTE.md` |
| 2 | Avalia | Página do produto: galeria, **girar em 3D** e, no celular, **“Ver no seu ambiente”** (câmera, realidade aumentada). Medida, material e garantia só aparecem se a loja preencheu | `components/product/viewer-3d.tsx`, `purchase-panel.tsx` |
| 3 | Sacola | Guarda só produto, variação e quantidade no navegador (`localStorage`, sem conta). Preço e disponibilidade vêm do servidor a cada abertura. Produto sem preço ou de demonstração não vira pedido | `lib/cart/store.ts`, `components/cart/cart-view.tsx`, `/api/cart/quote` |
| 4 | Finalizar | **`/finalizar`**, sem cadastro (convidado), em 3 blocos: (1) nome, celular com WhatsApp, e-mail opcional; (2) **entrega no endereço** (CEP preenche rua, bairro, cidade e UF; número, complemento, referência e **acesso para a entrega**: andar, elevador, escada) ou **retirada na loja**; (3) pagamento explicado (“a loja confirma pelo WhatsApp; o frete é combinado nesse contato”) e 2 aceites obrigatórios: falar pelo WhatsApp sobre o pedido e ter lido as políticas de entrega e trocas | `app/(store)/finalizar/`, `components/checkout/checkout-view.tsx`, `lib/validation/checkout.ts` |
| 5 | Pedido enviado | A sacola é esvaziada e a tela vai para **`/pedido/<código>?t=<token>&novo=1`**: etapas com ✓, itens, valores (frete “a combinar” na entrega; 0 na retirada) e o recado “Pedido feito pelo site. Vamos confirmar o pagamento e a entrega com você pelo WhatsApp.” | `lib/orders/checkout-actions.ts`, `app/(store)/pedido/[codigo]/` |
| 6 | Confirma pagamento | Conversa no WhatsApp com a loja: frete, data e pagamento (Pix ou link). **Manual** | — |
| 7 | Acompanha | O link do pedido vai em toda mensagem. Sem o link: **Acompanhar pedido** (rodapé, `/conta`) com número do pedido + celular. A página mostra só bairro/cidade/UF, data e período combinados, transportadora e rastreio (se houver), montagem, histórico com recados e dicas para o dia da entrega | `components/orders/`, `lib/orders/tracking.ts`, `lib/orders/actions.ts` |
| 8 | Recebe | Dica na página: conferir antes de assinar, anotar e fotografar avaria, ver se passa pela porta/escada. A mensagem de “Entregue” pede para responder com fotos se algo veio diferente | `components/orders/order-tracking-view.tsx`, `lib/orders/messages.ts` |
| 9 | Troca/devolução | Pede pelo WhatsApp; a equipe registra e combina a retirada. Regras e prazos dependem do dono (seção 7) | `staffActions()` em `lib/orders/status.ts` |

**Passo 5 com `novo=1`:** a página mostra no topo o bloco “Pedido enviado!”, com o número do pedido, os próximos passos, o aviso para guardar o link, o botão de copiar o link e o botão do WhatsApp da loja (sem número configurado, leva para `/atendimento`).
Cabe à frente da página do pedido.

## 3. Passo a passo da equipe

| # | Etapa | O que a equipe faz no painel | Status |
| --- | --- | --- | --- |
| 1 | Pedido novo | **Início** mostra “Aguardando confirmação” e “Em andamento”; **Pedidos** lista com selo **Site** nos pedidos do checkout. Pedidos do WhatsApp/telefone: **Novo pedido** (como antes) | Recebido |
| 2 | Primeiro contato | Abre o pedido → **Abrir no WhatsApp** (texto pronto com itens, total e link) ou **Copiar mensagem**. Combina frete, data e pagamento. Se precisar, **Editar dados do pedido** (frete, desconto, forma de pagamento; itens só até a preparação) | Recebido |
| 3 | Pagamento | **Confirmar pagamento** (grava a hora). Ou “Preparar sem pagamento (paga na entrega)” | Pago |
| 4 | Preparar | **Começar a preparar**: separar, embalar ou produzir | Em preparação |
| 5 | Agendar | Entrega da loja: **Agendar a entrega** com data e período. Transportadora: nome, código e link (só https). Retirada: **Cliente retirou** | Enviado / Entregue |
| 6 | Avisar | A cada etapa, a mensagem pronta muda; um toque abre o WhatsApp. **Recado para o cliente** aparece na página dele; **nota interna** só para a equipe | — |
| 7 | Entregar | No dia: **Saiu para entrega** → **Marcar como entregue**. Não deu? **Não deu para entregar (reagendar)** volta para Enviado | Saiu para entrega → Entregue |
| 8 | Pós-venda | Troca/devolução: **Cliente pediu troca ou devolução** → **Produto devolvido** (ou **Cliente desistiu**) | Devolução solicitada → Devolvido |

## 4. Quem faz o quê em cada etapa

| Etapa | Cliente | Equipe | Sistema (automático) |
| --- | --- | --- | --- |
| Descobrir e avaliar | Navega, gira em 3D, vê no ambiente, pergunta ao assistente | Cadastra produto, fotos, preço e medidas confirmadas | Mostra só produto publicado; esconde campo vazio; assistente responde só com o catálogo |
| Sacola | Escolhe variação e quantidade | — | Recalcula preço e disponibilidade no servidor |
| Finalizar | Preenche dados e aceites | — | Valida na tela e no servidor; busca CEP (ViaCEP); limite de 5 pedidos/10 min por IP |
| Registrar o pedido | — | (pedidos de fora do site: Novo pedido) | `place_site_order`: preço do catálogo, totais, número `PED-…`, link secreto, linha do tempo |
| Confirmar pagamento e frete | Paga (Pix ou link), combina data | Conversa no WhatsApp, edita frete, **Confirmar pagamento** | Recalcula total; grava hora do pagamento |
| Preparar e agendar | — | Avança etapas, informa data/período ou rastreio | Recusa etapa fora de ordem; grava histórico imutável |
| Avisar | Lê a mensagem e a página | Um toque em **Abrir no WhatsApp** | Monta o texto da etapa (só dados registrados) |
| Entregar | Recebe e confere | Marca entregue ou reagenda | Página do cliente atualiza na hora |
| Pós-venda | Pede troca/devolução | Registra e combina retirada | Linha do tempo registra cada passo |

## 5. Automático × manual hoje

| Automático | Manual |
| --- | --- |
| Preço, subtotal e total calculados no banco | Contato inicial com o cliente (WhatsApp) |
| Número do pedido e link secreto | Cobrar e conferir o pagamento (Pix ou link) |
| Validação do pedido (estoque informado, variação, quantidades, endereço) | **Frete** (vazio = “a combinar”) e data da entrega |
| Ordem das etapas e linha do tempo | Avançar cada etapa no painel |
| Texto da mensagem de cada etapa | Enviar a mensagem (um toque abre o WhatsApp) |
| Página de acompanhamento sempre atualizada | Cancelar pedido que não foi pago (não há prazo automático) |
| Contagem de pedidos aguardando no Início | Abrir o painel para ver se chegou pedido (não há alerta) |
| Fila de avisos automáticos (estrutura pronta, `docs/NOTIFICACOES.md`) | — **não ligada a pedidos e sem provedor** |

## 6. Pontos de falha e como o sistema protege

| Risco | Proteção que existe | Onde | Brecha / pendente |
| --- | --- | --- | --- |
| Preço adulterado no navegador | O navegador manda só ids e quantidades; preço e nome vêm do catálogo; totais no banco | `place_site_order`, `/api/cart/quote` | — (testado em `tests/db/checkout.test.ts`) |
| Pedido de produto em rascunho, demonstração, sem preço ou variação errada | Recusado com mensagem clara | `place_site_order` | — (testado) |
| Estoque | Recusa se o estoque informado for 0 ou menor que o pedido | `place_site_order` | **O pedido não baixa o estoque**; dois clientes podem pedir a última unidade. A equipe confere ao confirmar |
| Etapa pulada (ex.: recebido → entregue) | Banco recusa; tela só mostra os próximos passos válidos | `order_transition_allowed`, `staffActions` | — (testado) |
| Histórico alterado | Linha do tempo sem edição nem exclusão (RLS) | `order_events` | — (testado) |
| Estranho vê o pedido de outra pessoa | Página só com **link secreto** (UUID); sem ele, só com número + celular; mostra só bairro/cidade/UF; sem notas internas | `order_tracking`, `order_tracking_token` | — (testado) |
| Visitante lê a tabela de pedidos | RLS: só a equipe; o visitante só chama as funções públicas | migração de pedidos | — (testado) |
| Robô fazendo pedidos ou testando celulares | No site: 5 pedidos, 10 consultas de pedido e 30 CEPs por IP a cada 10 min. No banco (vale até para quem chama a API pública direto): 5 pedidos por celular por hora e 30 pedidos do site a cada 10 min | `checkout-actions.ts`, `actions.ts`, `20261103000200_site_checkout.sql` | Limite por IP **em memória, por instância** da Vercel (melhor esforço; `docs/SEGURANCA.md`). Num ataque, o limite geral do banco também barra clientes de verdade por alguns minutos |
| Link de rastreio malicioso | Só `https://` (banco e mensagem) | `orders_tracking_url`, `messages.ts` | — |
| Prazo ou frete inventado | Frete vazio = “a combinar”; prazo só a data agendada pela equipe | banco, `messages.ts`, `status.ts` | — |
| WhatsApp sem permissão | Checkout exige o aceite; painel avisa quando o pedido não tem aceite | `checkout-view.tsx`, `order-steps.tsx` | O aceite cobre **avisos do pedido**, não propaganda (ver `MELHORIA-CONTINUA.md`) |
| Erro ao enviar (rede, preço mudou) | Mensagem na tela; a sacola é conferida de novo; recusa não gasta número de pedido | `checkout-view.tsx`, `place_site_order` | — |
| Pedido parado sem ninguém ver | Contador no Início do painel | `app/admin/(painel)/page.tsx` | **Sem alerta** (e-mail/celular) quando chega pedido |
| Pedido nunca pago fica aberto | — | — | **Sem prazo de validade**; cancelar à mão |
| Cliente fecha a página e perde o link | Pode achar com número + celular | `/conta` | Se não anotou o número, só pelo WhatsApp da loja |

## 7. Decisões que ainda dependem do dono

Opções e preços pesquisados em [`LOGISTICA.md`](LOGISTICA.md) e [`NOTIFICACOES.md`](NOTIFICACOES.md).

| Decisão | Por que trava o fluxo | Onde entra |
| --- | --- | --- |
| **Canais de contato** (WhatsApp, telefone, e-mail, horário) | Sem eles o cliente não fala com a loja; hoje estão vazios em `config/brand.ts` | Atendimento, rodapé, página do pedido |
| **Preços confirmados e catálogo real** (`CATALOG_SOURCE=supabase`) | `/finalizar` só funciona com catálogo real; produto sem preço não vira pedido | Painel e variáveis da Vercel |
| **Regiões, valor e prazo do frete** | Frete “a combinar” é o maior motivo de desistência (ver `MELHORIA-CONTINUA.md`) | Página do produto, sacola, checkout |
| **Montagem** (faz? cobra? até que andar sobe?) | O painel já registra montagem; o checkout não pergunta | Política de entrega, checkout |
| **Trocas, devoluções e avarias** (prazos, quem busca) | Cliente aceita as políticas no checkout, mas o texto ainda é genérico (`policiesUnderReview`) | `app/(store)/politicas/` |
| **Razão social, CNPJ e endereço** | Exigidos na loja online (Decreto 7.962/2013, art. 2º) | `config/brand.ts` (rodapé, políticas) |
| **Pagamento** (link do provedor, chave Pix) | Hoje tudo é conferido à mão | Painel; depois confirmação automática |
| **Avisos automáticos** (WhatsApp oficial, e-mail) | Hoje cada aviso depende de um toque da equipe | `lib/notifications/` |
| **Prazo para cancelar pedido não pago** | Evita pedidos abertos para sempre | Rotina da equipe (ou automático depois) |
| **Endereço da loja para retirada** | A opção “Retirar na loja” só mostra endereço se estiver preenchido | `config/brand.ts` |

## 8. Código (mapa rápido)

| Peça | Arquivo |
| --- | --- |
| Pedido pelo site (banco) | `supabase/migrations/20261103000200_site_checkout.sql` (`place_site_order`) |
| Pedidos, etapas, acompanhamento (banco) | `supabase/migrations/20261103000100_orders.sql` |
| Validação do checkout | `lib/validation/checkout.ts` |
| Ações do checkout (pedido e CEP) | `lib/orders/checkout-actions.ts` |
| Tela do checkout | `app/(store)/finalizar/`, `components/checkout/checkout-view.tsx` |
| Etapas, textos, mensagens | `lib/orders/status.ts`, `lib/orders/messages.ts` |
| Acompanhamento | `lib/orders/tracking.ts`, `lib/orders/actions.ts`, `app/(store)/pedido/[codigo]/`, `components/orders/` |
| Painel | `app/admin/(painel)/pedidos/`, `app/admin/(painel)/page.tsx`, `lib/admin/orders.ts`, `components/admin/order-steps.tsx` |
| Testes | `tests/db/checkout.test.ts`, `tests/db/orders.test.ts`, `tests/unit/orders.test.ts` |

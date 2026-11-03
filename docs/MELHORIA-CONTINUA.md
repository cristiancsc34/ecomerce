# Melhoria contínua: checkout e pós-compra

**Data (03/11/2026).** Boas práticas pesquisadas na web (fontes no fim, todas acessadas em 03/11/2026) comparadas com o
que o projeto tem hoje ([`FLUXO-DE-COMPRA.md`](FLUXO-DE-COMPRA.md)). Números de terceiros são referência de mercado,
não promessa de resultado. Nada aqui muda o site sozinho: cada melhoria passa pelo “ok” do dono.

## O que a pesquisa diz, em 8 linhas

1. **Cerca de 70% das sacolas são abandonadas** (média de 50 estudos). Entre quem não estava só olhando, o 1º motivo é
   **custo extra alto (frete etc.): 40%**; depois entrega lenta (20%), desconfiança do site (19%), ter que criar conta
   (18%), checkout longo (17%), política de troca ruim (13%) e **não ver o total antes (12%)** [B1].
2. Checkout médio: 5,1 etapas e 11,3 campos; **a maioria das lojas precisa de só 8 campos**. Um campo só para nome
   completo; “complemento” escondido atrás de um link; preencher endereço automaticamente; conta só depois do pedido [B2].
3. **Comprar sem cadastro** precisa ser a opção mais visível; 62% das lojas grandes erram nisso [B3].
4. Mostrar **data estimada de entrega** (“chega até 12/11”) em vez de “3 a 8 dias úteis”, se possível já na página do
   produto [B4].
5. No acompanhamento, o cliente procura **data de entrega, quem entrega e as etapas**; páginas de terceiros
   desorientam [B5]. Em móveis, entrega e devolução pesam na decisão de compra [B6].
6. **WhatsApp:** só mandar mensagem com aceite; aceite separado por tipo de mensagem; respeitar qualquer pedido para
   parar [W1]. **Lembrete de sacola abandonada é “marketing” para a Meta, mesmo que o cliente tenha pedido** [W2].
7. **Lei do e-commerce (Decreto 7.962/2013):** mostrar razão social, CNPJ, endereço e contato; separar frete do preço;
   resumo antes de fechar; corrigir erros antes de enviar; **confirmar na hora o recebimento do pedido**; contrato que o
   cliente possa guardar [L1].
8. **LGPD:** usar dados só para a finalidade informada e só o necessário [L2]. **NPS** = % de notas 9–10 menos % de
   notas 0–6 [N1].

## (a) Checklist: o que já atendemos e o que falta

Legenda: ✅ atende · 🔶 em parte · ❌ falta

### Checkout

| Boa prática | Hoje | Detalhe |
| --- | --- | --- |
| Comprar sem cadastro [B3] | ✅ | Não existe conta de cliente; só nome, celular e endereço |
| Poucos campos [B2] | ✅ | Obrigatórios digitados: nome, celular, CEP e número (rua, cidade e UF vêm do CEP). E-mail opcional. Sem CPF |
| Nome em campo único [B2] | ✅ | “Nome completo” |
| Endereço pelo CEP [B2] | ✅ | ViaCEP, com limite por IP; dá para preencher à mão |
| Teclado e preenchimento automático certos no celular | ✅ | `inputMode` e `autoComplete` nos campos |
| Complemento/referência escondidos atrás de um link [B2] | 🔶 | Aparecem sempre (opcionais) |
| Resumo e total antes de enviar [L1 art. 4º I] | 🔶 | Resumo lateral com itens e valores; **frete “a combinar”** (o total final não aparece) |
| Frete separado e conhecido cedo [B1, L1 art. 2º IV] | ❌ | Depende da tabela de regiões do dono (`LOGISTICA.md`) |
| Data estimada de entrega [B4] | ❌ | Depende dos prazos por região do dono. Nunca inventar |
| Corrigir erros antes de enviar [L1 art. 4º II] | ✅ | Erro em cada campo, foco no campo, sacola conferida de novo |
| Confirmação imediata [L1 art. 4º III] | ✅ | Tela do pedido com número e link logo após enviar |
| Cópia que o cliente guarda [L1 art. 4º IV] | 🔶 | Link do pedido na tela e na 1ª mensagem do WhatsApp (manual); sem envio automático |
| Razão social, CNPJ, endereço, contato [L1 art. 2º] | ❌ | Vazios em `config/brand.ts` |
| Política de troca clara [B1] | 🔶 | Aceite obrigatório, mas o texto ainda é genérico (`policiesUnderReview`) |
| Formas de pagamento [B1] | 🔶 | Pix ou link combinados pelo WhatsApp; sem pagamento no site |
| Proteção contra preço adulterado e pedidos em massa | ✅ | Preço do banco; limite por IP no site (em memória) e, no banco, por celular (5/hora) e geral (30 a cada 10 min) |

### Pós-compra

| Boa prática | Hoje | Detalhe |
| --- | --- | --- |
| Página de acompanhamento dentro da loja [B5] | ✅ | Etapas, data e período, transportadora, histórico, itens |
| Data, quem entrega e etapas [B5] | ✅ | Data só quando a equipe agenda |
| Aviso a cada etapa | 🔶 | Mensagem pronta, mas enviada com um toque da equipe; automático depende do provedor |
| Entrega agendada por período e dados de acesso (andar, escada) [B6] | ✅ | Campo no checkout e no painel |
| Orientação para conferir e registrar avaria | ✅ | Página do pedido e mensagem de “Entregue” |
| Alerta para a equipe quando chega pedido | ❌ | Só o contador no Início do painel |
| Prazo para cancelar pedido não pago | ❌ | Decisão do dono |
| Estoque baixado ao vender | ❌ | O pedido confere, mas não reserva |
| Pesquisa de satisfação (NPS) e avaliações | ❌ | — |
| Recuperação de sacola pelo WhatsApp [W1, W2] | ❌ | Exige aceite **de marketing**, separado; hoje não coletamos (e está certo não usar o aceite do pedido para isso) |

### Privacidade (LGPD)

| Boa prática | Hoje | Detalhe |
| --- | --- | --- |
| Só o necessário [L2] | ✅ | Sem CPF, e-mail opcional. Se a nota fiscal exigir CPF no futuro, pedir só nesse momento |
| Finalidade dita no aceite [L2] | ✅ | “Aceito que a loja fale comigo pelo WhatsApp **sobre este pedido**” |
| Aceite de marketing separado e opcional [W1] | ❌ | Não existe (só criar quando houver campanha) |
| Página do pedido sem dados sensíveis | ✅ | Só bairro/cidade/UF; `noindex`; link secreto |
| Tempo de guarda dos dados | ❌ | Pedidos sem prazo definido; avisos: 90 dias (planejado) |
| Política de privacidade revisada | ❌ | Em revisão; citar WhatsApp e consulta de CEP |

## (b) Métricas para acompanhar

| Métrica | Como calcular | De onde vem o dado | Pronto hoje? |
| --- | --- | --- | --- |
| Visitas a produto, sacola e `/finalizar` | Visitas por página | **Vercel Web Analytics** (visitas por página). Não está instalado (`@vercel/analytics`) | ❌ instalar |
| Produto → sacola | Toques em “Pôr na sacola” ÷ visitas ao produto | Evento personalizado da Vercel (`track`): **só nos planos Pro/Enterprise** [V1] | ❌ |
| Sacola → finalizar → pedido | Visitas a `/finalizar` ÷ visitas à sacola; pedidos do site ÷ visitas a `/finalizar` | Analytics + tabela `orders` (`source = 'site'`) | 🔶 pedidos sim |
| Pedido → pago → entregue | % com `paid_at`; % entregue; % cancelado | `orders`, `order_events` (SQL abaixo) | ✅ |
| Tempo entre etapas | Recebido → pago (horas); pago → entregue (dias) | `order_events.created_at` | ✅ |
| Reagendamentos | Vezes que “saiu para entrega” voltou para “enviado” | `order_events` | ✅ |
| Taxa de troca/devolução | Pedidos com “devolução solicitada” ÷ entregues | `order_events` | ✅ |
| Taxa de avaria | Entregas com avaria ÷ entregues | Combinar: nota interna começando com **“Avaria:”** | 🔶 por convenção |
| Motivo de cancelamento | Contagem por motivo | Nota interna ao cancelar (“Cancelado: não pagou”, “desistiu”, “sem estoque”) | 🔶 por convenção |
| NPS | % 9–10 − % 0–6 [N1] | Pergunta no WhatsApp após “Entregue”; anotar a nota (planilha ou, depois, tabela) | ❌ |
| Erros no checkout | Erros por dia | Logs da Vercel | 🔶 |

Consultas prontas (só leitura; rodar no SQL Editor do **projeto Supabase da loja, na conta do Cristian**):

```sql
-- Funil do mês por origem (site × painel)
select date_trunc('month', created_at)::date as mes, source,
       count(*) as pedidos,
       count(*) filter (where paid_at is not null) as pagos,
       count(*) filter (where status in ('entregue', 'devolucao_solicitada', 'devolvido')) as entregues,
       count(*) filter (where status = 'cancelado') as cancelados
from public.orders
group by 1, 2
order by 1 desc, 2;

-- Tempo entre etapas (últimos 30 dias)
with etapa as (
  select order_id, status, min(created_at) as em
  from public.order_events
  group by order_id, status
)
select count(*) as pedidos_pagos,
       round(avg(extract(epoch from p.em - r.em) / 3600)::numeric, 1) as horas_ate_pagar,
       round(avg(extract(epoch from e.em - p.em) / 86400)::numeric, 1) as dias_do_pagamento_a_entrega
from etapa r
join etapa p on p.order_id = r.order_id and p.status = 'pago'
left join etapa e on e.order_id = r.order_id and e.status = 'entregue'
where r.status = 'recebido' and r.em >= now() - interval '30 days';

-- Trocas/devoluções e reagendamentos (cada "enviado" além do primeiro = uma entrega que voltou)
select count(distinct order_id) filter (where status = 'entregue') as entregues,
       count(distinct order_id) filter (where status = 'devolucao_solicitada') as pediram_troca,
       count(*) filter (where status = 'enviado') - count(distinct order_id) filter (where status = 'enviado') as reagendamentos
from public.order_events;
```

Pedidos de exemplo/teste distorcem os números: anotar os códigos de teste e tirá-los da conta.

## (c) Rotina do dono

**Todo dia (5 min):** abrir **Início** no painel → “Aguardando confirmação”. Pedido do site sem contato há mais de
algumas horas é venda esfriando.

**Toda semana (20 min, mesmo dia):**

1. Pedidos da semana: quantos do site e do painel, quantos pagos, cancelados (e por quê).
2. Pedidos parados: recebido há muitos dias sem pagamento → falar ou cancelar (prazo que o dono definir).
3. Entregas da próxima semana: datas, períodos e acesso (andar, escada) conferidos.
4. Ler as conversas de WhatsApp da semana e anotar **as 3 dúvidas mais repetidas** (frete? medida? prazo?). Cada uma
   vira um ajuste: texto na página do produto, pergunta frequente ou informação no checkout.

**Todo mês (1 h):**

1. Rodar as consultas acima e anotar numa planilha: pedidos, % pago, % entregue, horas até pagar, dias até entregar,
   trocas, avarias, NPS.
2. Comparar com o mês anterior; escolher **uma** melhoria da lista (d) para o mês. Mudar uma coisa por vez para saber
   o que funcionou.
3. Conferir o que está vazio na loja: preço, medidas, políticas, contatos.

**A cada 3 meses:** revisar políticas de entrega e troca, tempo de guarda dos dados (LGPD) e se o volume já justifica
pagamento online e avisos automáticos.

## (d) Próximas melhorias, por impacto e esforço

| # | Melhoria | Impacto | Esforço | Depende de |
| --- | --- | --- | --- | --- |
| 1 | **Canais de contato, razão social, CNPJ e endereço** na loja | Alto (confiança; exigência legal) | Baixo | Dono informar |
| 2 | **Tabela de frete e prazo por região**; “Entregamos no seu CEP: R$ X, até DD/MM” no produto, na sacola e no checkout | Muito alto (1º motivo de desistência) | Médio | Regiões, valores e prazos do dono |
| 3 | ✅ Feito neste sprint (falta só o número de WhatsApp da loja). Página do pedido tratar `novo=1`: “Pedido enviado!”, número em destaque, “guarde este link” e botão **“Falar com a loja no WhatsApp”** com o número do pedido no texto | Alto | Baixo | Número de WhatsApp da loja |
| 4 | **Alerta de pedido novo** para a equipe (e-mail, com a fila de avisos que já existe) | Alto (venda não esfria) | Baixo–médio | Provedor de e-mail (ex.: Resend grátis) |
| 5 | Textos finais das políticas de entrega, troca e privacidade | Alto (13% desistem por política de troca [B1]) | Baixo | Dono + revisão jurídica |
| 6 | Instalar Vercel Web Analytics (visitas por página) | Médio (sem isso não há funil) | Baixo | Ok do dono; eventos personalizados exigem plano Pro |
| 7 | Convenções de nota interna (“Avaria:”, “Cancelado: motivo”) e pergunta de NPS na mensagem de “Entregue” | Médio | Baixo | Ok do dono no texto |
| 8 | Prazo para cancelar pedido não pago (primeiro à mão; depois automático) | Médio | Baixo | Dono definir o prazo |
| 9 | Baixar o estoque ao confirmar o pagamento | Médio (evita vender o que não tem) | Médio | Ok do dono |
| 10 | Esconder complemento/referência atrás de “Adicionar complemento” [B2] | Baixo–médio | Baixo | — |
| 11 | Link de pagamento pelo painel e confirmação automática | Alto quando o volume crescer | Alto | Provedor de pagamento |
| 12 | Avisos automáticos (WhatsApp oficial) | Médio–alto | Alto | Conta Meta, modelos aprovados |
| 13 | Avaliações de clientes na página do produto | Médio | Médio | Volume de entregas |
| 14 | Recuperação de sacola pelo WhatsApp | Médio | Alto | Aceite de marketing separado [W1, W2], modelo de marketing aprovado, LGPD |

**Sugestão de ordem:** 1 → 3 → 5 → 2 → 4 → 6 → 7. Os itens 1, 2, 5 e 8 só andam com informação do dono.

## Fontes (acessadas em 03/11/2026)

- [B1] Baymard Institute, *Cart Abandonment Rate* (atualizado em 22/09/2025): https://baymard.com/lists/cart-abandonment-rate
- [B2] Baymard Institute, *Checkout Flow: Average Number of Form Fields* (26/06/2024): https://baymard.com/blog/checkout-flow-average-form-fields
- [B3] Baymard Institute, *Current State of Checkout UX*: https://baymard.com/blog/current-state-of-checkout-ux
- [B4] Baymard Institute, *Shipping Speed vs. Delivery Date*: https://baymard.com/blog/shipping-speed-vs-delivery-date
- [B5] Baymard Institute, *Integrate Tracking Info* e *Order Tracking & Returns benchmark 2024*: https://baymard.com/research-articles/integrate-tracking-info, https://baymard.com/blog/2024-benchmark-order-tracking-and-returns
- [B6] Baymard Institute, *Furniture & Home Decor UX*: https://baymard.com/industries/furniture-and-home-decor-ux
- [W1] WhatsApp Business Messaging Policy: https://whatsappbusiness.com/policy/
- [W2] Meta, *Template categorization* (lembrete de sacola = marketing, “even if requested by users”): https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines/
- [L1] Decreto 7.962/2013 (comércio eletrônico), texto na Câmara: https://www2.camara.leg.br/legin/fed/decret/2013/decreto-7962-15-marco-2013-775557-publicacaooriginal-139266-pe.html
- [L2] Lei 13.709/2018 (LGPD), art. 6º (finalidade, necessidade): https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm (a página do Planalto bloqueou o acesso automático nesta data; conferir no navegador)
- [N1] Bain & Company, *Measuring your Net Promoter Score*: https://nps.bain.com/about/measuring-your-net-promoter-score/
- [V1] Vercel, *Tracking custom events* (Pro e Enterprise): https://vercel.com/docs/analytics/custom-events
- Contexto Brasil (fonte secundária): mais de 6 em 10 consumidores já desistiram de comprar pelo WhatsApp (Opinion Box, via ABC da Comunicação): https://www.abcdacomunicacao.com.br/seis-em-cada-dez-brasileiros-ja-desistiram-de-comprar-pelo-whatsapp-mas-o-canal-segue-sendo-o-de-maior-potencial-de-retorno-no-crm-do-varejo/

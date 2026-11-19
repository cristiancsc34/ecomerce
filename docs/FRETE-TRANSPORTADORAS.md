# Frete com transportadoras (Melhor Envio), cotado pelo CEP

**Estado (19/11/2026):** pronto e testado, **desligado**. Só liga quando o dono fizer os 4 passos do fim deste
documento. Até lá, nada muda para o cliente: o frete continua pelas formas de entrega cadastradas no painel
([`FRETE-E-AVISOS.md`](FRETE-E-AVISOS.md)) ou “a combinar”.

## Como funciona (em linguagem simples)

1. O dono cadastra, em cada produto, **as caixas do produto já embalado**: peso (kg) e medidas (cm) de cada caixa. Um
   sofá pode vir em 2 caixas; cada tamanho de colchão pode ter a sua caixa.
2. Na sacola e no `/finalizar`, quando o cliente informa o CEP, a loja pergunta ao **Melhor Envio** quanto custa
   levar aquelas caixas até aquele CEP. As opções das transportadoras aparecem **junto** das formas de entrega da
   loja, com valor e prazo.
3. Quando o cliente fecha o pedido, **a loja cota de novo no servidor**. Se o valor mudou, o cliente é avisado e
   confirma. A cotação fica guardada por 30 minutos e o **banco confere** se ela é daquele CEP e daquela sacola. O
   valor do frete que vai para o pedido **nunca** é o que o navegador mandou.
4. O pedido entra como “Transportadora”, com o nome da transportadora, o serviço e o prazo na linha do tempo.

**Nada inventado:**
- produto sem caixas cadastradas = a loja **não cota** essa sacola (frete “a combinar”);
- transportadora que não atende o CEP, ou caixa grande demais para ela, simplesmente não aparece;
- Melhor Envio fora do ar, token vencido ou resposta estranha = só as formas da loja ou “a combinar”;
- o prazo mostrado é **o da transportadora, contado da postagem** (o texto na tela diz isso). O tempo para
  produzir/embalar não entra: se quiser somar dias, configure isso na sua conta do Melhor Envio (a loja usa o valor e
  o prazo “personalizados” que a conta devolver, como a documentação recomenda).

## O que é o Melhor Envio

Plataforma que cota e contrata frete em várias transportadoras ao mesmo tempo. Pela página oficial
(<https://melhorenvio.com.br/>, consultada em 19/11/2026): “plataforma gratuita de gestão e intermediação de fretes”,
o cadastro pode ser feito com CPF, e a documentação diz que “a integração com o Melhor Envio é gratuita. Não cobramos
taxas ou mensalidades pelo uso da nossa API” (<https://docs.melhorenvio.com.br/docs/introducao-a-api.md>). Você paga a
etiqueta de cada envio que contratar. **Confira as condições na página oficial antes de usar.**

**Móveis são volumosos.** O próprio Melhor Envio diz que peso e medidas máximas “dependem da modalidade de frete e da
transportadora escolhida”. A loja não promete nenhuma transportadora: aparecem só as que a sua conta tiver ligadas e
que aceitarem aquelas caixas naquele CEP. Teste com os seus produtos reais (passo 4) antes de divulgar.
Para entregas que nenhuma transportadora aceitar, continue usando as formas de entrega da loja (entrega própria por
região) ou “a combinar”.

## Passo a passo para ligar

### 1. Criar a conta e o token

1. Crie a conta em <https://melhorenvio.com.br/> (para testar antes, há o ambiente de testes em
   <https://sandbox.melhorenvio.com.br/>, com conta separada e saldo fictício; lá só aparecem simulações de Correios
   e Jadlog — <https://docs.melhorenvio.com.br/docs/sandbox.md>).
2. Na conta, ligue as transportadoras que quer usar e, se quiser, ajuste prazos e valores extras (menu
   “Integrações”/configurações de frete da sua conta).
3. Gere o token de acesso. A documentação oficial descreve o caminho por **aplicativo** (padrão OAuth2):
   - menu **Integrações → Área Dev. → Cadastrar aplicativo** (<https://docs.melhorenvio.com.br/docs/criando-um-novo-aplicativo.md>);
   - autorize o aplicativo com a permissão **`shipping-calculate`** (“Cotação de fretes”) — só ela é necessária para
     cotar (<https://docs.melhorenvio.com.br/reference/fluxo-de-autoriza%C3%A7%C3%A3o.md>);
   - o resultado é um `access_token`.
   - **Validade:** pela documentação, o access_token vale **30 dias** (o refresh_token, 45). Antes de vencer, gere um
     novo e troque na Vercel. O painel (Entrega e avisos → Transportadoras) mostra a data de vencimento quando
     consegue ler. Sem token válido, as transportadoras somem e o frete volta a “a combinar” (nada quebra).
   - Se o painel do Melhor Envio da sua conta oferecer outro jeito de gerar token com a permissão de cotação, também
     serve: a loja só precisa do token. (Não encontramos esse caminho na documentação oficial, por isso não o
     descrevemos aqui.)

Limite da API (FAQ oficial): 250 consultas por minuto por usuário — a loja também limita as consultas de frete por
visitante.

### 2. Configurar na Vercel (só no servidor — nunca `NEXT_PUBLIC_`)

Conta da loja: Vercel `cristians-projects-006bedc2`, projeto `cuxoes` → Settings → Environment Variables (marque como
**Sensitive**). Depois, publique de novo (Redeploy).

| Variável | O que colocar | Obrigatória |
| --- | --- | --- |
| `MELHOR_ENVIO_TOKEN` | O token do passo 1 | Sim |
| `MELHOR_ENVIO_CONTATO` | Um e-mail de contato técnico (a API exige o nome da aplicação e um e-mail no cabeçalho `User-Agent`) | Sim |
| `FRETE_CEP_ORIGEM` | CEP de onde sai a mercadoria (fábrica/depósito), 8 números | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Já usada pelo estúdio de IA; aqui serve para gravar a cotação na hora do pedido | Sim |
| `MELHOR_ENVIO_AMBIENTE` | `producao` (padrão) ou `sandbox` (token do ambiente de testes) | Não |
| `MELHOR_ENVIO_SERVICOS` | Só alguns serviços, pelos números do Melhor Envio, separados por vírgula (ex.: `2,3`). Vazio = todos os ligados na conta | Não |

### 3. Aplicar a migração no banco (com o ok do dono)

`supabase/migrations/20261119000300_frete_transportadoras.sql` — cria as caixas nos produtos, a tabela de cotações e
a nova versão da função do pedido. **Não foi aplicada no banco de produção.** O site funciona com ou sem ela: sem
ela, o painel avisa que o cadastro da embalagem não está ativo e a loja não cota com transportadora.

### 4. Cadastrar as caixas e testar

1. Painel → Produtos → produto → aba **Preço** → **Embalagem para o frete**: peso e medidas de cada caixa, medidos
   com o produto embalado (fita métrica e balança). Para opções com caixa diferente (ex.: tamanhos de colchão), marque
   “caixas próprias”.
2. Painel → **Entrega e avisos** → cartão **Transportadoras (Melhor Envio)** deve mostrar “Ligada”.
3. Na loja, ponha o produto na sacola e calcule o frete para alguns CEPs (perto e longe). Confira os valores com a
   cotação feita direto no site do Melhor Envio com as mesmas caixas.
4. Faça um pedido de teste e confira no painel o frete e o nome da transportadora na linha do tempo.

## Depois do pedido (o que continua manual)

A loja **só cota**. Comprar a etiqueta, postar e informar o rastreio continuam com a equipe:

1. compre a etiqueta no site do Melhor Envio com a transportadora/serviço que o cliente escolheu (está na linha do
   tempo do pedido);
2. no painel → Pedidos → “Entregar à transportadora”, informe o nome, o código e o link de rastreio (o cliente vê na
   página do pedido).

Rastreio automático: a API tem a consulta de situação da etiqueta (`POST /api/v2/me/shipment/tracking`, permissão
`shipping-tracking` — <https://docs.melhorenvio.com.br/reference/rastreio-de-envios.md>), que usa o id da etiqueta
comprada pela API. Como a compra de etiqueta não está integrada, isso fica para uma próxima fase.

## Alternativa: Frenet

Também cota várias transportadoras (`POST https://api.frenet.com.br/shipping/quote`, cabeçalho `token`, itens com
peso e medidas — <https://docs.frenet.com.br/reference/calculateshippingquote.md>). Pela documentação, o token vem do
cadastro de cliente pela API de parceiros, e a página oficial (<https://frenet.com.br/>) diz “Pague apenas pela
etiqueta emitida”, sem tabela de mensalidade publicada. **Não está implementada**: o código foi feito para o Melhor
Envio. Se o dono preferir a Frenet, dá para trocar só o arquivo do provedor (`lib/shipping/melhor-envio.ts`).

## Código

| Peça | Arquivo |
| --- | --- |
| Cliente da API (montar a cotação, ler a resposta, configuração) | `lib/shipping/melhor-envio.ts` |
| Caixas da embalagem (regras, divisão do seguro) | `lib/shipping/packages.ts` |
| Cotação da sacola e confirmação no pedido (servidor) | `lib/shipping/carrier.ts` |
| Ação pública do frete e do pedido | `lib/orders/checkout-actions.ts`, `lib/validation/checkout.ts` |
| Tela (sacola e `/finalizar`) | `components/checkout/shipping-options.tsx`, `components/checkout/checkout-view.tsx`, `components/cart/cart-view.tsx` |
| Painel | `components/admin/packaging-panel.tsx`, `lib/admin/packaging.ts`, `lib/admin/actions/packaging.ts`, `app/admin/(painel)/entrega/page.tsx` |
| Banco | `supabase/migrations/20261119000300_frete_transportadoras.sql` |
| Testes | `tests/unit/frete-transportadoras.test.ts` (respostas simuladas da API), `tests/unit/embalagem-painel.test.ts`, `tests/unit/checkout-actions.test.ts`, `tests/db/frete-transportadoras.test.ts` |

**Seguro:** o valor declarado de cada caixa é o preço do produto no catálogo (dividido entre as caixas). Recebimento
com aviso (AR) e mão própria ficam desligados.

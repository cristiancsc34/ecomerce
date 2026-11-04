# Plano: integração com marketplaces

Combinado em 04/11/2026. Ainda não foi implementado. Quando for começar, abra uma sessão e peça:
"vamos executar o plano em docs/plano-integracao-marketplaces.md".

## Objetivo

Cadastrar um produto uma vez só, conversando com o Claude (nome, preço, estoque, fotos), e ele aparecer
automaticamente no site RoyalMarket e nos marketplaces: Mercado Livre, Amazon, TikTok Shop, Shopee e outros.

## Situação atual

- O site é um único arquivo estático: `ecomerce/index.html`.
- Os produtos estão escritos direto no código, num array em JavaScript (por volta da linha 570).
- Não tem backend, banco de dados nem painel de administração.

## Arquitetura escolhida

```
você (chat com o Claude)
        │  "cadastra esse produto, R$ 199, 10 unidades, fotos..."
        ▼
     Claude ──► Supabase (banco + fotos) ──► site RoyalMarket lê os produtos daqui
        │
        └────► Bling (hub) ──► Mercado Livre / Amazon / TikTok Shop / Shopee ...
                    ▲
                    └── sincroniza estoque e pedidos 24 horas
```

- **Claude = central de cadastro.** Escolhe a categoria, preenche os campos obrigatórios de cada canal,
  escreve título e descrição, calcula o preço de cada canal pela comissão e faz edições em massa.
- **Bling = hub.** O Claude fala com uma API só, e o Bling replica para os marketplaces conectados.
  Ele também resolve o estoque em tempo real, que o Claude sozinho não consegue (o Claude só age quando é chamado).
- **Supabase = banco do site + armazenamento das fotos** (link público para usar em todas as plataformas).

Alternativa sem mensalidade: integrar direto só com o Mercado Livre no começo e trazer o hub depois.

## O que você precisa fazer antes de me chamar

1. **Bling:** criar a conta num plano que tenha API e multiloja, e conectar os marketplaces dentro do Bling.
2. **App de API no Bling:** criar o aplicativo (API v3) para obter o client id e o client secret.
3. **Supabase:** criar um projeto (dá para eu ajudar nisso pelo conector do Supabase).
4. **Chaves no ambiente:** salvar as credenciais nas configurações do ambiente: menu do ambiente na barra de
   título da sessão → **Edit** → **Network secrets** (ou "API credentials" / variável de ambiente).
   Nomes que vou ler:
   - `BLING_CLIENT_ID`
   - `BLING_CLIENT_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - Só se integrar direto com o Mercado Livre: `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REFRESH_TOKEN`

   Nunca cole chaves ou senhas no chat. As chaves passam a valer a partir da próxima sessão.

## O que eu vou construir

1. Banco no Supabase: tabelas de produtos, fotos, preço e estoque por canal, e uma tabela para guardar os tokens.
2. Site lendo os produtos do banco, em vez do array fixo no `index.html`.
3. Scripts de integração salvos no repositório (as sessões são temporárias):
   - publicar ou atualizar um produto no Bling;
   - subir fotos para o Supabase Storage;
   - renovar os tokens e guardar os novos no banco.
4. Fluxo de cadastro pelo chat: você manda os dados, eu mostro um resumo por canal, você confirma e eu publico.

## Cuidados já levantados

- Cada marketplace tem as suas categorias e campos obrigatórios (marca, modelo, EAN, voltagem...).
- Regras de foto: Mercado Livre e Amazon querem fundo branco na foto principal.
- Preço por canal: as comissões são diferentes, então o preço de cada plataforma pode mudar.
- Estoque: precisa baixar em todos os canais na hora da venda, e é o hub que faz isso.
- Tokens de acesso expiram e o código de renovação muda a cada uso: o novo tem que ser guardado no banco.
- Amazon e TikTok Shop exigem que a plataforma aprove o seu cadastro de desenvolvedor, se for integrar direto.

## Acesso de rede (testado em 04/11/2026)

Daqui do ambiente da nuvem, todas estas APIs responderam:
`api.mercadolibre.com`, `sellingpartnerapi-na.amazon.com`, `open-api.tiktokglobalshop.com`,
`partner.shopeemobile.com`, `api.bling.com.br`.

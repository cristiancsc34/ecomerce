# AzConfort: loja

Vitrine estática + funções serverless (Vercel) para **frete**, **pedidos** e **pagamento**.
Sem dependências externas: só Node.js 20+.

## Rodar no computador

```bash
npm run dev        # http://localhost:3000 (imita a Vercel: site + /api)
npm test           # testes das regras de frete, pedidos e validações
node tests/e2e-checkout.mjs http://localhost:3000   # compra completa no navegador (requer Playwright)
```

Cartão de teste no modo simulação: `4111 1111 1111 1111` (aprovado) ou `4000 0000 0000 0002` (recusado), qualquer validade futura e CVV.

## Estrutura

| Caminho | O que é |
|---|---|
| `index.html` | vitrine + carrinho lateral |
| `checkout.html` | checkout transparente em 3 etapas (dados, entrega, pagamento) |
| `assets/js/catalogo.js` | produtos, com **peso e medidas** (usados no frete) |
| `assets/js/config-loja.js` | regras comerciais: parcelamento, desconto Pix, frete grátis, vencimento do boleto |
| `assets/js/carrinho.js` | carrinho (fica salvo no navegador) |
| `assets/js/checkout.js` | lógica do checkout |
| `assets/js/pagamento-cliente.js` | proteção (tokenização) do cartão no navegador |
| `api/frete.js` | `POST /api/frete`: cota o frete em todas as transportadoras ativas |
| `api/pedidos.js` | `POST /api/pedidos`: cria o pedido e a cobrança |
| `api/status.js` | `GET /api/status`: o que está ativo (modo teste etc.) |
| `api/webhooks/pagamento.js` | confirmação de pagamento enviada pelo banco |
| `api/_lib/logistica/` | motor de frete e transportadoras |
| `api/_lib/pagamento/` | provedores de pagamento (simulação e Blue) |

Segurança: o servidor **recalcula tudo** (preço do catálogo, frete cotado de novo, parcelamento conferido). O número do cartão e o CVV **nunca** chegam ao servidor da loja, só um token do banco.

## Publicar na Vercel (conta da loja)

1. Importar o repositório na Vercel.
2. **Root Directory:** `ecomerce` · **Framework Preset:** Other · sem comando de build.
3. Cadastrar as variáveis de ambiente (modelo em `.env.example`).
4. Em Domains, adicionar `azconfort.com.br` e `www.azconfort.com.br`.

## Logística

Cada pedido é cotado em **todas as transportadoras ativas ao mesmo tempo**. O cliente vê as opções ordenadas por preço, com as tags "mais barata" e "mais rápida". Se uma transportadora sair do ar, as outras continuam respondendo.

Ative em `LOGISTICA_TRANSPORTADORAS` (separadas por vírgula):

- **`tabela`**: tabela própria (transportadora parceira, motoboy). Os valores atuais são **exemplos**. Troque pelos negociados com `LOGISTICA_TABELA_JSON` (formato em `api/_lib/logistica/tabela-padrao.js`). Ela já divide o pedido em vários volumes quando passa do limite de peso ou tamanho, e itens grandes (como a bicicleta) só aparecem para a transportadora de volumes grandes.
- **`melhorenvio`**: uma integração que cota **Correios, Jadlog, Loggi, J&T, Azul Cargo** e outras habilitadas na conta. Passos:
  1. Criar a conta da loja no Melhor Envio (com o e-mail e o CNPJ da loja).
  2. Gerar um token em Integrações > Permissões de acesso.
  3. Definir `MELHORENVIO_TOKEN` e testar com `MELHORENVIO_AMBIENTE=sandbox`. Depois mudar para `producao`.

Outras transportadoras (Frenet, Kangu, Correios com contrato próprio, Loggi direto...) entram criando `api/_lib/logistica/transportadoras/<nome>.js` com a mesma interface, como explicado em `api/_lib/logistica/index.js`.

Outras configurações: `LOJA_CEP_ORIGEM` (de onde sai a mercadoria) e `LOGISTICA_DIAS_MANUSEIO` (dias para separar e postar, somados ao prazo).

## Pagamento: checkout transparente

- `PAGAMENTO_PROVEDOR=simulacao` (padrão): não cobra nada. O checkout mostra uma faixa de "ambiente de testes".
- `PAGAMENTO_PROVEDOR=blue`: **engatilhado**. A estrutura está pronta e faltam as chamadas da API da Blue. Os pontos a preencher estão marcados com `TODO(Blue)` em:
  - `api/_lib/pagamento/provedores/blue.js` (Pix, boleto, cartão, webhook)
  - `assets/js/pagamento-cliente.js` (SDK de tokenização do cartão no navegador)

**O que pedir para a Blue:**
1. Documentação da API e acesso ao **ambiente de testes (sandbox)**.
2. Forma de autenticação (OAuth2? certificado digital para Pix?).
3. **Pix dinâmico** com QR Code e "copia e cola", com expiração.
4. **Cartão de crédito com tokenização no navegador** (SDK JavaScript) e parcelamento.
5. **Boleto registrado** (linha digitável + PDF).
6. **Webhooks** de confirmação e como validar a assinatura. URL para cadastrar: `https://azconfort.com.br/api/webhooks/pagamento`
7. Estorno/cancelamento e consulta de status.
8. Taxas por método (para definir parcelamento e desconto no Pix em `config-loja.js`).

## Antes de abrir a loja

- [ ] **Banco de dados para os pedidos.** Hoje os pedidos ficam em memória e somem quando a função reinicia (`api/_lib/armazenamento.js`).
- [ ] **E-mail de confirmação** para o cliente e aviso de novo pedido para a loja.
- [ ] Integração com a **Blue** testada no sandbox (Pix, cartão, boleto e webhook).
- [ ] Frete real: tabela da transportadora parceira e/ou Melhor Envio em produção, com o `LOJA_CEP_ORIGEM` correto.
- [ ] **Peso e medidas reais** de cada produto em `catalogo.js`.
- [ ] Regras comerciais revisadas em `config-loja.js` (parcelas, desconto Pix, frete grátis).
- [ ] Páginas obrigatórias: trocas e devoluções, privacidade (LGPD) e termos de uso. **Razão social, CNPJ e endereço no rodapé** (exigência do Decreto 7.962/2013 para lojas virtuais).
- [ ] Painel para a loja ver pedidos e marcar como enviado (com código de rastreio).

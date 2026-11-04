# Programa de indicação para arquitetos e designers (proposta, não implementado)

> Status (04/11/2026): **ideia para mais à frente.** A página do produto tem uma linha discreta (“É arquiteto ou
> designer de interiores? Peça o arquivo 3D”), que só aparece quando a loja tiver WhatsApp, e-mail ou telefone
> cadastrado em `config/brand.ts` (hoje não tem). Para medir o interesse, falta ligar um provedor de analytics em
> `lib/analytics.ts`: o evento `arquitetos_interesse` já é disparado, mas ainda não é guardado. Se os pedidos
> aparecerem, este é o desenho sugerido.

## Como funcionaria

1. **Cadastro do profissional** (formulário no site): nome, e-mail, WhatsApp, área (arquitetura, design de interiores,
   paisagismo), registro profissional (CAU ou ABD) e, para receber, CNPJ e chave PIX. A equipe aprova no painel.
2. **Link e cupom pessoais**: cada parceiro aprovado ganha um link (ex.: `/?ref=ana-souza`) e um cupom. O link
   guarda o código por 30 dias no navegador do cliente; o cupom serve para quem compra depois, em outro aparelho.
3. **Arquivos do projeto**: o parceiro baixa o bloco 3D e a ficha técnica dos produtos com tamanho real conferido e os
   coloca no projeto, já com o link dele para o cliente comprar.
4. **Pedido marcado**: o pedido guarda o código do parceiro. O painel mostra, por parceiro, os pedidos, o valor e o
   que há a pagar.
5. **Pagamento**: a comissão só vale depois do prazo de troca/devolução (7 dias do recebimento) e é paga uma vez por
   mês por PIX, com nota fiscal do CNPJ do parceiro.

## Atenção antes de lançar: a regra do CAU

- O Código de Ética do CAU/BR (regra 3.2.16, Resolução 52/2013, com base no art. 18, VI, da Lei 12.378/2010) proíbe o
  **arquiteto** de aceitar comissão ou vantagem de fornecedores do cliente — a chamada **reserva técnica**. O CAU/DF
  (Nota Técnica 31/2025) e o CAU/SP (nota de 30/10/2025) reforçaram a proibição, mesmo com o cliente sabendo. O
  Ministério Público já agiu contra programas desse tipo com base no Código de Defesa do Consumidor.
- Grandes lojas pagam mesmo assim (Westwing 10%, Oppa 10%, Tok&Stok 5%), mas o risco é do arquiteto e respinga na loja.
- **Caminhos mais seguros**, para decidir com um advogado:
  - **Desconto para o cliente** em vez de comissão: o cupom do parceiro dá, por exemplo, 5% ao cliente final, e o
    parceiro ganha visibilidade e prioridade no atendimento (não dinheiro).
  - **Comissão só para quem a lei permite**, com transparência: designers de interiores (Lei 13.369/2016 pede
    conduta ética e prestação de contas, sem proibir comissão), com aviso ao cliente na nota/pedido.
- Não achamos documento do CAU que diga, por escrito, que o desconto integral ao cliente é permitido; vale confirmar.

## O que precisaria no código

- Tabela `partners` (cadastro, status, código, dados de pagamento) e coluna `partner_code` no pedido.
- Captura do `?ref=` (cookie de 30 dias) e campo de cupom no checkout.
- Tela no painel: aprovar parceiros, ver pedidos por parceiro e marcar comissões como pagas.
- Página “Seja parceiro” e os termos do programa (LGPD: consentimento e finalidade dos dados).
- Formatos que o arquiteto brasileiro espera: bloco `.skp` (SketchUp) e `.dwg`; o `.obj` leve em milímetros cobre
  Revit, Archicad, 3ds Max e Promob.

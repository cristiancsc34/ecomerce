# Experiência do cliente: auditoria e prioridades (03/11/2026)

Percorri a loja no ar (https://cuxoes.vercel.app) como cliente, no celular (iPhone 13) e no computador: início,
produtos, produto, categoria, busca, sacola, atendimento, entrega, conta e página inexistente.

## Medições

| Item | Resultado |
| --- | --- |
| Acessibilidade (axe, WCAG 2 A/AA) | **0 problemas** nas 10 páginas, no celular e no computador |
| Rolagem lateral no celular | Nenhuma |
| Erros no navegador | Nenhum |
| Carregamento (maior elemento na tela) | 0,2–0,8 s; só a primeira abertura da página inicial no celular levou 2,7 s (servidor “frio”) |

A base técnica está saudável. O que trava a experiência hoje é **conteúdo e caminho de compra**, não código.

## Prioridade 1: hoje o cliente não consegue comprar

| Problema | Por quê importa | O que fazer | Quem |
| --- | --- | --- | --- |
| **Nenhum canal de contato publicado** (WhatsApp, telefone, e-mail, horário). A página de atendimento diz “canais em configuração” | A venda é pelo atendimento: sem canal, não há venda | Informar os canais; entram em `config/brand.ts` e aparecem no atendimento, no rodapé e no acompanhamento do pedido | Dono informa, eu publico |
| **Produtos sem preço** (“Preço em breve”), sem como pôr na sacola | O cliente não sabe quanto custa | Confirmar os preços no painel | Dono |
| **Vitrine em modo demonstração** (`CATALOG_SOURCE=demo`): os produtos reais do painel (ex.: Cadeira preta) não aparecem | A loja mostra só as 2 peças de exemplo | Aprovar fotos, preencher preço e publicar; depois trocar para `supabase` na Vercel | Dono + eu |
| **“Finalizar compra” desativado** | O cliente monta a sacola e para | Proposta: botão **“Finalizar pelo WhatsApp”** que abre a conversa com a sacola pronta (itens, quantidades, valores e CEP). Precisa do número do WhatsApp e do seu ok | Eu, com o seu ok |

## Prioridade 2: confiança e pós-compra

| Problema | O que fazer | Estado |
| --- | --- | --- |
| Depois da compra não havia nada: sem pedido, sem etapas, sem acompanhamento | Painel de pedidos, etapas, aviso no WhatsApp e página “Acompanhar pedido” ([`LOGISTICA.md`](LOGISTICA.md)) | **Feito** (aguarda publicação) |
| Políticas de entrega e de troca com texto genérico (“em preparação”) | Definir regiões, prazos, frete, montagem, troca de 7 dias e avaria (opções em [`LOGISTICA.md`](LOGISTICA.md)) e publicar o texto final | Dono decide |
| Razão social, CNPJ e endereço vazios | Informar; aparecem no rodapé e nas políticas (passam confiança) | Dono informa |
| Frete e prazo só se descobrem conversando | Tabela de entrega por região + “Entregamos no seu CEP” na página do produto e na sacola | Depois das regiões e valores do dono |

## Prioridade 3: ajustes de experiência

| Problema | O que fazer | Estado |
| --- | --- | --- |
| O botão flutuante “Ajuda” cobria o link “Trocas e devoluções” no fim das páginas curtas (sacola, atendimento) | Botão mais baixo fora da página de produto e folga no rodapé | **Feito** |
| Cartões “Todos os ângulos” e “Veja em 3D” na página inicial: pareciam botões e não levavam a lugar nenhum | Removidos (decisão do dono, 03/11/2026); o 3D segue no selo do produto e no bloco escuro | **Feito** |
| “Minha conta” dizia “em breve” | Virou **Acompanhar pedido** (número + celular), com link no rodapé | **Feito** |
| Medidas, material e garantia vazios nos produtos | Preencher só o que foi confirmado com o fabricante (campo vazio não aparece) | Dono |
| Montagem, prazo e frete não aparecem na página do produto | Entram junto com as regras de entrega | Depois das decisões |
| Sem avaliações de clientes | Pedir avaliação no aviso de “Entregue” e exibir na página do produto (fase futura) | Ideia |

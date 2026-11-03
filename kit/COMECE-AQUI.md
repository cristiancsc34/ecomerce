# Comece aqui: sua loja online com IA, pronta em um dia

Este pacote traz uma loja online completa e o roteiro para uma IA (Codex ou Claude) deixá-la com a cara da sua loja e
colocá-la no ar. Você não precisa saber programar: a IA faz o trabalho técnico e te guia nas contas que só você pode
criar.

## O que a loja já faz

- **Vitrine** rápida no celular e no computador: produtos, categorias, busca, sacola, atendimento e políticas.
- **Visualização 3D e realidade aumentada:** o cliente aponta o celular para a sala e vê o produto no tamanho real.
- **Painel administrativo** (`/admin`): cadastro de produtos, preços, variações, fotos, aprovação e publicação.
- **Estúdio de fotos com IA:** você tira 3 fotos no celular (frente, lateral e traseira, fundo qualquer) e a IA:
  - limpa o fundo (~20 s por foto);
  - cria 4 fotos de catálogo no padrão da loja (frente, ¾, lateral e traseira, ~45 s ao todo);
  - escreve nome e descrição vendável (lê as fotos uma vez só e guarda);
  - gera o modelo 3D, se você quiser (~2 min 15 s).
  Nada vai para a loja sem você conferir e aprovar.
- **Assistente de vendas** (opcional): um chat "Ajuda" que responde só com dados do seu catálogo.

Ainda **não** tem checkout, pagamento nem frete: a venda é fechada pelo atendimento (WhatsApp, telefone, e-mail).

## O que você vai precisar

| Conta | Para quê | Obrigatória? |
| --- | --- | --- |
| GitHub | Guardar o código da sua loja | Sim |
| Supabase | Banco de dados, login do painel e fotos | Sim (sem ela, a loja só mostra uma demonstração) |
| Vercel | Colocar o site no ar | Sim |
| OpenAI | Limpeza de fundo, fotos de catálogo e textos | Sim, para o estúdio com IA |
| Tripo | Modelos 3D automáticos | Não |
| Anthropic | Assistente de vendas | Não |

O passo a passo de cada uma (com links e custos medidos) está em [`kit/GUIA-DE-CHAVES.md`](kit/GUIA-DE-CHAVES.md).

## Os 3 passos

1. **Preencha o briefing:** abra [`kit/BRIEFING-DA-LOJA.md`](kit/BRIEFING-DA-LOJA.md) e responda o que souber (nome,
   cores, contatos, categorias, políticas). O que faltar, a IA pergunta.
2. **Abra esta pasta no Codex ou no Claude Code** e cole a mensagem de [`PROMPT-INICIAL.md`](PROMPT-INICIAL.md).
3. **Siga a IA:** ela troca a marca, as cores e os textos, roda os testes e, quando precisar de uma conta ou chave, diz
   exatamente onde clicar. No fim, ela confere tudo com `npm run config:verificar` e te entrega a loja no ar.

## Regras que a IA segue (e você também deveria)

- **Nada inventado:** preços, medidas, materiais e garantias vêm só de você. Campo vazio não aparece na loja.
- **Chave secreta nunca vai para o código** nem para o GitHub. Ela fica só na Vercel e no arquivo `.env.local` da sua
  máquina.
- **Antes de publicar** no endereço oficial, a IA pede a sua confirmação.

## Quanto custa usar a IA (medido neste projeto)

| Item | Custo |
| --- | --- |
| 4 fotos de catálogo de um produto | ~US$ 0,35 (~US$ 0,08 por imagem) |
| Modelo 3D (Tripo) | ~US$ 0,30 por produto |
| Nome e descrição | centavos (uma vez por produto) |
| Assistente de vendas | ~US$ 0,10 a cada mil mensagens |

Os planos da Vercel e do Supabase têm faixa gratuita para começar. Para uma loja que vende, confira os termos:
o plano gratuito da Vercel (Hobby) é para uso pessoal, não comercial. Detalhes no guia de chaves.

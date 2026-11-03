# Instruções para a IA deste projeto

Este projeto é um **kit de loja online** para ser adaptado a uma loja nova. Se a loja ainda não foi configurada,
comece por [`kit/PLAYBOOK.md`](kit/PLAYBOOK.md) e siga as fases na ordem; os dados da loja estão em
[`kit/BRIEFING-DA-LOJA.md`](kit/BRIEFING-DA-LOJA.md).

- **Idioma:** fale com o dono em português do Brasil, de forma simples (mensagens, commits e documentação).
- **Não inventar:** use só o que o dono enviar (fotos, produtos, dados). Nada de preços, medidas, materiais, garantias
  ou objetos que não existem. Nas imagens geradas, o produto não muda e nenhum outro objeto é acrescentado.
- **Mudanças de direção** (ex.: estilo das fotos, visual da loja) só depois do “ok” do dono; antes, traga opções para
  comparar.
- **Contas:** use só as contas indicadas pelo dono (briefing, seção 9). Se um conector ou token estiver ligado a outra
  conta, não use e avise.
- **Segredos:** chaves só no `.env.local` e na Vercel (Sensitive). Nunca no código, no Git, em `NEXT_PUBLIC_*` ou nas
  suas respostas.
- **Publicação:** peça confirmação antes de publicar no endereço oficial.
- **Testes:** nunca apague ou desligue um teste para passar; rode `npm run check` antes de cada entrega.

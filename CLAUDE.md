# Instruções do dono do projeto

- **Idioma:** sempre se comunicar em português do Brasil — mensagens, legendas de arquivos enviados, textos dentro de
  imagens, commits e documentação.
- **Não inventar:** usar só o que o dono enviar (fotos, produtos, dados). Nada de preços, medidas, materiais ou objetos
  que não existem; nas imagens geradas, o produto não muda e nenhum outro móvel/objeto é acrescentado.
- **Mudanças de direção** (ex.: estilo das fotos) só depois do “ok” dele; antes, pesquisar referências do mercado e
  trazer opções para comparar.
- **Contas:** usar só as contas do Cristian (Vercel `cristians-projects-006bedc2`, projeto `cuxoes`). **Nunca mexer na
  conta Atlas** (“atlas-solucoes-digitais”), nem em Vercel nem em Supabase, mesmo que um conector desta sessão esteja
  ligado a ela.

## Loja AzConfort — como trabalhar no backlog

Loja: [www.azconfort.com.br](https://www.azconfort.com.br). Branch base de todo o trabalho: `claude/azconfort-loja-real`.

### Fluxo de issues e PRs

- **Uma issue por vez.** Cada issue vai numa branch `az/<nome>` e num PR contra `claude/azconfort-loja-real`.
- **Nunca** trabalhar direto na `main`, **nunca** fazer merge na `main` e **nunca** fazer deploy de produção.
- O PR é escrito em **português** e traz:
  - `Closes #N`;
  - o que mudou;
  - como testar;
  - o link da prévia da Vercel.
- **Antes de abrir cada PR, rodar o teste de aceitação da issue** e informar o resultado no PR.
- Ao terminar cada issue: parar e mandar o link do PR ao Cristian antes de começar a próxima.

### Ordem do backlog (`az-backlog`)

`#1 → #2 → #3 → #4 → #7 → #8 → #9 → #10 → #11`

- **Pular as issues BLOQUEADO:** #6, #12 e #13.
- **Não fazer nada de guia visual nem de 3D** até o Cristian aprovar.

### O que exige o “ok” do Cristian antes

Não mexer, sem aprovação explícita, em:

- preço, frete, estoque ou pagamento;
- variáveis de ambiente;
- migrations;
- DNS.

### Dados reais, nada inventado

- **Nunca inventar** preço, prazo, medida, avaliação, depoimento, selo ou dado da empresa.
- **Campo sem dado real fica escondido** (não mostrar placeholder, “em breve”, número fictício etc.).

### Segredos

- **Nunca** colocar chave, token ou segredo no código, em commit ou no texto do PR.

### Nomes técnicos (issue #3 — marca unificada)

Alinhar a marca **não** inclui renomear nomes técnicos. Ficam como estão:

- projeto Supabase `cuxoes`;
- bucket `product-media`;
- chaves `cuxoes:` guardadas no navegador (localStorage/sessionStorage).

### Fotos

- Toda foto precisa de **texto alternativo** (`alt`) descritivo.
- Toda foto precisa ter **pelo menos 500 px de lado**.

Ver também [`AGENTS.md`](AGENTS.md) (regras do Next.js deste projeto).

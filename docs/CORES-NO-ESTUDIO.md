# Cores no Estúdio

> Status (08/11/2026): **ativo**. O código está no ar desde 07/11, e as migrações
> `20261105000100_cores_tipo_de_tarefa.sql` e `20261105000200_cores.sql` foram aplicadas em 08/11/2026 no Supabase do
> Cristian (projeto `cuxoes`), uma de cada vez, pela API de gerenciamento. O passo Cores ligou sozinho, sem publicar o
> código de novo.
>
> Histórico: de 05 a 07/11, o canal de gerenciamento do Supabase recusou a senha das contas internas do projeto
> (`postgres` e `supabase_admin`). Isso travou as consultas SQL, as migrações e a troca de senha pela API, enquanto a
> loja, o login e as fotos seguiram funcionando. Em 08/11 voltou ao normal sem nenhuma mudança da nossa parte. Nesse
> intervalo, o painel funcionou em “modo seguro”: a etapa Cores ficou como “aguardando a atualização do banco”.

Outra cor do mesmo produto, feita pelo GPT a partir das fotos de catálogo já aprovadas. Fica no Estúdio do painel,
**etapa 5. Cores (opcional)**, depois do 3D e dos textos. Nunca entra no modo automático: cada cor custa e precisa de
uma cor escolhida pela pessoa.

## Como usar

1. **Aprovar as fotos de catálogo** (etapa 2). Elas são a base: uma por ângulo (frente, três-quartos, lateral,
   traseira; a mais recente de cada ângulo, se o catálogo foi gerado mais de uma vez).
2. **Pedir a cor**: nome (ex.: “Linho bege”) e a cor do tecido, pelo seletor da tela ou digitada como `#RRGGBB` ou
   `R, G, B` (ex.: `205, 183, 151`). Botão **“Gerar fotos nesta cor”**: o GPT (mesma `OPENAI_API_KEY` das fotos de
   catálogo, na Vercel) troca só a cor do tecido em cada foto, os ângulos ao mesmo tempo. Cerca de 1 minuto e
   **~US$ 0,35 por cor** (4 fotos). Uma cor por vez em cada produto, com limite de pedidos por hora.
3. **Conferir foto por foto**: antes × depois em cada ângulo, com a **cor medida no tecido** e avisos quando:
   - a foto quase não mudou de cor;
   - a cor medida está longe da pedida (ΔE > 15);
   - a foto mudou demais (talvez o GPT tenha refeito o fundo, a madeira ou a peça).

   Os avisos são só ajuda: o que garante que a peça é a mesma é a conferência da pessoa. Desmarque a foto que não
   estiver boa.
4. **Publicar a cor**: preço (obrigatório) e estoque da cor. Na **primeira cor**, também a **cor atual** do produto
   (nome, cor e preço), que entra em primeiro lugar: a cor das fotos originais. O painel já preenche a cor atual
   medida nas fotos; ajuste para a do tecido de verdade. A confirmação só libera com a caixa
   “Conferi cada foto com a original: é a mesma peça (formato, madeira, peças e acabamento), nada foi acrescentado e só
   o tecido mudou de cor.”

Ao publicar, num passo só no banco (`publish_color_variant`): cria as variações, aprova as fotos escolhidas (o banco
registra quem aprovou e quando) e liga as fotos à cor. As fotos não escolhidas são apagadas. Na loja, o seletor
**“Cor”** aparece sozinho na página do produto, e as fotos da cor levam o selo “Imagem ilustrativa” até chegar a foto
real. **“Descartar estas fotos”** apaga as fotos geradas e a tarefa.

## Regras

- **Só cores que a loja realmente vende** (tecido disponível com o fornecedor). Nome, cor e preço vêm da pessoa: o
  painel não inventa nenhum.
- **A foto da loja é a do próprio GPT** (escolha do Cristian em 04/11/2026, comparando com a versão repintada), por
  isso a conferência por pessoa é obrigatória. Antes de publicar, nada aparece na loja: as fotos nascem sem aprovação
  e a cor só existe depois de publicada (não existe variação oculta).
- A primeira cor da lista é a das fotos originais do produto.
- Cores e tamanhos no mesmo produto ainda não são possíveis: com variações sem cor, o passo avisa e não deixa pedir.
- Foto de cor é sempre ilustrativa e nunca a foto principal (o banco garante).
- Nome repetido (comparado como no link `?cor=`, sem acento nem maiúsculas) é recusado.
- Editor só trabalha em produto em rascunho ou revisão; em produto publicado, só o administrador (como o resto do
  Estúdio). Tudo fica na área “itens” do painel.
- Depois de publicar, confira se o **nome e a descrição** do produto citam a cor antiga (ex.: “Poltrona Azul”).

## O que o sistema protege

- Gerar as fotos de catálogo de novo **não apaga** as fotos de cor ainda não publicadas.
- Pedir a mesma cor de novo troca as fotos dela que ninguém publicou (as publicadas ficam).
- Falha no meio (ex.: a OpenAI recusa um ângulo): nenhuma foto é gravada e nenhum arquivo sobra.
- Foto de origem apagada ou trocada entre o pedido e o processamento: a tarefa falha com aviso, sem gastar o GPT.
- **Tirar a cor em “Preço e estoque” apaga as fotos dela** (sem isso, elas virariam fotos da cor atual). O arquivo no
  Storage fica (limpeza futura).
- **Formulário aberto enquanto a cor é publicada**: as cores novas entram no formulário (salvar não as apaga). Um
  formulário velho (outra aba, outra pessoa) é recusado pelo banco: “O produto mudou desde que você abriu esta
  página… Recarregue a página para não perder nada.” (`save_product` com `expectedUpdatedAt`).
- Dois cliques em “Publicar” (ou duas abas): uma publicação por vez em cada produto; a segunda recebe “Alguma foto
  escolhida não é desta cor ou já foi publicada.”
- Nome da cor comparado como no link `?cor=`: “Café” e “cafe” são a mesma cor.
- Produto duplicado: as fotos de catálogo da cópia são as do original; o passo pede para gerar as fotos de catálogo
  da cópia antes de criar cores.
- Duplicar o produto: as fotos de IA ainda sem conferência ficam de fora da cópia (antes iam como fotos comuns), as
  aprovadas seguem aprovadas, e cada foto de cor segue a cor correspondente da cópia. O 3D leva o arquivo do iPhone e o
  tamanho real conferido.
- Se o código chegar ao ar antes da migração, a fila da nuvem ignora as cores em vez de parar.

## Limitações conhecidas

- **3D**: a cor nova usa o modelo do produto pintado na hora (`setBaseColorFactor`), que multiplica a textura: fica
  aproximado, mais escuro em tecido escuro. Próximo passo: gerar no servidor uma variante do modelo
  (`KHR_materials_variants`) com a textura do tecido repintada, como no exemplo de desenvolvimento.
- **AR da cor**: sem modelo próprio, a câmera abre pelo 3D da tela (pode pedir o segundo toque em rede lenta).
- Medir a cor por **foto da amostra do tecido** ainda não existe (só seletor, `#RRGGBB` ou RGB).
- Ligar uma **foto real** a uma cor (para substituir a ilustrativa) ainda não existe no painel.
- O processador local (opcional) só funciona com as migrações das Cores aplicadas no banco. No `cuxoes`, já estão
  aplicadas desde 08/11/2026.
- “Fotos na loja” mostra as fotos de cor junto das outras; as ações de foto principal e “ilustrativa” não valem para
  elas (o banco recusa com aviso).
- Aplicar as migrações uma de cada vez (a primeira cria o tipo de tarefa; a segunda usa esse tipo e não pode estar na
  mesma transação).

## Onde está no código

- Banco: `supabase/migrations/20261105000100_cores_tipo_de_tarefa.sql` (tipo `color_variant`) e
  `20261105000200_cores.sql` (`ai_jobs.params`, `product_media.color_job_id`, `publish_color_variant`, apagar as fotos
  junto com a cor, `duplicate_product`).
- Processador: `colorVariant` em `scripts/ai-pipeline.mjs` (nuvem e processador local) e a medição em
  `scripts/cores.mjs`.
- Painel: `lib/admin/actions/colors.ts` (pedir, publicar, descartar), `lib/admin/colors.ts` (regras),
  `components/admin/color-studio.tsx` (tela), etapa “Cores” em `lib/admin/pipeline.ts`.
- Testes: `tests/db/cores.test.ts` (banco), `tests/unit/cores-processador.test.ts` (processador),
  `tests/unit/cores-regras.test.ts` (regras e medição), `tests/unit/admin-actions-auth.test.ts` (permissões).
- Exemplo de desenvolvimento (Poltrona Azul em 5 cores): `npm run demo:variantes:gpt`, ver
  [`IA-E-3D.md`](IA-E-3D.md).

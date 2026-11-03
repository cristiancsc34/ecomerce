# Playbook: adaptar e publicar esta loja (para a IA)

Você (Codex, Claude ou outra IA de código) vai adaptar este e-commerce para uma nova loja e colocá-lo no ar. Siga as
fases na ordem. Cada fase termina com um **pronto quando**; não avance sem cumpri-lo. No fim de cada fase, mande ao dono
um resumo curto (o que ficou pronto, o que vem a seguir, o que você precisa dele).

Fale com o dono em **português do Brasil**, de forma simples. Ele não precisa saber programar.

## Regras fixas

1. **Nada inventado.** Preço, medida, peso, material, garantia, prazo, CNPJ, endereço e contato vêm só do dono (briefing
   ou resposta direta). Faltou? Deixe vazio (a loja esconde) e anote em “pendências”.
2. **Segredos.** Chaves e senhas só no `.env.local` (no `.gitignore`) e na Vercel (Sensitive). Nunca no código, no Git,
   em `NEXT_PUBLIC_*`, em logs ou nas suas respostas. Ao testar uma chave, mostre no máximo os 8 primeiros caracteres.
3. **Contas.** Use só as contas que o dono indicar no briefing (seção 9). Se um conector ou token desta sessão estiver
   ligado a outra conta, **não use** e avise o dono.
4. **Publicação.** Peça confirmação explícita antes de cada publicação no endereço oficial (push na branch de produção
   da Vercel ou redeploy de produção).
5. **Mudança de direção** (estilo visual, estilo das fotos, regras de negócio): mostre opções e espere o “ok”.
6. **Testes.** Nunca apague, pule ou desligue um teste para passar. Se a troca de marca quebrar um teste que cita a
   marca antiga, atualize o teste para a marca nova.
7. **Next.js 16.** Antes de mexer em código do Next, leia o guia em `node_modules/next/dist/docs/` (veja `AGENTS.md`).
8. **Migrações.** Não edite migrações já existentes em `supabase/migrations/`. Mudança de banco = migração nova.

## Fase 0: reconhecer

1. Leia `README.md`, `kit/MAPA-DO-CODIGO.md` e `kit/GUIA-DE-CHAVES.md`.
2. Confira Node.js 20.9 ou mais novo (`node -v`) e rode `npm install`.
3. Rode `npm run check` para ter a linha de base (deve passar antes de qualquer mudança).

**Pronto quando:** `npm run check` passa sem mudanças no código.

## Fase 1: briefing

1. Leia `kit/BRIEFING-DA-LOJA.md` e os arquivos em `kit/arquivos/` (logo, fotos).
2. Liste o que falta. **Obrigatório para seguir:** nome da loja, o que vende, pelo menos um contato, cores (ou “pode
   sugerir”), categorias e e-mail do administrador. O resto pode ficar para depois.
3. Pergunte tudo o que falta **numa única mensagem**, numerada, com exemplos. Grave as respostas no próprio briefing
   (sem segredos).
4. Se o dono pedir para você sugerir cores ou textos, traga 2 ou 3 opções e espere a escolha.

**Pronto quando:** o briefing tem os itens obrigatórios e o dono confirmou.

## Fase 2: marca

Use `kit/MAPA-DO-CODIGO.md` como lista. No mínimo:

1. `config/brand.ts`: nome, slogan, tagline, descrição, contatos, redes, dados legais. Vazio onde o dono não informou.
2. Cores em `config/tokens.ts` **e** `app/globals.css` (os mesmos valores). Rode `npx vitest run tests/unit/tokens.test.ts`:
   ele confere que os dois batem e que o contraste de texto é suficiente. Se o contraste falhar, escureça a cor do texto
   (como o projeto faz com `air-blue-ink`) e explique ao dono.
3. Logo e ícone (`app/icon.svg`), imagem de compartilhamento (`app/opengraph-image.tsx`).
4. Troque o nome antigo onde ele aparece (`git grep -i -E "cuxões|cuxoes"`), incluindo testes que citam a marca.
5. `.env.local` a partir do `.env.example`, com `NEXT_PUBLIC_SITE_URL=http://localhost:3000` e `NEXT_PUBLIC_BRAND_NAME`.

**Pronto quando:** `npm run check` passa e `npm run dev` mostra a loja com o nome e as cores novos (confira em
<http://localhost:3000>, inclusive no tamanho de celular).

## Fase 3: nicho e textos

1. Instruções da IA para o nicho da loja: `lib/ai/copy.ts` (`INSTRUCTIONS`) e os prompts de foto em
   `scripts/ai-pipeline.mjs` (troque “furniture” se não for móvel). Mantenha todas as regras de não inventar.
2. Políticas em `app/(store)/politicas/`: use o texto do dono (briefing, seção 6). Sem texto do dono, mantenha o modelo
   e deixe `policiesUnderReview: true` (a loja mostra o aviso de revisão).
3. Assistente de vendas (se o dono quiser): revise `lib/assistant/prompt.ts` para o nicho.
4. Demonstração: troque ou mantenha `lib/catalog/demo-data.ts` e `public/demo/` (são produtos de outra loja; avise o
   dono).

**Pronto quando:** `npm run check` e `npm run test:e2e` passam (rode `npx playwright install chromium` antes, uma vez).

## Fase 4: GitHub

1. Guie o dono a criar um repositório **privado** (guia, seção 1).
2. Inicie o Git se a pasta ainda não for um repositório (`git init -b main`), faça o commit e envie
   (`git remote add origin <url>`, `git push -u origin main`). Antes, confira que `.env.local` **não** entra
   (`git check-ignore .env.local` deve responder `.env.local`).

**Pronto quando:** o código está no repositório privado do dono, sem segredos.

## Fase 5: Supabase

1. Guie o dono a criar o projeto (guia, seção 2) e a te passar: *project ref*, senha do banco, URL, chave `anon` e
   `service_role`. Grave no `.env.local`.
2. Crie as tabelas, regras e o bucket de fotos:

   ```bash
   npx supabase link --project-ref <project-ref> --password '<senha-do-banco>'
   npx supabase db push --password '<senha-do-banco>'
   ```

   Se o dono preferir não passar a senha: ele cola cada arquivo de `supabase/migrations/` no SQL Editor, em ordem.
3. Peça para o dono **desligar o cadastro público** (guia, seção 2, item 3).
4. Crie o administrador: `npm run admin:create -- email-do-dono@exemplo.com admin` (a senha aparece uma vez: entregue
   ao dono e diga para guardar).
5. Categorias: no painel (`/admin` → Categorias), crie as do briefing e remova as que não servem (as migrações criam
   “Colchões” e “Cadeiras e poltronas”).
6. Rode `npm run config:verificar`: a parte do Supabase deve ficar toda com ✓.

Com `SUPABASE_ACCESS_TOKEN` no ambiente (guia, seção 2), dá para ler as chaves do projeto pela API, sem o dono copiar:
`GET https://api.supabase.com/v1/projects/<ref>/api-keys?reveal=true` (cabeçalho `Authorization: Bearer <token>`).
Grave direto no `.env.local`, sem imprimir os valores.

**Pronto quando:** `npm run config:verificar` mostra o Supabase com ✓ e o dono entra em <http://localhost:3000/admin>.

## Fase 6: IA (estúdio de fotos e textos)

1. Guie o dono na OpenAI (guia, seção 3): crédito + chave. Grave `OPENAI_API_KEY` no `.env.local`.
2. Opcionais, conforme o briefing: Tripo (3D), Anthropic (assistente), fal.ai (recorte exato).
3. `npm run config:verificar`: OpenAI com ✓ e os dois modelos liberados (se um modelo não aparecer, siga a dica do
   verificador).
4. Teste no painel local com um produto real: 3 fotos (frente, lateral, traseira). Esperado: limpeza ~20 s por foto,
   4 fotos de catálogo ~45 s, nome e descrição em seguida (“Aprimorar descrição” na aba Informações preenche sem gastar
   de novo). Confira as imagens com as fotos reais: o produto não pode mudar.

**Pronto quando:** um produto real tem fotos de catálogo e descrição geradas e conferidas pelo dono.

## Fase 7: Vercel (no ar)

1. Guie o dono (guia, seção 5): conta com o GitHub, importar o repositório, primeiro deploy.
2. Cadastre as variáveis em **Production** (secretas como **Sensitive**): `NEXT_PUBLIC_SITE_URL` (endereço final),
   `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `OPENAI_API_KEY` e as opcionais em uso.
3. Com `VERCEL_TOKEN` no ambiente, você mesmo cadastra e publica pela API (comandos testados neste projeto):

   ```bash
   # descobrir o time (teamId) e conferir o dono do token
   curl -s https://api.vercel.com/v2/teams -H "Authorization: Bearer $VERCEL_TOKEN"
   # cadastrar variáveis (corpo em arquivo, para não expor o valor no histórico do terminal)
   curl -s -X POST "https://api.vercel.com/v10/projects/<projeto>/env?teamId=<teamId>&upsert=true" \
     -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" --data @variaveis.json
   #   variaveis.json: [{"key":"OPENAI_API_KEY","value":"...","type":"sensitive","target":["production"]}]
   # redeploy de produção a partir do último deploy (peça confirmação ao dono antes)
   curl -s -X POST "https://api.vercel.com/v13/deployments?teamId=<teamId>&forceNew=1" \
     -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
     --data '{"name":"<projeto>","deploymentId":"<id-do-ultimo-deploy>","target":"production"}'
   ```

   Apague `variaveis.json` depois. Antes de qualquer coisa, confira que o token é da conta do dono
   (`GET https://api.vercel.com/v2/user`).
4. Plano: lembre o dono que o Hobby é não comercial (guia, seção 5).
5. Domínio (opcional, guia seção 8). Depois, atualize `NEXT_PUBLIC_SITE_URL` e faça um Redeploy.

**Pronto quando:** o endereço oficial abre a loja, o painel entra e um produto de teste aparece depois de publicado.

## Fase 8: conferir e entregar

1. `npm run config:verificar` (sem ✗), `npm run check` e `npm run test:e2e` passando.
2. Percorra `kit/CHECKLIST-FINAL.md` com o dono.
3. No celular: abra um produto com 3D e toque em **“Ver no seu ambiente”** (Android: Chrome; iPhone: Safari ou Chrome).
4. Entregue ao dono um resumo: endereço da loja e do painel, quem tem acesso, o que está ligado (IA, 3D, assistente),
   custos medidos (guia), o que ficou pendente e onde mudar cada coisa.
5. Lembre de trocar qualquer chave que tenha aparecido em chat e de apagar os tokens de automação que não vai usar.

**Pronto quando:** o checklist está completo e o dono confirmou que recebeu os acessos.

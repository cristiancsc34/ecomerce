# Cuxões — loja de colchões (MVP)

Loja online responsiva para colchões e produtos de descanso, com painel administrativo seguro e base pronta para
pagamento, frete, IA de imagens e visualização 3D (sem fingir que essas integrações já existem).

A especificação completa está em [`SPEC-MVP-CUXOES.md`](SPEC-MVP-CUXOES.md). “Cuxões” é um nome provisório: troque em
[`config/brand.ts`](config/brand.ts).

## Estado atual

| Área | Situação |
| --- | --- |
| Vitrine estilo marketplace (abre direto na grade de produtos, busca, produto com barra de compra e 3D, categorias, sacola, atendimento, políticas) | ✅ Pronta |
| Painel administrativo (login, produtos, variações, mídia, status, pré-visualização, categorias, auditoria) | ✅ Pronto (exige Supabase) |
| Banco (Postgres/Supabase) com RLS, Storage, regras de publicação e auditoria | ✅ Migração versionada e testada |
| Modo demonstração (sem banco) com 3 produtos ilustrativos | ✅ Identificado em toda a loja, `noindex` |
| Visualizador 3D sob demanda (GLB) | ✅ Prova de conceito com modelo ilustrativo |
| Assistente de vendas (chat “Ajuda”) | ✅ Claude Haiku, só com dados do catálogo, com trava contra preço/medida/prazo inventados — liga com `ANTHROPIC_API_KEY` ([`docs/ASSISTENTE.md`](docs/ASSISTENTE.md)) |
| Avisos de pedido (WhatsApp e e-mail) | 🧱 Estrutura pronta e testada (mensagens, fila idempotente, novas tentativas); falta checkout e provedor ([`docs/NOTIFICACOES.md`](docs/NOTIFICACOES.md)) |
| Checkout, pagamento, frete | ⏳ Não implementado: depende da escolha dos provedores ([decisões pendentes](docs/DECISOES.md)) |
| Estúdio de fotos e 3D no painel | ✅ Fotos do celular com limpeza de fundo automática (modelos abertos, locais) — [`docs/ESTUDIO-IA.md`](docs/ESTUDIO-IA.md). Fotos de catálogo recriadas por IA (4 ângulos padrão, com conferência humana) e nome/textos sugeridos pelo ChatGPT. 3D pela API do Tripo a partir das fotos de catálogo. |

**Nada aqui é dado comercial real.** Os produtos “Nuvem Essencial”, “Brisa Premium” e “Sereno Híbrido” são
placeholders: preço, firmeza e altura são ilustrativos, materiais/garantia/cuidados estão vazios de propósito e o banco
impede que sejam publicados.

## Stack

- **Next.js 16** (App Router, Cache Components, Partial Prerendering) + **TypeScript**
- **Tailwind CSS 4** com tokens da marca em [`app/globals.css`](app/globals.css) e [`config/tokens.ts`](config/tokens.ts)
- **Supabase** (Postgres + Auth + Storage), acessado só com a chave pública + RLS
- **Zod** + **React Hook Form** (o mesmo esquema valida no navegador e no servidor)
- **Vitest** (regras, RLS em Postgres embutido) e **Playwright** (E2E + acessibilidade com axe)
- Deploy pensado para **Vercel**

## Começando (modo demonstração, sem banco)

Requisitos: Node 22+ e npm.

```bash
npm ci
npm run dev
```

Abra <http://localhost:3000>. Sem Supabase configurado, a loja roda em **modo demonstração**: aviso no topo, produtos
ilustrativos e nada indexável. O painel (`/admin`) mostra como conectar o banco.

## Variáveis de ambiente

Copie [`.env.example`](.env.example) para `.env.local`.

| Variável | Pública? | Para quê |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | sim | URL canônica (SEO, sitemap, Open Graph) |
| `NEXT_PUBLIC_BRAND_NAME` | sim | Nome da marca (padrão: Cuxões) |
| `CATALOG_SOURCE` | não | `demo` ou `supabase`. Vazio: Supabase se configurado, senão demonstração |
| `NEXT_PUBLIC_SUPABASE_URL` | sim | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | Chave pública (anon/publishable). Segura por causa do RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **não** | Só para `npm run admin:create` na sua máquina. **Nunca** na Vercel |
| `ADMIN_PIN`, `ADMIN_PIN_EMAIL`, `ADMIN_PIN_PASSWORD` | **não** | Entrada no painel por PIN (veja [`docs/PAINEL.md`](docs/PAINEL.md)). Vazio = só e-mail e senha |
| `IMAGE_AI_*`, `THREE_D_MODEL_*`, `PAYMENT_*`, `EMAIL_*` | não | Reservadas para integrações futuras. Não configure ainda |

`NEXT_PUBLIC_*` vai para o navegador: nunca coloque segredos com esse prefixo. Se um segredo vazar para o Git,
revogue/rotacione a chave — apagar o commit não basta.

## Banco de dados (Supabase)

### Local (recomendado para desenvolver e testar)

Requer Docker.

```bash
npm run db:start          # Postgres, Auth, REST e Storage locais
npm run db:reset          # aplica supabase/migrations + supabase/seed.sql
npx supabase status -o env  # mostra API_URL, ANON_KEY e SERVICE_ROLE_KEY
```

Preencha `.env.local` com esses valores (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) e crie o primeiro administrador:

```bash
npm run admin:create -- voce@empresa.com admin     # ou "editor"
```

A senha é gerada e mostrada uma vez (ou defina `ADMIN_PASSWORD=...` antes do comando). Entre em
<http://localhost:3000/admin>.

### Projeto hospedado (produção)

1. Crie um projeto no [Supabase](https://supabase.com/dashboard) (região São Paulo, `sa-east-1`, é a mais próxima).
   > Contas gratuitas têm limite de 2 projetos ativos por organização.
2. Aplique as migrações: `npx supabase link --project-ref <ref>` e `npx supabase db push`
   (ou cole `supabase/migrations/*.sql` no SQL Editor, em ordem). O bucket `product-media` é criado pela migração.
3. **Desligue o cadastro público:** Authentication → Sign In / Providers → desative “Allow new users to sign up”
   (mantenha o provedor de e-mail ligado, senão ninguém consegue entrar).
4. Crie o administrador com `npm run admin:create` (usando a URL e a service role do projeto **só no seu
   `.env.local`**).
5. Opcional: rode `supabase/seed.sql` no SQL Editor para ter os 3 produtos de demonstração (ficam em rascunho).

Papéis: **admin** publica, arquiva, exclui e converte demonstração; **editor** cria e edita rascunhos e envia para
revisão. As regras valem no banco (RLS + triggers), não só na interface.

## Cadastrando os produtos reais

1. Painel (`/admin`) → **Novo produto**: só nome e categoria. O rascunho abre na aba **Fotos e 3D**.
2. Envie as fotos do celular no estúdio (fundo limpo, fotos de catálogo e 3D) ou fotos prontas, cada uma com
   descrição. Marque “ilustrativa” quando não for foto real.
3. Preencha as abas **Informações**, **Preço** e **Detalhes** só com dados **confirmados** com o fabricante. Campo
   vazio = não aparece na loja.
4. Siga o painel **Pronto para vender** (as mesmas regras que o banco usa) e confira a **pré-visualização**.
5. Um administrador publica. Guia completo: [`docs/PAINEL.md`](docs/PAINEL.md).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run lint` / `npm run typecheck` | ESLint e TypeScript |
| `npm test` | Testes de regras + RLS em Postgres embutido (sem Docker) |
| `npm run test:integration` | RLS e Storage contra o Supabase local (`SUPABASE_INTEGRATION=1`) |
| `npm run test:e2e` | E2E da vitrine em modo demonstração (desktop e celular) + acessibilidade |
| `npm run test:e2e:supabase` | E2E do painel contra o Supabase local |
| `npm run check` | lint + typecheck + testes |
| `npm run db:start` / `db:reset` / `db:stop` | Supabase local |
| `npm run admin:create -- email [admin\|editor]` | Cria/atualiza conta da equipe |
| `npm run demo:assets` | Regera as ilustrações e o modelo 3D de demonstração |

Na primeira vez em uma máquina nova, rode `npx playwright install chromium` antes dos testes E2E.

## Deploy (Vercel)

**No ar (modo demonstração):** https://cuxoes.vercel.app — projeto `cuxoes` na Vercel, ligado a este repositório;
cada push na branch de produção (`claude/quirky-maxwell-xkyvq6`) publica sozinho. Sem Supabase, mostra só os dois
produtos reais cadastrados pelo estúdio (Poltrona Azul com 3D e Cadeira Cinza Trama), com fotos de catálogo aprovadas e
"Preço em breve" até o preço ser confirmado. O painel online depende do Supabase na nuvem.

1. Importe o repositório na Vercel (framework Next.js detectado automaticamente).
2. Variáveis: `NEXT_PUBLIC_SITE_URL` (URL final), `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   Sem as do Supabase, o deploy sobe em modo demonstração.
3. Cada pull request gera um *preview deploy*; promova a produção só depois de revisar.
4. Depois de trocar dados direto no banco (fora do painel), a vitrine atualiza em até 1 hora; pelo painel é na hora.

## Estrutura

```
app/
  (store)/            vitrine: home (grade de produtos), produtos, categorias, busca, carrinho, atendimento, políticas
  admin/              login e painel (rotas protegidas)
  api/cart/quote/     recálculo da sacola no servidor
components/           ui, layout, product, catalog, cart, admin, seo
config/               marca (brand.ts), tokens de cor, ambiente
content/              FAQ da loja
lib/
  catalog/            tipos, filtros/busca, demo, repositório, consultas em cache
  admin/              leituras e Server Actions do painel
  validation/         esquemas Zod (formulário, banco, publicação)
  supabase/ auth/ media/ cart/ seo/
supabase/             migrações, seed e config local
scripts/              criar admin, gerar assets de demonstração
tests/                unit, db (RLS/PGlite), integration, e2e, e2e-supabase
docs/                 segurança, decisões, referências de UX, IA e 3D
```

## Documentação

- [Painel da loja: acesso por PIN, telas e cadastro](docs/PAINEL.md)
- [Checklist de segurança](docs/SEGURANCA.md)
- [Decisões, integrações pendentes e limitações conhecidas](docs/DECISOES.md)
- [Referências de UX pesquisadas](docs/REFERENCIAS-UX.md)
- [Estúdio de fotos e 3D: instalar e rodar o processador de IA](docs/ESTUDIO-IA.md)
- [Assistente de vendas com IA (Claude Haiku)](docs/ASSISTENTE.md)
- [Avisos de pedido por WhatsApp e e-mail: estrutura e opções de provedor](docs/NOTIFICACOES.md)
- [Plano de IA (imagens/descrições) e 3D](docs/IA-E-3D.md)
- [Próxima fase: foto suja → foto limpa → 3D → legenda no painel](docs/PROXIMA-FASE-IA-3D.md)

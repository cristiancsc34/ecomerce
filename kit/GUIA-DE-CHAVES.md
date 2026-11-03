# Guia de contas e chaves

Onde criar cada conta, onde fica cada chave e em qual variável ela entra. Os nomes de menu são os do painel de cada
serviço em outubro de 2026; se algo mudou de lugar, procure pelo nome da chave.

**Regra de ouro:** chave secreta fica **só** em dois lugares, a Vercel (Settings → Environment Variables, marcada como
**Sensitive**) e o arquivo `.env.local` na sua máquina (que nunca vai para o Git). Nunca coloque segredo numa variável
que começa com `NEXT_PUBLIC_`: essas vão para o navegador de qualquer visitante.

Depois de preencher, confira tudo de uma vez:

```bash
npm run config:verificar
```

## Resumo

| Variável | Onde pegar | Obrigatória? | Pública? |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | O endereço da loja (ex.: `https://minhaloja.com.br`) | Sim | sim |
| `NEXT_PUBLIC_BRAND_NAME` | O nome da loja | Sim | sim |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL | Sim | sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → Legacy API Keys → `anon` | Sim | sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → Legacy API Keys → `service_role` | Sim | **não** |
| `OPENAI_API_KEY` | platform.openai.com → API keys | Sim (estúdio com IA) | **não** |
| `TRIPO_API_KEY` | platform.tripo3d.ai → API Keys | Não (3D) | **não** |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | Não (assistente) | **não** |
| `FAL_KEY` | fal.ai → Dashboard → Keys | Não (recorte exato) | **não** |
| `ADMIN_PIN`, `ADMIN_PIN_EMAIL`, `ADMIN_PIN_PASSWORD` | Você escolhe (entrada rápida no painel) | Não | **não** |
| `CATALOG_SOURCE` | `supabase` quando os produtos reais estiverem publicados | Não | não |

## 1. GitHub (onde o código fica)

1. Crie uma conta em <https://github.com/signup> (gratuita).
2. Crie um repositório **privado**: <https://github.com/new> → nome da loja → **Private** → Create.
3. A IA envia o código para lá (ela te passa o comando). Não suba o arquivo `.env.local`: ele já está no `.gitignore`.

## 2. Supabase (banco, login e fotos)

1. Crie a conta em <https://supabase.com/dashboard> e clique em **New project**.
   - **Region:** South America (São Paulo), a mais próxima do Brasil.
   - **Database password:** gere uma senha forte e **guarde**. A IA vai precisar dela para criar as tabelas.
   - Contas gratuitas têm limite de 2 projetos ativos por organização.
2. Quando o projeto terminar de criar:
   - **Project Settings → Data API → Project URL** → `NEXT_PUBLIC_SUPABASE_URL` (algo como
     `https://abcdefgh.supabase.co`). O trecho `abcdefgh` é o *project ref*.
   - **Project Settings → API Keys → Legacy API Keys**:
     - `anon` (pública) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
     - `service_role` (secreta, clique em Reveal) → `SUPABASE_SERVICE_ROLE_KEY`. Ela passa por cima de todas as
       regras de segurança: só no servidor, nunca no navegador.
3. **Desligue o cadastro público:** Authentication → Sign In / Providers → desligue **Allow new users to sign up**
   (deixe o provedor de e-mail ligado). Assim, só a equipe que você cadastrar entra no painel.
4. As tabelas, as regras de segurança e o espaço das fotos (bucket `product-media`) são criados pelas migrações. A IA
   roda `npx supabase db push` com o *project ref* e a senha do banco.

Para a IA fazer isso sozinha (opcional): crie um token em <https://supabase.com/dashboard/account/tokens> e entregue
como `SUPABASE_ACCESS_TOKEN` (no ambiente da IA, não no site). Com ele, ela consegue ler as chaves do projeto pela API.

## 3. OpenAI (limpeza, fotos de catálogo e textos)

1. Crie a conta em <https://platform.openai.com/signup>.
2. Coloque crédito: **Settings → Billing → Add to credit balance**. A API é pré-paga; US$ 10 cobrem as fotos de catálogo
   de cerca de 25 produtos (~US$ 0,35 cada).
3. Crie a chave: <https://platform.openai.com/api-keys> → **Create new secret key** → copie a sequência inteira
   (começa com `sk-proj-`). Ela só aparece completa nessa hora; o painel depois mostra só `sk-...abcd`, que **não**
   funciona. Perdeu? Crie outra.
4. Variável: `OPENAI_API_KEY`.
5. Se o `npm run config:verificar` disser que o modelo de imagem não aparece, verifique a organização em
   **Settings → Organization → General** (a OpenAI pode exigir para os modelos de imagem) ou use um modelo da lista que o
   verificador mostrar, em `OPENAI_IMAGE_MODEL`.

**Custos medidos neste projeto (out/2026):** 4 fotos de catálogo de um produto ~US$ 0,35 (~US$ 0,08 cada, ~45 s
juntas); limpeza do fundo em qualidade média ~20 s por foto (mais barata que uma foto de catálogo); nome e descrição,
centavos, uma vez por produto.

## 4. Tripo (modelo 3D, opcional)

1. Conta em <https://platform.tripo3d.ai> → **API Keys** → criar chave.
2. Créditos pré-pagos (a partir de US$ 1). Medido: **30 créditos (US$ 0,30) por modelo**, ~2 min 15 s.
3. Variável: `TRIPO_API_KEY`. Sem ela, o resto funciona e você ainda pode enviar um arquivo `.glb` pronto no painel.
4. No painel, o 3D automático vem desligado (para não gastar créditos sem querer). Ligue em “Incluir o 3D no
   automático”, no estúdio.

## 5. Vercel (site no ar)

1. Conta em <https://vercel.com/signup> entrando **com o GitHub**.
2. **Add New → Project** → importe o repositório da loja (o Next.js é detectado sozinho) → **Deploy**.
3. **Settings → Environment Variables:** cadastre as variáveis do resumo acima, ambiente **Production**. Marque as
   secretas como **Sensitive**.
4. Variável nova só vale num deploy novo: **Deployments → último → ⋯ → Redeploy**.
5. Plano: o **Hobby** (gratuito) é para uso pessoal, **não comercial**. Para uma loja que vende, use o **Pro** (confira
   o preço atual em <https://vercel.com/pricing>). O estúdio de IA usa funções de até 300 s, que o projeto novo já
   permite.

Para a IA cadastrar as variáveis e fazer o redeploy sozinha (opcional): crie um token em
<https://vercel.com/account/tokens> (Scope: a sua conta; Expiration: o menor prazo que servir) e entregue como
`VERCEL_TOKEN` no ambiente da IA. Apague o token quando terminar.

## 6. Anthropic (assistente de vendas, opcional)

1. Conta em <https://console.anthropic.com> → **Billing** (créditos) → **API Keys → Create Key**.
2. Variável: `ANTHROPIC_API_KEY`. Com ela, aparece o botão “Ajuda” na loja.
3. Custo medido: ~US$ 0,0001 por mensagem (~US$ 0,10 a cada mil). Detalhes em `docs/ASSISTENTE.md`.

## 7. fal.ai (recorte exato, opcional)

Por padrão, quem limpa o fundo das fotos é o ChatGPT (mesma chave da OpenAI). Se preferir um recorte pixel a pixel, em
poucos segundos: conta em <https://fal.ai> → **Dashboard → Keys** → variável `FAL_KEY`.

## 8. Domínio próprio (opcional)

Na Vercel: **Settings → Domains → Add** e siga as instruções de DNS do seu provedor (Registro.br, GoDaddy etc.).
Depois, atualize `NEXT_PUBLIC_SITE_URL` com o domínio final e faça um Redeploy.

## 9. Entrada no painel por PIN (opcional)

Para entrar no painel pelo celular só com um PIN: crie a conta da equipe (`npm run admin:create -- email admin`) e
cadastre `ADMIN_PIN` (6 dígitos ou mais), `ADMIN_PIN_EMAIL` e `ADMIN_PIN_PASSWORD` dessa conta. Veja `docs/PAINEL.md`.

## Depois que tudo funcionar

- Troque a chave se ela apareceu em algum chat, print ou e-mail.
- Apague os tokens de automação (`VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`) se não for mais usar a IA no projeto, ou
  guarde-os só nas configurações do ambiente da IA.

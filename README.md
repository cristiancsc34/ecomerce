# Loja virtual — Tcharan / Capiva / Xodoria

Loja estática (HTML + CSS + JS puro, sem framework) pronta para vender: SEO técnico completo, carrinho com cupom e frete grátis progressivo, Pix com desconto, parcelamento, checkout pelo WhatsApp (ou gateway), captura de leads, tracking GA4/Meta/TikTok com atribuição de UTM, páginas de produto estáticas, feed para Google Shopping/Meta e páginas legais (CDC/LGPD).

```
ecomerce/                  ← raiz do site (publique esta pasta)
  index.html               ← home
  p/<slug>.html            ← páginas de produto (geradas por npm run feed)
  sobre.html · trocas-e-devolucoes.html · privacidade.html
  assets/css/style.css     ← estilos (cores vêm do config)
  assets/js/config.js      ← ⚙️ TUDO que você precisa personalizar está aqui
  assets/js/produtos.js    ← catálogo (produtos, categorias, FAQ, depoimentos)
  assets/js/app.js         ← lógica da home (carrinho, busca, tracking, schema)
  assets/js/pagina.js      ← lógica das páginas estáticas
  branding/logos/          ← logos SVG (3 marcas) + png/ + ia/ (propostas por IA) + logos.html (prévia)
  branding/og/             ← imagens Open Graph 1200×630 (WhatsApp/Instagram/Facebook)
  feed/produtos.xml        ← feed Google Merchant Center / Meta / TikTok
  sitemap.xml · robots.txt · site.webmanifest
scripts/                   ← geradores (logos, PNG, feed/páginas, logos por IA)
docs/                      ← NOMES-E-DOMINIOS.md · ESTRATEGIA-MARKETING.md · pesquisa/
```

## 1. Personalizar (5 minutos)

Abra `ecomerce/assets/js/config.js` e preencha:

| Campo | O que é |
|---|---|
| `marcaAtiva` | `"tcharan"`, `"capiva"` ou `"xodoria"` — troca logo, cores e slogan |
| `whatsapp` | DDI+DDD+número só com dígitos, ex. `5511999999999` |
| `email`, `cnpj`, `endereco`, `horarioAtendimento` | aparecem no rodapé e nas páginas legais (CNPJ é obrigatório por lei) |
| `freteGratisAcima`, `descontoPix`, `parcelasMax`, `parcelaMinima` | regras comerciais (barra de frete grátis, preço no Pix, "até 12x") |
| `cupomBoasVindas`, `cupons` | cupons válidos no carrinho |
| `checkoutUrl` | URL do checkout do seu gateway (vazio = pedido fecha pelo WhatsApp) |
| `leadEndpoint` | URL para salvar leads (Formspree, Google Forms, Make, n8n…) |
| `pixels` | IDs do GA4, Google Ads, Meta Pixel, TikTok Pixel ou GTM — os scripts só carregam se preenchidos |
| `seo` | título/descrição da home e `incluirAvaliacoesNoSchema` (ative só com avaliações reais) |

Depois edite `ecomerce/assets/js/produtos.js` com seus produtos (coloque a URL da foto real em `imagem`; `vendidos`/`avaliacoes` deixe `0` até ter dados reais).

Os títulos/descrições estáticos no `<head>` de `index.html` e das páginas institucionais também devem receber o nome/domínio escolhidos (são lidos por robôs e pelo WhatsApp antes do JS).

## 2. Rodar localmente

```bash
npx --yes serve ecomerce
```

ou

```bash
python3 -m http.server 8080 --directory ecomerce
```

## 3. Gerar arquivos (depois de mudar produtos, preços ou marca)

```bash
npm install
```

```bash
npm run feed
```

`npm run feed` regera `p/*.html`, `feed/produtos.xml`, `sitemap.xml` e `robots.txt`.
`npm run logos` regera os SVGs e `branding/logos.html`; `npm run png` exporta ícones/OG em PNG (precisa de Playwright + Chromium).

## 4. Logos por IA (OpenAI)

A chave **nunca** vai no código nem no git. Defina a variável de ambiente `OPENAI_API_KEY`:

```bash
export OPENAI_API_KEY="sk-..."
```

```bash
npm run logos:ia
```

Windows (PowerShell): `$env:OPENAI_API_KEY="sk-..."; npm run logos:ia`.
Ou crie um arquivo `.env` na raiz com `OPENAI_API_KEY=sk-...` (já está no `.gitignore`) e rode `set -a; . ./.env; set +a; npm run logos:ia`.
No Claude Code na nuvem: menu do ambiente (barra de título da sessão) → *Edit* → **Network secrets / variáveis de ambiente** → `OPENAI_API_KEY`; sessões novas já enxergam a variável.
Modelos: `OPENAI_IMAGE_MODEL` (padrão `gpt-image-2.5-sunburst`, cai para `gpt-image-2` e `gpt-image-1`), `OPENAI_IMAGE_QUALITY` (`low|medium|high`). Filtre por marca: `node scripts/gerar-logos-ia.js capiva`.

## 5. Publicar

- **GitHub Pages**: Settings → Pages → Source "GitHub Actions". O workflow `.github/workflows/pages.yml` publica a pasta `ecomerce/` a cada push na `main`. Depois, Settings → Pages → *Custom domain* com o seu domínio (crie o CNAME/A no registro.br).
- **Vercel / Netlify / Cloudflare Pages**: importe o repositório e defina *Root directory* = `ecomerce` (sem build command).
- Depois de publicar: Search Console (enviar `sitemap.xml`), Merchant Center (feed `feed/produtos.xml`), GA4 e pixels no `config.js` — roteiro completo em `docs/ESTRATEGIA-MARKETING.md`.

## 6. Checkout

Hoje o botão **Fechar pedido no WhatsApp** monta a mensagem com itens, cupom, totais (Pix/cartão) e a origem do tráfego (UTM). Quando contratar um gateway (Mercado Pago, Pagar.me, Yampi, Nuvemshop, Shopify…), coloque a URL em `checkoutUrl` — o botão **Finalizar compra** passa a usá-la.

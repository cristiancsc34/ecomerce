#!/usr/bin/env node
/**
 * Gera, a partir de assets/js/produtos.js + assets/js/config.js:
 *   1. ecomerce/p/<slug>.html      — página estática de cada produto (SEO: título, descrição, OG, schema Product)
 *   2. ecomerce/feed/produtos.xml  — feed Google Merchant Center (RSS 2.0) — serve também para o catálogo da Meta/TikTok
 *   3. ecomerce/sitemap.xml        — sitemap com home, páginas institucionais e produtos
 *
 * Rode sempre que mudar produtos/preços:  npm run feed
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'ecomerce');
const carregar = (file) => { const w = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'assets', 'js', file), 'utf8'))(w); return w; };
const CFG = carregar('config.js').SITE_CONFIG;
const { PRODUTOS, CATEGORIAS, FAQ } = carregar('produtos.js');
const M = CFG.marcas[CFG.marcaAtiva];
const base = M.dominio.replace(/\/$/, '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (n) => brl.format(n);
const catNome = (slug) => (CATEGORIAS.find((c) => c.slug === slug) || {}).nome || slug;
const pct = (p) => Math.round((1 - p.preco / p.precoAntigo) * 100);
const parcelas = (v) => { const n = Math.min(CFG.parcelasMax, Math.floor(v / CFG.parcelaMinima)); return n >= 2 ? { n, valor: v / n } : null; };
const hoje = new Date().toISOString().slice(0, 10);

fs.mkdirSync(path.join(ROOT, 'p'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'feed'), { recursive: true });

/* ---------- 1. Páginas de produto ---------- */
for (const p of PRODUTOS) {
  const titulo = `${p.titulo} | ${M.nome}`;
  const desc = `${p.descricao} ${p.precoAntigo > p.preco ? `De ${fmt(p.precoAntigo)} por ` : ''}${fmt(p.preco)} — ${fmt(p.preco * (1 - CFG.descontoPix))} no Pix. ${p.preco >= CFG.freteGratisAcima ? 'Frete grátis.' : `Frete grátis acima de ${fmt(CFG.freteGratisAcima)}.`}`.slice(0, 158);
  const parc = parcelas(p.preco);
  const img = p.imagem || `${base}/branding/og/${CFG.marcaAtiva}-og.png`;
  const schema = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.titulo, description: p.descricao, sku: p.sku, image: img, category: catNome(p.categoria),
    brand: { '@type': 'Brand', name: p.marca }, url: `${base}/p/${p.slug}.html`,
    offers: { '@type': 'Offer', url: `${base}/p/${p.slug}.html`, priceCurrency: 'BRL', price: p.preco.toFixed(2), priceValidUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), availability: p.estoque > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: M.nome },
      hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: 'BR', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 7, returnMethod: 'https://schema.org/ReturnByMail', returnFees: 'https://schema.org/FreeReturn' },
      ...(p.preco >= CFG.freteGratisAcima ? { shippingDetails: { '@type': 'OfferShippingDetails', shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'BRL' }, shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'BR' } } } : {}) },
    ...(CFG.seo.incluirAvaliacoesNoSchema && p.avaliacoes > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.avaliacao, reviewCount: p.avaliacoes } } : {}),
  };
  const bread = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Início', item: base + '/' },
    { '@type': 'ListItem', position: 2, name: catNome(p.categoria), item: `${base}/#categoria/${p.categoria}` },
    { '@type': 'ListItem', position: 3, name: p.titulo, item: `${base}/p/${p.slug}.html` }] };
  const relacionados = PRODUTOS.filter((x) => x.categoria === p.categoria && x.id !== p.id).slice(0, 4);
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(titulo)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${base}/p/${p.slug}.html">
  <meta name="theme-color" content="${M.cores.primaria}">
  <link rel="icon" type="image/svg+xml" href="../${M.icone}">
  <meta property="og:type" content="product">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:site_name" content="${esc(M.nome)}">
  <meta property="og:title" content="${esc(titulo)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${base}/p/${p.slug}.html">
  <meta property="og:image" content="${esc(img)}">
  <meta property="product:price:amount" content="${p.preco.toFixed(2)}">
  <meta property="product:price:currency" content="BRL">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Fredoka:wght@600;700&family=Inter:wght@400;600;700;800&display=swap">
  <link rel="stylesheet" href="../assets/css/style.css">
  <script src="../assets/js/config.js"></script>
  <script src="../assets/js/produtos.js"></script>
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
  <script type="application/ld+json">${JSON.stringify(bread)}</script>
</head>
<body data-pagina="produto" data-produto="${p.id}">
  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <symbol id="i-cart" viewBox="0 0 24 24"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.5L21 8H7"/><circle cx="10" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></symbol>
    <symbol id="i-whats" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 0 1 0 16.4 8.1 8.1 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8zm-3.3 4.4c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.5.3-.5v-.5l-.9-2.2c-.2-.5-.4-.5-.7-.5h-.5z"/></symbol>
    <symbol id="i-pix" viewBox="0 0 24 24"><path d="m12 3 4.2 4.2a3 3 0 0 0 2.1.9H20l1 1-5.3 5.3-1.4-1.4L17.6 10l-3.3-3.3L12 9 9.7 6.7 6.4 10l3.3 3.3-1.4 1.4L3 9l1-1h1.7a3 3 0 0 0 2.1-.9L12 3zm0 18-4.2-4.2a3 3 0 0 0-2.1-.9H4l-1-1 1.4-1.4L7.7 16l3.3 3.3L12 18l1 1.3 3.3-3.3 3.3-2.5L21 15l-1 1h-1.7a3 3 0 0 0-2.1.9L12 21z"/></symbol>
  </svg>
  <div class="topbar">🚚 Frete grátis acima de ${fmt(CFG.freteGratisAcima).replace(',00', '')} · 💠 ${Math.round(CFG.descontoPix * 100)}% OFF no Pix · 💳 até ${CFG.parcelasMax}x sem juros</div>
  <header class="header">
    <div class="container header__inner">
      <a href="../" class="logo" aria-label="Página inicial"><img data-logo src="../${M.logo}" alt="${esc(M.nome)}" width="180" height="48"></a>
      <nav class="actions" style="margin-left:auto">
        <a class="action" href="../">← Voltar para a loja</a>
        <a class="action" href="../#carrinho" aria-label="Carrinho"><svg class="icon"><use href="#i-cart"/></svg><span>Carrinho</span><b class="badge" data-cart-badge data-zero="true">0</b></a>
      </nav>
    </div>
  </header>
  <main class="container" style="padding:24px 16px 48px">
    <nav aria-label="Você está em" style="font-size:.85rem;color:var(--muted);margin-bottom:14px"><a href="../" style="text-decoration:none">Início</a> › <a href="../#categoria/${p.categoria}" style="text-decoration:none">${esc(catNome(p.categoria))}</a> › <span>${esc(p.titulo)}</span></nav>
    <article class="modal__box pmod" style="transform:none;opacity:1;max-height:none;box-shadow:var(--shadow)">
      <div class="pmod__media">${p.imagem ? `<img src="${esc(p.imagem)}" alt="${esc(p.titulo)}" width="800" height="800">` : `<span aria-hidden="true">${p.emoji}</span>`}</div>
      <div class="pmod__body">
        <small style="color:var(--muted);font-weight:600">${esc(catNome(p.categoria))} · ${esc(p.marca)}${p.sku ? ' · SKU ' + esc(p.sku) : ''}</small>
        <h1 style="font-family:var(--font-body);font-size:1.5rem">${esc(p.titulo)}</h1>
        <p class="desc">${esc(p.descricao)}</p>
        <div class="price">
          ${p.precoAntigo > p.preco ? `<s>${fmt(p.precoAntigo)}</s> <span class="off" style="position:static">-${pct(p)}%</span>` : ''}
          <strong>${fmt(p.preco)}</strong>
          <span class="pix"><svg class="icon" style="width:1em;height:1em"><use href="#i-pix"/></svg> ${fmt(p.preco * (1 - CFG.descontoPix))} no Pix (${Math.round(CFG.descontoPix * 100)}% OFF)</span>
          ${parc ? `<span class="inst">ou ${parc.n}x de ${fmt(parc.valor)} sem juros no cartão</span>` : ''}
        </div>
        <ul class="bullets">
          <li>${p.estoque > 0 ? (p.estoque <= 5 ? `🔥 Últimas ${p.estoque} unidades` : '✅ Em estoque — envio em 24h') : '⛔ Esgotado no momento'}</li>
          <li>${p.preco >= CFG.freteGratisAcima ? '🚚 Frete grátis para todo o Brasil' : `🚚 Frete grátis em compras acima de ${fmt(CFG.freteGratisAcima)}`}</li>
          <li>🔁 7 dias para troca ou devolução · 🧾 Nota fiscal · 🔒 Compra segura</li>
        </ul>
        <div class="pmod__actions">
          <button class="btn btn--accent btn--lg" type="button" data-comprar="${p.id}" ${p.estoque === 0 ? 'disabled' : ''}>Comprar agora</button>
          <a class="btn btn--whats" data-wa="Olá! Tenho uma dúvida sobre: ${esc(p.titulo)} (${base}/p/${p.slug}.html)" href="#"><svg class="icon"><use href="#i-whats"/></svg> Perguntar no WhatsApp</a>
        </div>
      </div>
    </article>
    ${relacionados.length ? `<section style="margin-top:40px"><h2 style="margin-bottom:16px">Você também pode gostar</h2><div class="grid">${relacionados.map((r) => `<a class="card" href="${r.slug}.html" style="text-decoration:none"><div class="card__media">${r.imagem ? `<img src="${esc(r.imagem)}" alt="${esc(r.titulo)}" loading="lazy">` : `<span class="card__emoji">${r.emoji}</span>`}</div><div class="card__body"><h3 class="card__title">${esc(r.titulo)}</h3><div class="price"><strong>${fmt(r.preco)}</strong><span class="pix">${fmt(r.preco * (1 - CFG.descontoPix))} no Pix</span></div></div></a>`).join('')}</div></section>` : ''}
    <section class="faq" style="margin-top:40px"><h2 style="margin-bottom:12px;text-align:center">Dúvidas frequentes</h2>${FAQ.map((f) => `<details><summary>${esc(f.p)}</summary><p>${esc(f.r)}</p></details>`).join('')}</section>
  </main>
  <footer class="footer"><div class="container footer__bottom" style="border:0;margin:0;padding:0"><span>© <span data-ano></span> ${esc(M.nome)} · CNPJ ${esc(CFG.cnpj)} · <a href="../trocas-e-devolucoes.html">Trocas e devoluções</a> · <a href="../privacidade.html">Privacidade</a></span></div></footer>
  <a class="wa-float" data-wa href="#" aria-label="Falar no WhatsApp"><svg class="icon"><use href="#i-whats"/></svg></a>
  <script src="../assets/js/pagina.js" defer></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(ROOT, 'p', `${p.slug}.html`), html);
}

/* ---------- 2. Feed Google Merchant / Meta / TikTok ---------- */
const itens = PRODUTOS.map((p) => `    <item>
      <g:id>${esc(p.sku || p.id)}</g:id>
      <g:title>${esc(p.titulo)}</g:title>
      <g:description>${esc(p.descricao)}</g:description>
      <g:link>${base}/p/${p.slug}.html</g:link>
      <g:image_link>${esc(p.imagem || `${base}/branding/og/${CFG.marcaAtiva}-og.png`)}</g:image_link>
      <g:availability>${p.estoque > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>
      <g:price>${p.precoAntigo > p.preco ? p.precoAntigo.toFixed(2) : p.preco.toFixed(2)} BRL</g:price>${p.precoAntigo > p.preco ? `
      <g:sale_price>${p.preco.toFixed(2)} BRL</g:sale_price>` : ''}
      <g:brand>${esc(p.marca || M.nome)}</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>${/gen[eé]rica/i.test(p.marca || '') ? 'no' : 'yes'}</g:identifier_exists>
      <g:product_type>${esc(catNome(p.categoria))}</g:product_type>
      <g:shipping><g:country>BR</g:country><g:price>${p.preco >= CFG.freteGratisAcima ? '0.00' : '19.90'} BRL</g:price></g:shipping>
    </item>`).join('\n');
const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(M.nome)}</title>
    <link>${base}/</link>
    <description>${esc(M.descricao)}</description>
${itens}
  </channel>
</rss>
`;
fs.writeFileSync(path.join(ROOT, 'feed', 'produtos.xml'), feed);

/* ---------- 3. Sitemap ---------- */
const urls = [
  { loc: `${base}/`, prio: '1.0', freq: 'daily' },
  { loc: `${base}/sobre.html`, prio: '0.5', freq: 'monthly' },
  { loc: `${base}/trocas-e-devolucoes.html`, prio: '0.5', freq: 'monthly' },
  { loc: `${base}/privacidade.html`, prio: '0.3', freq: 'yearly' },
  ...PRODUTOS.map((p) => ({ loc: `${base}/p/${p.slug}.html`, prio: '0.8', freq: 'weekly' })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${hoje}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.prio}</priority></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
// Nunca bloqueie /assets/ — o Google precisa do JS e CSS para renderizar a página.
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);

console.log(`OK — ${PRODUTOS.length} páginas em ecomerce/p/, feed em ecomerce/feed/produtos.xml, sitemap.xml e robots.txt (domínio ${base})`);

/* =====================================================================
   LOJA — lógica da página (vanilla JS, sem dependências)
   Módulos: marca · utilidades · tracking · catálogo · busca · carrinho ·
            cupons · checkout · leads · modais · router · SEO (JSON-LD)
   ===================================================================== */
(function () {
  'use strict';
  const CFG = window.SITE_CONFIG;
  const MARCA = CFG.marcas[CFG.marcaAtiva] || Object.values(CFG.marcas)[0];
  const PRODUTOS = window.PRODUTOS || [];
  const CATEGORIAS = window.CATEGORIAS || [];
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('loja_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('loja_' + k, JSON.stringify(v)); } catch (e) { /* modo privado */ } },
  };

  /* ---------------- Utilidades ---------------- */
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmt = (n) => brl.format(n);
  const pct = (p) => Math.round((1 - p.preco / p.precoAntigo) * 100);
  const precoPix = (v) => v * (1 - CFG.descontoPix);
  const parcelas = (v) => {
    const n = Math.min(CFG.parcelasMax, Math.floor(v / CFG.parcelaMinima));
    return n >= 2 ? { n, valor: v / n } : null;
  };
  const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byId = (id) => PRODUTOS.find((p) => p.id === Number(id));
  const bySlug = (slug) => PRODUTOS.find((p) => p.slug === slug);
  const catNome = (slug) => (CATEGORIAS.find((c) => c.slug === slug) || {}).nome || slug;
  const waLink = (msg) => `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(msg)}`;

  function toast(msg, ms = 2200) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('is-on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('is-on'), ms);
  }

  /* ---------------- Marca (cores, logo, textos, meta) ---------------- */
  function aplicarMarca() {
    const r = document.documentElement.style;
    const c = MARCA.cores;
    r.setProperty('--primary', c.primaria); r.setProperty('--primary-dark', c.primariaEscura);
    r.setProperty('--accent', c.acento); r.setProperty('--highlight', c.destaque); r.setProperty('--ink', c.tinta);
    r.setProperty('--font-display', MARCA.fonteTitulos);
    $$('[data-marca]').forEach((el) => { el.textContent = MARCA.nome; });
    $$('[data-slogan]').forEach((el) => { el.textContent = MARCA.slogan; });
    $$('[data-descricao-marca]').forEach((el) => { el.textContent = MARCA.descricao; });
    $$('img[data-logo]').forEach((img) => { img.src = MARCA.logo; img.alt = MARCA.nome; });
    $$('img[data-logo-branco]').forEach((img) => { img.src = MARCA.logoBranco; img.alt = MARCA.nome; });
    $$('img[data-icone]').forEach((img) => { img.src = MARCA.icone; });
    const titulo = CFG.seo.tituloHome.replace('{marca}', MARCA.nome);
    document.title = titulo;
    const setMeta = (sel, val) => { const m = $(sel); if (m) m.setAttribute('content', val); };
    setMeta('meta[name="description"]', CFG.seo.descricaoHome);
    setMeta('meta[property="og:title"]', titulo);
    setMeta('meta[property="og:description"]', CFG.seo.descricaoHome);
    setMeta('meta[property="og:site_name"]', MARCA.nome);
    setMeta('meta[property="og:url"]', MARCA.dominio + '/');
    setMeta('meta[property="og:image"]', `${MARCA.dominio}/branding/og/${CFG.marcaAtiva}-og.png`);
    setMeta('meta[name="twitter:title"]', titulo);
    setMeta('meta[name="twitter:description"]', CFG.seo.descricaoHome);
    setMeta('meta[name="twitter:image"]', `${MARCA.dominio}/branding/og/${CFG.marcaAtiva}-og.png`);
    setMeta('meta[name="theme-color"]', c.primaria);
    const canon = $('link[rel="canonical"]'); if (canon) canon.href = MARCA.dominio + '/';
    const fav = $('link[rel="icon"]'); if (fav) fav.href = MARCA.icone;
    const apple = $('link[rel="apple-touch-icon"]'); if (apple) apple.href = `branding/logos/png/${CFG.marcaAtiva}-apple-touch-icon.png`;
    // textos com regras comerciais
    $$('[data-frete-gratis]').forEach((el) => { el.textContent = fmt(CFG.freteGratisAcima).replace(',00', ''); });
    $$('[data-pix-off]').forEach((el) => { el.textContent = Math.round(CFG.descontoPix * 100) + '%'; });
    $$('[data-parcelas]').forEach((el) => { el.textContent = CFG.parcelasMax + 'x'; });
    $$('[data-cupom]').forEach((el) => { el.textContent = CFG.cupomBoasVindas.codigo; });
    $$('[data-cupom-off]').forEach((el) => { el.textContent = Math.round(CFG.cupomBoasVindas.desconto * 100) + '%'; });
    $$('[data-cnpj]').forEach((el) => { el.textContent = CFG.cnpj; });
    $$('[data-email]').forEach((el) => { el.textContent = CFG.email; el.href = 'mailto:' + CFG.email; });
    $$('[data-horario]').forEach((el) => { el.textContent = CFG.horarioAtendimento; });
    $$('[data-endereco]').forEach((el) => { el.textContent = CFG.endereco; });
    $$('[data-ano]').forEach((el) => { el.textContent = new Date().getFullYear(); });
    $$('a[data-wa]').forEach((a) => { a.href = waLink(a.dataset.wa || `Olá! Vim pelo site da ${MARCA.nome} e queria tirar uma dúvida.`); a.target = '_blank'; a.rel = 'noopener'; });
    $$('a[data-instagram]').forEach((a) => { a.href = 'https://instagram.com/' + MARCA.instagram; });
    $$('a[data-tiktok]').forEach((a) => { a.href = 'https://tiktok.com/@' + MARCA.tiktok; });
  }

  /* ---------------- Tracking (GA4 / Meta / TikTok / GTM) + atribuição ---------------- */
  window.dataLayer = window.dataLayer || [];
  function carregarPixels() {
    const p = CFG.pixels; const h = document.head;
    const add = (src, cb) => { const s = document.createElement('script'); s.async = true; s.src = src; if (cb) s.onload = cb; h.appendChild(s); };
    if (p.gtm) {
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      add(`https://www.googletagmanager.com/gtm.js?id=${p.gtm}`);
    }
    if (p.ga4 || p.googleAds) {
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      add(`https://www.googletagmanager.com/gtag/js?id=${p.ga4 || p.googleAds}`);
      gtag('js', new Date());
      if (p.ga4) gtag('config', p.ga4, { currency: 'BRL' });
      if (p.googleAds) gtag('config', p.googleAds);
    }
    if (p.metaPixel) {
      /* eslint-disable */
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      fbq('init', p.metaPixel); fbq('track', 'PageView');
    }
    if (p.tiktokPixel) {
      /* eslint-disable */
      !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(p.tiktokPixel);ttq.page()}(window,document,'ttq');
      /* eslint-enable */
    }
  }
  const item = (p, qty = 1) => ({ item_id: p.sku || String(p.id), item_name: p.titulo, item_brand: p.marca, item_category: catNome(p.categoria), price: p.preco, quantity: qty });
  function track(evento, dados = {}) {
    window.dataLayer.push({ event: evento, ecommerce: dados.items ? { currency: 'BRL', value: dados.value, items: dados.items } : undefined, ...dados });
    if (window.gtag && CFG.pixels.ga4) gtag('event', evento, { currency: 'BRL', ...dados });
    if (window.fbq) {
      const mapa = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', generate_lead: 'Lead', search: 'Search', add_to_wishlist: 'AddToWishlist' };
      if (mapa[evento]) fbq('track', mapa[evento], { currency: 'BRL', value: dados.value, content_ids: (dados.items || []).map((i) => i.item_id), content_type: 'product', search_string: dados.search_term });
    }
    if (window.ttq) {
      const mapa = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', generate_lead: 'SubmitForm', search: 'Search', add_to_wishlist: 'AddToWishlist' };
      if (mapa[evento]) ttq.track(mapa[evento], { currency: 'BRL', value: dados.value, contents: (dados.items || []).map((i) => ({ content_id: i.item_id, content_name: i.item_name, price: i.price, quantity: i.quantity })) });
    }
  }
  function capturarAtribuicao() {
    const q = new URLSearchParams(location.search);
    const campos = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'ttclid'];
    const atual = {}; campos.forEach((k) => { if (q.get(k)) atual[k] = q.get(k); });
    if (!Object.keys(atual).length && document.referrer && !document.referrer.includes(location.host)) {
      try { atual.utm_source = new URL(document.referrer).hostname.replace('www.', ''); atual.utm_medium = 'referral'; } catch (e) { /* ignore */ }
    }
    if (Object.keys(atual).length) {
      atual.em = new Date().toISOString(); atual.pagina = location.pathname;
      const att = LS.get('attrib', {});
      if (!att.primeira) att.primeira = atual;
      att.ultima = atual; LS.set('attrib', att);
    }
  }
  const origemTexto = () => {
    const a = LS.get('attrib', {}); const u = a.ultima || a.primeira; if (!u) return '';
    return [u.utm_source, u.utm_medium, u.utm_campaign].filter(Boolean).join(' / ');
  };

  /* ---------------- Estado ---------------- */
  let cart = LS.get('cart', []);           // [{id, qty}]
  let favs = LS.get('favs', []);           // [id]
  let cupom = LS.get('cupom', null);       // código aplicado
  let filtro = { categoria: 'all', busca: '', sort: 'relevancia', chip: 'all' };

  /* ---------------- Catálogo ---------------- */
  function cardHTML(p) {
    const off = p.precoAntigo > p.preco ? `<span class="off">-${pct(p)}%</span>` : '';
    const img = p.imagem ? `<img src="${esc(p.imagem)}" alt="${esc(p.titulo)}" loading="lazy" decoding="async" width="400" height="400">` : `<span class="card__emoji" aria-hidden="true">${p.emoji}</span>`;
    const parc = parcelas(p.preco);
    const rating = p.avaliacoes > 0 ? `<div class="rating"><span class="stars" aria-label="${p.avaliacao} de 5">${'★'.repeat(Math.round(p.avaliacao))}${'☆'.repeat(5 - Math.round(p.avaliacao))}</span><span>${p.avaliacao.toFixed(1)} (${p.avaliacoes})</span></div>` : '';
    const estoque = p.estoque === 0 ? '<span class="low">Esgotado</span>' : p.estoque <= 5 ? `<span class="low">🔥 Restam só ${p.estoque}</span>` : '';
    const frete = p.preco >= CFG.freteGratisAcima ? '<span class="free">🚚 Frete grátis</span>' : '';
    const vendidos = p.vendidos > 0 ? `<span>${p.vendidos}+ vendidos</span>` : '';
    const tag = p.tags && p.tags.includes('achadinho') ? '<span class="tagline">✨ achadinho</span>' : '';
    return `
    <article class="card" data-id="${p.id}">
      <a class="card__media" href="#produto/${p.slug}" data-open="${p.id}" aria-label="${esc(p.titulo)}">${off}${tag}${img}</a>
      <button class="fav" type="button" data-fav="${p.id}" aria-pressed="${favs.includes(p.id)}" aria-label="Favoritar"><svg class="icon"><use href="#i-heart"/></svg></button>
      <div class="card__body">
        <h3 class="card__title"><a href="#produto/${p.slug}" data-open="${p.id}">${esc(p.titulo)}</a></h3>
        ${rating}
        <div class="price">
          ${p.precoAntigo > p.preco ? `<s>${fmt(p.precoAntigo)}</s>` : ''}
          <strong>${fmt(p.preco)}</strong>
          <span class="pix"><svg class="icon" style="width:1em;height:1em"><use href="#i-pix"/></svg> ${fmt(precoPix(p.preco))} no Pix</span>
          ${parc ? `<span class="inst">ou ${parc.n}x de ${fmt(parc.valor)} sem juros</span>` : ''}
        </div>
        <div class="meta">${estoque}${frete}${vendidos}</div>
        <div class="card__actions">
          <button class="btn btn--primary" type="button" data-add="${p.id}" ${p.estoque === 0 ? 'disabled' : ''}><svg class="icon"><use href="#i-cart"/></svg> ${p.estoque === 0 ? 'Avise-me' : 'Adicionar'}</button>
          <button class="btn btn--ghost" type="button" data-buy="${p.id}" ${p.estoque === 0 ? 'disabled' : ''}>Comprar agora</button>
        </div>
      </div>
    </article>`;
  }

  function listaFiltrada() {
    let l = PRODUTOS.slice();
    if (filtro.categoria !== 'all') l = l.filter((p) => p.categoria === filtro.categoria);
    if (filtro.chip === 'favoritos') l = l.filter((p) => favs.includes(p.id));
    if (filtro.chip === 'ate100') l = l.filter((p) => p.preco <= 100);
    if (filtro.chip === 'frete') l = l.filter((p) => p.preco >= CFG.freteGratisAcima);
    if (filtro.chip === 'achadinhos') l = l.filter((p) => (p.tags || []).includes('achadinho'));
    if (filtro.busca) {
      const t = slugify(filtro.busca).split('-').filter(Boolean);
      l = l.filter((p) => { const alvo = slugify([p.titulo, p.descricao, p.marca, catNome(p.categoria), ...(p.tags || [])].join(' ')); return t.every((w) => alvo.includes(w)); });
    }
    const s = filtro.sort;
    if (s === 'menor') l.sort((a, b) => a.preco - b.preco);
    else if (s === 'maior') l.sort((a, b) => b.preco - a.preco);
    else if (s === 'desconto') l.sort((a, b) => pct(b) - pct(a));
    else if (s === 'novidades') l.sort((a, b) => b.id - a.id);
    else l.sort((a, b) => (b.destaque === true) - (a.destaque === true) || b.vendidos - a.vendidos);
    return l;
  }

  function renderProdutos() {
    const grid = $('#productsGrid'); const lista = listaFiltrada();
    grid.innerHTML = lista.map(cardHTML).join('');
    $('#emptyState').hidden = lista.length > 0;
    const titulo = filtro.busca ? `Resultados para “${filtro.busca}”` : filtro.categoria !== 'all' ? catNome(filtro.categoria) : filtro.chip === 'favoritos' ? 'Seus favoritos' : 'Produtos em destaque';
    $('#productsTitle').textContent = titulo;
    $('#productsCount').textContent = `${lista.length} ${lista.length === 1 ? 'produto' : 'produtos'}`;
    $$('.catnav a').forEach((a) => a.classList.toggle('is-active', a.dataset.cat === filtro.categoria && !filtro.busca));
    $$('.chip').forEach((c) => c.classList.toggle('is-active', c.dataset.chip === filtro.chip));
    track('view_item_list', { item_list_name: titulo, items: lista.slice(0, 20).map((p) => item(p)) });
  }

  function renderDeals() {
    const deals = PRODUTOS.filter((p) => p.destaque && p.estoque > 0).slice(0, 4);
    const sec = $('#ofertas');
    if (!CFG.ofertaRelampago.ativa || !deals.length) { sec.hidden = true; return; }
    $('#dealsGrid').innerHTML = deals.map(cardHTML).join('');
    $('#dealsLabel').textContent = CFG.ofertaRelampago.rotulo;
  }

  function renderCategorias() {
    const nav = $('#catNav'); const grid = $('#catsGrid'); const mob = $('#mobileNav');
    const count = (slug) => PRODUTOS.filter((p) => p.categoria === slug).length;
    nav.innerHTML = `<a href="#categoria/all" data-cat="all" class="is-active">Tudo</a>` + CATEGORIAS.map((c) => `<a href="#categoria/${c.slug}" data-cat="${c.slug}">${c.emoji} ${c.nome}</a>`).join('') + `<a href="#ofertas" data-cat="ofertas">⚡ Ofertas</a>`;
    mob.innerHTML = CATEGORIAS.map((c) => `<a href="#categoria/${c.slug}">${c.emoji} ${c.nome}</a>`).join('') + `<a href="sobre.html">Sobre a loja</a><a href="trocas-e-devolucoes.html">Trocas e devoluções</a>`;
    grid.innerHTML = CATEGORIAS.map((c) => `<a class="cat" href="#categoria/${c.slug}"><div class="cat__emoji" aria-hidden="true">${c.emoji}</div><div class="cat__name">${c.nome}</div><div class="cat__count">${count(c.slug)} ${count(c.slug) === 1 ? 'produto' : 'produtos'}</div></a>`).join('');
  }

  function renderDepoimentos() {
    const d = window.DEPOIMENTOS || []; const sec = $('#depoimentos');
    if (!d.length) { sec.hidden = true; return; }
    sec.hidden = false;
    $('#deposGrid').innerHTML = d.map((x) => `<div class="depo"><div class="rating"><span class="stars">${'★'.repeat(x.nota || 5)}</span></div><p>“${esc(x.texto)}”</p><footer>${esc(x.nome)}${x.cidade ? ' · ' + esc(x.cidade) : ''}</footer></div>`).join('');
  }

  function renderFAQ() {
    $('#faqList').innerHTML = (window.FAQ || []).map((f) => `<details><summary>${esc(f.p)}</summary><p>${esc(f.r)}</p></details>`).join('');
  }

  /* ---------------- Busca com sugestões ---------------- */
  function initBusca() {
    const input = $('#searchInput'); const box = $('#searchSug'); const form = $('#searchForm');
    let idx = -1;
    const sugestoes = (q) => {
      const t = slugify(q);
      if (!t) return { head: 'Buscas populares', itens: CFG.buscasPopulares.map((s) => ({ t: s })) };
      const prods = PRODUTOS.filter((p) => slugify(p.titulo + ' ' + (p.tags || []).join(' ')).includes(t)).slice(0, 5).map((p) => ({ t: p.titulo, sub: fmt(p.preco), slug: p.slug }));
      const pop = CFG.buscasPopulares.filter((s) => slugify(s).includes(t)).map((s) => ({ t: s }));
      return { head: prods.length ? 'Produtos' : 'Sugestões', itens: [...prods, ...pop].slice(0, 8) };
    };
    const abrir = () => {
      const { head, itens } = sugestoes(input.value);
      if (!itens.length) { box.hidden = true; return; }
      box.innerHTML = `<li class="sug-head">${head}</li>` + itens.map((s, i) => `<li role="option" data-i="${i}" data-slug="${s.slug || ''}" data-t="${esc(s.t)}"><span>${esc(s.t)}</span>${s.sub ? `<small>${s.sub}</small>` : ''}</li>`).join('');
      box.hidden = false; idx = -1;
    };
    input.addEventListener('focus', abrir);
    input.addEventListener('input', abrir);
    input.addEventListener('keydown', (e) => {
      const li = $$('li[role="option"]', box);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + li.length) % li.length; li.forEach((l, i) => l.setAttribute('aria-selected', i === idx)); }
      if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); li[idx].click(); }
      if (e.key === 'Escape') box.hidden = true;
    });
    box.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li[role="option"]'); if (!li) return;
      e.preventDefault(); box.hidden = true;
      if (li.dataset.slug) { input.value = ''; location.hash = '#produto/' + li.dataset.slug; }
      else { input.value = li.dataset.t; location.hash = '#busca/' + encodeURIComponent(li.dataset.t); }
    });
    document.addEventListener('click', (e) => { if (!form.contains(e.target)) box.hidden = true; });
    form.addEventListener('submit', (e) => { e.preventDefault(); box.hidden = true; const q = input.value.trim(); location.hash = q ? '#busca/' + encodeURIComponent(q) : '#categoria/all'; });
  }

  /* ---------------- Carrinho ---------------- */
  const qtdTotal = () => cart.reduce((s, i) => s + i.qty, 0);
  function salvarCart() { LS.set('cart', cart); const b = $('#cartBadge'); b.textContent = qtdTotal(); b.dataset.zero = qtdTotal() === 0; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  function addToCart(id, qty = 1, abrir = true) {
    const p = byId(id); if (!p || p.estoque === 0) return;
    const li = cart.find((i) => i.id === p.id);
    if (li) li.qty = Math.min(li.qty + qty, p.estoque); else cart.push({ id: p.id, qty: Math.min(qty, p.estoque) });
    salvarCart(); renderCart(); track('add_to_cart', { value: p.preco * qty, items: [item(p, qty)] });
    if (abrir) { toast(`✅ ${p.titulo} adicionado ao carrinho`); abrirDrawer(); }
  }
  function setQty(id, qty) {
    const p = byId(id); const li = cart.find((i) => i.id === Number(id)); if (!li) return;
    if (qty <= 0) { cart = cart.filter((i) => i.id !== Number(id)); track('remove_from_cart', { value: p.preco * li.qty, items: [item(p, li.qty)] }); }
    else li.qty = Math.min(qty, p.estoque);
    salvarCart(); renderCart();
  }
  function cupomInfo(cod) {
    if (!cod) return null; cod = cod.toUpperCase().trim();
    if (cod === CFG.cupomBoasVindas.codigo) return { codigo: cod, tipo: 'percentual', valor: CFG.cupomBoasVindas.desconto, descricao: CFG.cupomBoasVindas.descricao };
    const c = CFG.cupons[cod]; return c ? { codigo: cod, ...c } : null;
  }
  function totais() {
    const itens = cart.map((i) => ({ ...i, p: byId(i.id) })).filter((i) => i.p);
    const subtotal = itens.reduce((s, i) => s + i.p.preco * i.qty, 0);
    const c = cupomInfo(cupom); let desconto = 0; let freteGratis = subtotal >= CFG.freteGratisAcima;
    if (c && (!c.minimo || subtotal >= c.minimo)) {
      if (c.tipo === 'percentual') desconto = subtotal * c.valor;
      if (c.tipo === 'fixo') desconto = Math.min(c.valor, subtotal);
      if (c.tipo === 'frete') freteGratis = true;
    }
    const total = Math.max(0, subtotal - desconto);
    return { itens, subtotal, desconto, total, totalPix: precoPix(total), freteGratis, cupom: c };
  }
  function renderCart() {
    const t = totais(); const box = $('#cartItems');
    if (!t.itens.length) {
      box.innerHTML = `<div class="drawer__empty"><div style="font-size:3rem">🛒</div><p>Seu carrinho está vazio.</p><a href="#ofertas" class="btn btn--primary btn--sm" data-close>Ver ofertas</a></div>`;
    } else {
      box.innerHTML = t.itens.map(({ p, qty }) => `
        <div class="citem" data-id="${p.id}">
          <div class="citem__img">${p.imagem ? `<img src="${esc(p.imagem)}" alt="">` : p.emoji}</div>
          <div>
            <div class="citem__title">${esc(p.titulo)}</div>
            <div class="citem__price">${fmt(p.preco)} ${qty > 1 ? `× ${qty} = <b>${fmt(p.preco * qty)}</b>` : ''}</div>
            <div class="qty"><button type="button" data-qty="-1" aria-label="Diminuir">−</button><span>${qty}</span><button type="button" data-qty="1" aria-label="Aumentar">+</button></div>
          </div>
          <button type="button" class="citem__remove" data-qty="0">remover</button>
        </div>`).join('');
    }
    // barra de frete
    const falta = Math.max(0, CFG.freteGratisAcima - t.subtotal);
    $('#shipFill').style.width = Math.min(100, (t.subtotal / CFG.freteGratisAcima) * 100) + '%';
    $('#shipMsg').innerHTML = t.freteGratis ? '🎉 Você ganhou <b>frete grátis</b>!' : `Faltam <b>${fmt(falta)}</b> para ganhar <b>frete grátis</b>`;
    // totais
    const parc = parcelas(t.total);
    $('#cartTotals').innerHTML = t.itens.length ? `
      <div><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>
      ${t.desconto ? `<div style="color:var(--success)"><span>Cupom ${t.cupom.codigo}</span><span>− ${fmt(t.desconto)}</span></div>` : ''}
      <div><span>Frete</span><span>${t.freteGratis ? '<b style="color:var(--success)">Grátis</b>' : 'calculado no checkout'}</span></div>
      <div class="big"><span>Total</span><span>${fmt(t.total)}</span></div>
      <div class="pixline"><span>No Pix (${Math.round(CFG.descontoPix * 100)}% OFF)</span><span>${fmt(t.totalPix)}</span></div>
      ${parc ? `<div><span>No cartão</span><span>${parc.n}x de ${fmt(parc.valor)} sem juros</span></div>` : ''}` : '';
    $('#checkoutBtn').disabled = $('#checkoutWa').disabled = !t.itens.length;
    const msg = $('#couponMsg'); const c = t.cupom;
    if (cupom && !c) { msg.textContent = 'Cupom inválido'; msg.className = 'err'; }
    else if (c && c.minimo && t.subtotal < c.minimo) { msg.textContent = `Cupom válido para compras acima de ${fmt(c.minimo)}`; msg.className = 'err'; }
    else if (c) { msg.textContent = `✔ ${c.descricao} aplicado`; msg.className = 'ok'; }
    else { msg.textContent = ''; msg.className = ''; }
  }
  function aplicarCupom(cod) {
    cod = (cod || '').toUpperCase().trim(); const c = cupomInfo(cod);
    cupom = c ? cod : (cod ? cod : null); LS.set('cupom', cupom); renderCart();
    if (c) { toast(`🎟️ Cupom ${cod} aplicado!`); track('select_promotion', { promotion_name: cod }); } else if (cod) toast('Cupom inválido 😕');
  }
  function mensagemPedido() {
    const t = totais(); const lead = LS.get('lead', null);
    const linhas = t.itens.map(({ p, qty }) => `• ${qty}x ${p.titulo} — ${fmt(p.preco * qty)}`);
    return [`Olá, ${MARCA.nome}! Quero fechar este pedido:`, '', ...linhas, '', `Subtotal: ${fmt(t.subtotal)}`,
      t.desconto ? `Cupom ${t.cupom.codigo}: − ${fmt(t.desconto)}` : null,
      `Frete: ${t.freteGratis ? 'grátis' : 'a calcular (me passa o CEP?)'}`,
      `Total no Pix: ${fmt(t.totalPix)}  |  no cartão: ${fmt(t.total)}`,
      lead ? `Nome: ${lead.nome}` : null,
      origemTexto() ? `Origem: ${origemTexto()}` : null,
      '', `(enviado pelo site ${MARCA.dominio.replace(/^https?:\/\//, '')})`].filter((l) => l !== null).join('\n');
  }
  function checkout(viaWhats) {
    const t = totais(); if (!t.itens.length) return;
    track('begin_checkout', { value: t.total, coupon: t.cupom ? t.cupom.codigo : undefined, items: t.itens.map(({ p, qty }) => item(p, qty)) });
    if (!viaWhats && CFG.checkoutUrl) { location.href = CFG.checkoutUrl; return; }
    window.open(waLink(mensagemPedido()), '_blank', 'noopener');
  }

  /* ---------------- Drawer / modais ---------------- */
  let ultimoFoco = null;
  function abrirDrawer() { const d = $('#cartDrawer'); d.classList.add('is-open'); d.setAttribute('aria-hidden', 'false'); ultimoFoco = document.activeElement; $('.x', d).focus(); document.body.style.overflow = 'hidden'; track('view_cart', { value: totais().total, items: totais().itens.map(({ p, qty }) => item(p, qty)) }); }
  function fecharDrawer() { const d = $('#cartDrawer'); d.classList.remove('is-open'); d.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; if (ultimoFoco) ultimoFoco.focus(); }
  function abrirModal(id) { const m = $(id); m.classList.add('is-open'); m.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; const x = $('.x', m); if (x) x.focus(); }
  function fecharModais() { $$('.modal.is-open').forEach((m) => { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); }); document.body.style.overflow = ''; if (location.hash.startsWith('#produto/')) history.replaceState(null, '', location.pathname + location.search); }

  function abrirProduto(p) {
    if (!p) return;
    const parc = parcelas(p.preco);
    $('#productModalBody').innerHTML = `
      <div class="pmod">
        <div class="pmod__media">${p.imagem ? `<img src="${esc(p.imagem)}" alt="${esc(p.titulo)}">` : `<span aria-hidden="true">${p.emoji}</span>`}</div>
        <div class="pmod__body">
          <small style="color:var(--muted);font-weight:600">${catNome(p.categoria)} · ${esc(p.marca || '')}${p.sku ? ' · SKU ' + esc(p.sku) : ''}</small>
          <h2 id="productModalTitle">${esc(p.titulo)}</h2>
          <p class="desc">${esc(p.descricao)}</p>
          <div class="price">
            ${p.precoAntigo > p.preco ? `<s>${fmt(p.precoAntigo)}</s> <span class="off" style="position:static">-${pct(p)}%</span>` : ''}
            <strong>${fmt(p.preco)}</strong>
            <span class="pix"><svg class="icon" style="width:1em;height:1em"><use href="#i-pix"/></svg> ${fmt(precoPix(p.preco))} no Pix (${Math.round(CFG.descontoPix * 100)}% OFF)</span>
            ${parc ? `<span class="inst">ou ${parc.n}x de ${fmt(parc.valor)} sem juros no cartão</span>` : ''}
          </div>
          <ul class="bullets">
            <li>${p.estoque > 0 ? (p.estoque <= 5 ? `🔥 Últimas ${p.estoque} unidades` : '✅ Em estoque — envio em 24h') : '⛔ Esgotado — avise-me quando chegar'}</li>
            <li>${p.preco >= CFG.freteGratisAcima ? '🚚 Frete grátis para todo o Brasil' : `🚚 Frete grátis em compras acima de ${fmt(CFG.freteGratisAcima)}`}</li>
            <li>🔁 7 dias para troca ou devolução · 🧾 Nota fiscal</li>
          </ul>
          <div class="pmod__actions">
            <button class="btn btn--accent btn--lg" type="button" data-buy="${p.id}" ${p.estoque === 0 ? 'disabled' : ''}>Comprar agora</button>
            <button class="btn btn--ghost" type="button" data-add="${p.id}" ${p.estoque === 0 ? 'disabled' : ''}><svg class="icon"><use href="#i-cart"/></svg> Adicionar ao carrinho</button>
            <a class="btn btn--whats" href="${waLink(`Olá! Tenho uma dúvida sobre: ${p.titulo} (${MARCA.dominio}/p/${p.slug}.html)`)}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-whats"/></svg> Perguntar no WhatsApp</a>
          </div>
          <div class="share"><a href="p/${p.slug}.html">Ver página completa</a> · <button type="button" data-copy="${MARCA.dominio}/p/${p.slug}.html">Copiar link</button> · <a href="https://wa.me/?text=${encodeURIComponent('Olha isso: ' + p.titulo + ' ' + MARCA.dominio + '/p/' + p.slug + '.html')}" target="_blank" rel="noopener">Enviar no WhatsApp</a></div>
        </div>
      </div>`;
    abrirModal('#productModal');
    track('view_item', { value: p.preco, items: [item(p)] });
  }

  /* ---------------- Leads (cupom de boas-vindas) ---------------- */
  async function salvarLead(form) {
    const dados = Object.fromEntries(new FormData(form).entries());
    dados.whatsapp = (dados.whatsapp || '').replace(/\D/g, '');
    if (dados.whatsapp.length < 10) { toast('Digite o WhatsApp com DDD 😉'); return false; }
    const lead = { ...dados, em: new Date().toISOString(), origem: origemTexto(), cupom: CFG.cupomBoasVindas.codigo };
    LS.set('lead', lead);
    if (CFG.leadEndpoint) { try { await fetch(CFG.leadEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(lead) }); } catch (e) { /* segue mesmo offline */ } }
    track('generate_lead', { value: 0, lead_source: 'cupom_boas_vindas' });
    const ok = `<div class="ok"><p style="margin:0 0 6px">🎉 Pronto, ${esc(dados.nome.split(' ')[0])}! Seu cupom:</p><code>${CFG.cupomBoasVindas.codigo}</code><p style="margin:8px 0 0;font-size:.9rem">Use no carrinho. <a href="${waLink(`Oi! Acabei de pegar meu cupom ${CFG.cupomBoasVindas.codigo} no site da ${MARCA.nome}. Me avisa das ofertas? 😄`)}" target="_blank" rel="noopener" style="color:inherit;font-weight:700">Salvar no WhatsApp →</a></p></div>`;
    form.outerHTML = ok;
    return true;
  }
  function initPromo() {
    if (LS.get('lead', null)) return;
    const ultima = LS.get('promo_ts', 0); const tresDias = 3 * 24 * 3600 * 1000;
    if (Date.now() - ultima < tresDias) return;
    let mostrado = false;
    const mostrar = () => { if (mostrado || $('.modal.is-open') || $('#cartDrawer').classList.contains('is-open')) return; mostrado = true; LS.set('promo_ts', Date.now()); abrirModal('#promoModal'); track('view_promotion', { promotion_name: CFG.cupomBoasVindas.codigo }); };
    setTimeout(mostrar, 25000);
    document.addEventListener('mouseleave', (e) => { if (e.clientY <= 0) mostrar(); });
    let ultimoY = 0; window.addEventListener('scroll', () => { const y = window.scrollY; if (y > 1200 && y < ultimoY - 300) mostrar(); ultimoY = Math.max(ultimoY, y); }, { passive: true });
  }

  /* ---------------- Countdown / topbar / UI ---------------- */
  function initCountdown() {
    const el = $('#countdown b'); if (!el || !CFG.ofertaRelampago.ativa) return;
    const [h, m] = CFG.ofertaRelampago.terminaAs.split(':').map(Number);
    const tick = () => {
      const agora = new Date(); const fim = new Date(); fim.setHours(h, m, 59, 999);
      if (fim < agora) fim.setDate(fim.getDate() + 1);
      const d = Math.max(0, fim - agora); const hh = Math.floor(d / 3.6e6), mm = Math.floor((d % 3.6e6) / 6e4), ss = Math.floor((d % 6e4) / 1000);
      el.textContent = [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
    };
    tick(); setInterval(tick, 1000);
  }
  function initTopbar() {
    const msgs = [`🚚 Frete grátis acima de ${fmt(CFG.freteGratisAcima).replace(',00', '')} para todo o Brasil`, `💠 ${Math.round(CFG.descontoPix * 100)}% OFF no Pix · 💳 até ${CFG.parcelasMax}x sem juros`, `🎟️ Cupom ${CFG.cupomBoasVindas.codigo}: ${CFG.cupomBoasVindas.descricao}`, '🔁 Troca fácil em 7 dias · 🧾 Nota fiscal em todas as compras'];
    const el = $('#topbar'); let i = 0;
    const mostrar = () => { el.innerHTML = `<span>${msgs[i % msgs.length]}</span>`; i++; };
    mostrar(); setInterval(mostrar, 4500);
  }
  function initUI() {
    $('#cartBtn').addEventListener('click', abrirDrawer);
    $$('[data-close]').forEach((el) => el.addEventListener('click', () => { fecharDrawer(); fecharModais(); }));
    $$('.modal__backdrop').forEach((el) => el.addEventListener('click', fecharModais));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fecharDrawer(); fecharModais(); } });
    $('#menuBtn').addEventListener('click', () => { const n = $('#mobileNav'); const open = n.classList.toggle('is-open'); $('#menuBtn').setAttribute('aria-expanded', open); });
    $('#mobileNav').addEventListener('click', (e) => { if (e.target.tagName === 'A') $('#mobileNav').classList.remove('is-open'); });
    $('#favBtn').addEventListener('click', () => { filtro = { ...filtro, chip: filtro.chip === 'favoritos' ? 'all' : 'favoritos', busca: '', categoria: 'all' }; renderProdutos(); $('#produtos').scrollIntoView({ behavior: 'smooth' }); });
    $('#sortSelect').addEventListener('change', (e) => { filtro.sort = e.target.value; renderProdutos(); });
    $('#chips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; filtro.chip = c.dataset.chip; renderProdutos(); });
    $('#couponBtn').addEventListener('click', () => aplicarCupom($('#couponInput').value));
    $('#couponInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') aplicarCupom(e.target.value); });
    $('#checkoutBtn').addEventListener('click', () => checkout(false));
    $('#checkoutWa').addEventListener('click', () => checkout(true));
    $('#cartItems').addEventListener('click', (e) => {
      const b = e.target.closest('[data-qty]'); if (!b) return;
      const id = b.closest('.citem').dataset.id; const li = cart.find((i) => i.id === Number(id));
      setQty(id, b.dataset.qty === '0' ? 0 : li.qty + Number(b.dataset.qty));
    });
    // delegação global: adicionar, comprar, favoritar, abrir produto, copiar
    document.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]'); if (add) { addToCart(add.dataset.add); return; }
      const buy = e.target.closest('[data-buy]'); if (buy) { addToCart(buy.dataset.buy, 1, false); fecharModais(); abrirDrawer(); return; }
      const fav = e.target.closest('[data-fav]'); if (fav) {
        const id = Number(fav.dataset.fav); const on = !favs.includes(id);
        favs = on ? [...favs, id] : favs.filter((x) => x !== id); LS.set('favs', favs);
        $$(`[data-fav="${id}"]`).forEach((b) => b.setAttribute('aria-pressed', on));
        $('#favBadge').textContent = favs.length; $('#favBadge').dataset.zero = favs.length === 0;
        toast(on ? '❤️ Salvo nos favoritos' : 'Removido dos favoritos'); if (on) track('add_to_wishlist', { value: byId(id).preco, items: [item(byId(id))] });
        return;
      }
      const open = e.target.closest('[data-open]'); if (open) { e.preventDefault(); track('select_item', { items: [item(byId(open.dataset.open))] }); location.hash = open.getAttribute('href'); return; }
      const copy = e.target.closest('[data-copy]'); if (copy) { navigator.clipboard && navigator.clipboard.writeText(copy.dataset.copy).then(() => toast('🔗 Link copiado!')); }
    });
    $$('form[data-lead]').forEach((f) => f.addEventListener('submit', async (e) => { e.preventDefault(); await salvarLead(f); }));
    const top = $('#toTop'); window.addEventListener('scroll', () => top.classList.toggle('is-on', window.scrollY > 600), { passive: true });
    top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    $('#favBadge').textContent = favs.length; $('#favBadge').dataset.zero = favs.length === 0;
    if (cupom) $('#couponInput').value = cupom;
  }

  /* ---------------- Router (hash) ---------------- */
  function router() {
    const h = decodeURIComponent(location.hash || '');
    if (h.startsWith('#produto/')) { abrirProduto(bySlug(h.slice(9))); return; }
    fecharModais();
    if (h.startsWith('#categoria/')) { filtro = { ...filtro, categoria: h.slice(11) || 'all', busca: '', chip: 'all' }; renderProdutos(); $('#produtos').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (h.startsWith('#busca/')) { filtro = { ...filtro, busca: h.slice(7), categoria: 'all', chip: 'all' }; $('#searchInput').value = filtro.busca; renderProdutos(); $('#produtos').scrollIntoView({ behavior: 'smooth', block: 'start' }); track('search', { search_term: filtro.busca }); }
    else if (h === '#carrinho') abrirDrawer();
  }

  /* ---------------- SEO: JSON-LD gerado a partir dos dados ---------------- */
  function injetarSchema() {
    const base = MARCA.dominio;
    const org = { '@context': 'https://schema.org', '@type': 'OnlineStore', name: MARCA.nome, url: base + '/', logo: `${base}/${MARCA.logo}`, slogan: MARCA.slogan, description: MARCA.descricao, email: CFG.email, telephone: '+' + CFG.whatsapp, areaServed: 'BR', currenciesAccepted: 'BRL', paymentAccepted: 'Pix, Cartão de crédito, Boleto', sameAs: [`https://instagram.com/${MARCA.instagram}`, `https://tiktok.com/@${MARCA.tiktok}`], contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', telephone: '+' + CFG.whatsapp, availableLanguage: 'Portuguese' } };
    const site = { '@context': 'https://schema.org', '@type': 'WebSite', name: MARCA.nome, url: base + '/', inLanguage: 'pt-BR', potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${base}/#busca/{search_term_string}` }, 'query-input': 'required name=search_term_string' } };
    const lista = { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Produtos em destaque', itemListElement: PRODUTOS.map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: {
      '@type': 'Product', name: p.titulo, description: p.descricao, sku: p.sku, brand: { '@type': 'Brand', name: p.marca }, url: `${base}/p/${p.slug}.html`, image: p.imagem || undefined, category: catNome(p.categoria),
      offers: { '@type': 'Offer', priceCurrency: 'BRL', price: p.preco.toFixed(2), availability: p.estoque > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition', url: `${base}/p/${p.slug}.html`, seller: { '@type': 'Organization', name: MARCA.nome }, shippingDetails: p.preco >= CFG.freteGratisAcima ? { '@type': 'OfferShippingDetails', shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'BRL' }, shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'BR' } } : undefined, hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: 'BR', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 7, returnMethod: 'https://schema.org/ReturnByMail', returnFees: 'https://schema.org/FreeReturn' } },
      ...(CFG.seo.incluirAvaliacoesNoSchema && p.avaliacoes > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.avaliacao, reviewCount: p.avaliacoes } } : {}),
    } })) };
    const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: (window.FAQ || []).map((f) => ({ '@type': 'Question', name: f.p, acceptedAnswer: { '@type': 'Answer', text: f.r } })) };
    const bread = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: base + '/' }] };
    [org, site, lista, faq, bread].forEach((obj) => { const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(obj); document.head.appendChild(s); });
  }

  /* ---------------- Init ---------------- */
  function init() {
    aplicarMarca(); capturarAtribuicao(); carregarPixels();
    renderCategorias(); renderDeals(); renderProdutos(); renderDepoimentos(); renderFAQ(); renderCart(); salvarCart();
    initBusca(); initUI(); initCountdown(); initTopbar(); initPromo(); injetarSchema();
    window.addEventListener('hashchange', router); router();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

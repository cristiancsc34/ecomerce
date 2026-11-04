/* Páginas estáticas (produto, sobre, trocas, privacidade): aplica a marca e liga os botões. */
(function () {
  'use strict';
  const CFG = window.SITE_CONFIG; const M = CFG.marcas[CFG.marcaAtiva];
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const prefixo = document.body.dataset.pagina === 'produto' ? '../' : '';
  const r = document.documentElement.style; const c = M.cores;
  r.setProperty('--primary', c.primaria); r.setProperty('--primary-dark', c.primariaEscura); r.setProperty('--accent', c.acento); r.setProperty('--highlight', c.destaque); r.setProperty('--ink', c.tinta); r.setProperty('--font-display', M.fonteTitulos);
  $$('img[data-logo]').forEach((i) => { i.src = prefixo + M.logo; i.alt = M.nome; });
  $$('img[data-logo-branco]').forEach((i) => { i.src = prefixo + M.logoBranco; i.alt = M.nome; });
  $$('[data-marca]').forEach((e) => { e.textContent = M.nome; });
  $$('[data-ano]').forEach((e) => { e.textContent = new Date().getFullYear(); });
  $$('[data-cnpj]').forEach((e) => { e.textContent = CFG.cnpj; });
  $$('[data-email]').forEach((e) => { e.textContent = CFG.email; e.href = 'mailto:' + CFG.email; });
  $$('[data-endereco]').forEach((e) => { e.textContent = CFG.endereco; });
  $$('[data-horario]').forEach((e) => { e.textContent = CFG.horarioAtendimento; });
  $$('a[data-wa]').forEach((a) => { a.href = `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(a.dataset.wa || `Olá! Vim pelo site da ${M.nome}.`)}`; a.target = '_blank'; a.rel = 'noopener'; });
  // carrinho (compartilhado com a home via localStorage)
  const ler = () => { try { return JSON.parse(localStorage.getItem('loja_cart') || '[]'); } catch (e) { return []; } };
  const badge = document.querySelector('[data-cart-badge]');
  if (badge) { const n = ler().reduce((s, i) => s + i.qty, 0); badge.textContent = n; badge.dataset.zero = n === 0; }
  $$('[data-comprar]').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.comprar); const cart = ler(); const li = cart.find((i) => i.id === id);
    if (li) li.qty += 1; else cart.push({ id, qty: 1 });
    try { localStorage.setItem('loja_cart', JSON.stringify(cart)); } catch (e) { /* ignore */ }
    const p = (window.PRODUTOS || []).find((x) => x.id === id);
    window.dataLayer = window.dataLayer || []; if (p) window.dataLayer.push({ event: 'add_to_cart', ecommerce: { currency: 'BRL', value: p.preco, items: [{ item_id: p.sku || String(p.id), item_name: p.titulo, price: p.preco, quantity: 1 }] } });
    location.href = prefixo + 'index.html#carrinho';
  }));
})();

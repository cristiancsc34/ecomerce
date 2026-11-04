#!/usr/bin/env node
/**
 * Gera os logos (SVG com texto convertido em curvas) das 3 identidades propostas:
 *   - tcharan  (recomendação #1)
 *   - capiva   (recomendação #2 — mascote capivara)
 *   - xodoria  (recomendação #3)
 *
 * Saída: ecomerce/branding/logos/<marca>-<variante>.svg + ecomerce/branding/logos.html (preview)
 * Uso:   npm install && npm run logos
 */
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const ROOT = path.join(__dirname, '..');
const FONTS = path.join(ROOT, 'ecomerce', 'branding', 'fonts');
const OUT = path.join(ROOT, 'ecomerce', 'branding', 'logos');
fs.mkdirSync(OUT, { recursive: true });

const fontCache = {};
function font(file) {
  if (!fontCache[file]) fontCache[file] = opentype.loadSync(path.join(FONTS, file));
  return fontCache[file];
}

/** Converte texto em path SVG (origem na baseline, x=0). letterSpacing em px (opentype usa em). */
function text(fontFile, str, size, letterSpacing = 0) {
  const f = font(fontFile);
  const p = f.getPath(str, 0, 0, size, { kerning: true, letterSpacing: letterSpacing / size });
  const bb = p.getBoundingBox();
  return { d: p.toPathData(2), x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2, w: bb.x2 - bb.x1, h: bb.y2 - bb.y1 };
}

const r2 = (n) => Math.round(n * 100) / 100;

/** Estrela de 4 pontas (brilho). */
function sparkle(cx, cy, r, fill) {
  const k = 0.26;
  return `<path fill="${fill}" d="M${r2(cx)},${r2(cy - r)} L${r2(cx + r * k)},${r2(cy - r * k)} L${r2(cx + r)},${r2(cy)} L${r2(cx + r * k)},${r2(cy + r * k)} L${r2(cx)},${r2(cy + r)} L${r2(cx - r * k)},${r2(cy + r * k)} L${r2(cx - r)},${r2(cy)} L${r2(cx - r * k)},${r2(cy - r * k)}Z"/>`;
}

/* ============================================================
   IDENTIDADES
   ============================================================ */
const MARCAS = {
  tcharan: {
    nome: 'Tcharan',
    tagline: 'chegou. abriu. tcharan!',
    fonte: 'Baloo2-ExtraBold.ttf',
    fonteTagline: 'Nunito-ExtraBold.ttf',
    cores: { primaria: '#6D28D9', acento: '#FF5A36', destaque: '#FFD23F', tinta: '#2A1B5E', fundo: '#FFFFFF' },
    palavra: 'tcharan',
    // Ícone: caixa de presente abrindo com brilhos (o momento "tcharan!")
    icone(c, comFundo) {
      const box = c.box, fita = c.fita, brilho = c.brilho, brilho2 = c.brilho2;
      let s = '';
      if (comFundo) s += `<rect width="256" height="256" rx="58" fill="${c.fundo}"/>`;
      // corpo da caixa
      s += `<rect x="64" y="134" width="128" height="86" rx="16" fill="${box}"/>`;
      s += `<rect x="117" y="134" width="22" height="86" fill="${fita}"/>`;
      // tampa levantada
      s += `<g transform="translate(0,-16) rotate(-9 128 118)">`;
      s += `<rect x="50" y="102" width="156" height="34" rx="11" fill="${box}"/>`;
      s += `<rect x="117" y="102" width="22" height="34" fill="${fita}"/>`;
      s += `</g>`;
      // brilhos
      s += sparkle(80, 60, 15, brilho);
      s += sparkle(150, 40, 22, brilho);
      s += sparkle(200, 82, 12, brilho2);
      return s;
    },
    paletaIcone(mono) {
      const c = this.cores;
      if (mono === 'branco') return { fundo: 'none', box: '#FFFFFF', fita: '#FFFFFF', brilho: '#FFFFFF', brilho2: '#FFFFFF', texto: '#FFFFFF', texto2: '#FFFFFF' };
      if (mono === 'preto') return { fundo: 'none', box: '#111111', fita: '#111111', brilho: '#111111', brilho2: '#111111', texto: '#111111', texto2: '#111111' };
      return { fundo: c.primaria, box: '#FFFFFF', fita: c.acento, brilho: c.destaque, brilho2: c.acento, texto: c.primaria, texto2: c.acento };
    },
    // wordmark: "tcharan" na cor primária + "!" em coral
    wordmark(c, size) {
      const a = text(this.fonte, 'tcharan', size, -1);
      const b = text(this.fonte, '!', size);
      const gap = size * 0.06;
      const bx = a.x2 + gap - b.x1;
      return {
        svg: `<path fill="${c.texto}" d="${a.d}"/><path fill="${c.texto2}" transform="translate(${r2(bx)},0)" d="${b.d}"/>`,
        x1: a.x1, y1: Math.min(a.y1, b.y1), x2: bx + b.x2, y2: Math.max(a.y2, b.y2),
      };
    },
  },

  capiva: {
    nome: 'Capiva',
    tagline: 'tem de tudo. é de boa.',
    fonte: 'Fredoka-Bold.ttf',
    fonteTagline: 'Nunito-ExtraBold.ttf',
    cores: { primaria: '#0F9D9A', acento: '#8B5E34', destaque: '#F5B700', tinta: '#0B4F4D', fundo: '#FFF7E8' },
    palavra: 'capiva',
    // Ícone: cabeça de capivara boiando na água (com a laranjinha do meme)
    icone(c, comFundo) {
      let s = '';
      s += `<defs><clipPath id="cp-circ"><circle cx="128" cy="128" r="128"/></clipPath></defs>`;
      if (comFundo) s += `<circle cx="128" cy="128" r="128" fill="${c.fundo}"/>`;
      // orelhas (pequenas, nas laterais do alto da cabeça — capivara, não urso)
      s += `<ellipse cx="70" cy="98" rx="13" ry="15" fill="${c.pele}"/><ellipse cx="186" cy="98" rx="13" ry="15" fill="${c.pele}"/>`;
      s += `<ellipse cx="70" cy="100" rx="6" ry="8" fill="${c.peleEscura}"/><ellipse cx="186" cy="100" rx="6" ry="8" fill="${c.peleEscura}"/>`;
      // cabeça larga e quadradona
      s += `<rect x="54" y="86" width="148" height="110" rx="46" fill="${c.pele}"/>`;
      // focinho grande e reto (marca registrada da capivara)
      s += `<rect x="80" y="130" width="96" height="66" rx="30" fill="${c.focinho}"/>`;
      // nariz largo
      s += `<rect x="104" y="140" width="48" height="18" rx="9" fill="${c.peleEscura}"/>`;
      // olhos pequenos, altos e bem separados
      s += `<circle cx="92" cy="118" r="6" fill="${c.olho}"/><circle cx="164" cy="118" r="6" fill="${c.olho}"/>`;
      s += `<circle cx="94" cy="116" r="2.2" fill="${c.brilhoOlho}"/><circle cx="166" cy="116" r="2.2" fill="${c.brilhoOlho}"/>`;
      // boca serena
      s += `<path d="M116,174 q12,9 24,0" fill="none" stroke="${c.peleEscura}" stroke-width="4.5" stroke-linecap="round"/>`;
      // laranjinha (meme da capivara de boa)
      s += `<circle cx="152" cy="76" r="14" fill="${c.laranja}"/><ellipse cx="159" cy="61" rx="8" ry="3.8" transform="rotate(-30 159 61)" fill="${c.folha}"/>`;
      // água
      s += `<g clip-path="url(#cp-circ)"><path d="M-10,202 Q22,186 54,202 T118,202 T182,202 T246,202 T310,202 V270 H-10 Z" fill="${c.agua}"/></g>`;
      return s;
    },
    paletaIcone(mono) {
      const c = this.cores;
      if (mono === 'branco') return { fundo: 'none', pele: '#FFFFFF', peleEscura: '#0B4F4D', focinho: '#FFFFFF', olho: '#0B4F4D', brilhoOlho: '#FFFFFF', laranja: '#FFFFFF', folha: '#FFFFFF', agua: 'rgba(255,255,255,0.55)', texto: '#FFFFFF', texto2: '#FFFFFF' };
      if (mono === 'preto') return { fundo: 'none', pele: '#111111', peleEscura: '#FFFFFF', focinho: '#111111', olho: '#FFFFFF', brilhoOlho: '#111111', laranja: '#111111', folha: '#111111', agua: 'rgba(17,17,17,0.35)', texto: '#111111', texto2: '#111111' };
      return { fundo: c.primaria, pele: c.acento, peleEscura: '#3B2416', focinho: '#C48E5C', olho: '#1F1410', brilhoOlho: '#FFFFFF', laranja: '#F59E0B', folha: '#3FA34D', agua: '#5FD3CE', texto: c.tinta, texto2: c.primaria };
    },
    wordmark(c, size) {
      const a = text(this.fonte, 'capiva', size, -1.5);
      return { svg: `<path fill="${c.texto}" d="${a.d}"/>`, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 };
    },
  },

  xodoria: {
    nome: 'Xodoria',
    tagline: 'a loja dos seus xodós',
    fonte: 'Chewy-Regular.ttf',
    fonteTagline: 'Nunito-ExtraBold.ttf',
    cores: { primaria: '#FF4F6E', acento: '#5B2A86', destaque: '#FFE08A', tinta: '#3D1A5C', fundo: '#FFF5F7' },
    palavra: 'xodoria',
    // Ícone: sacola em formato de coração
    icone(c, comFundo) {
      let s = '';
      if (comFundo) s += `<rect width="256" height="256" rx="58" fill="${c.fundo}"/>`;
      // alça
      s += `<path d="M98,92 C98,52 158,52 158,92" fill="none" stroke="${c.alca}" stroke-width="13" stroke-linecap="round"/>`;
      // coração (sacola)
      s += `<path fill="${c.coracao}" d="M128,214 C120,206 56,160 56,114 C56,88 76,70 100,70 C113,70 123,77 128,86 C133,77 143,70 156,70 C180,70 200,88 200,114 C200,160 136,206 128,214 Z"/>`;
      // brilho
      s += `<path d="M84,112 C84,96 92,88 104,86" fill="none" stroke="${c.brilho}" stroke-width="9" stroke-linecap="round"/>`;
      return s;
    },
    paletaIcone(mono) {
      const c = this.cores;
      if (mono === 'branco') return { fundo: 'none', alca: '#FFFFFF', coracao: '#FFFFFF', brilho: 'rgba(0,0,0,0.25)', texto: '#FFFFFF', texto2: '#FFFFFF' };
      if (mono === 'preto') return { fundo: 'none', alca: '#111111', coracao: '#111111', brilho: '#FFFFFF', texto: '#111111', texto2: '#111111' };
      return { fundo: c.acento, alca: c.destaque, coracao: c.primaria, brilho: '#FFFFFF', texto: c.tinta, texto2: c.primaria };
    },
    wordmark(c, size) {
      const a = text(this.fonte, 'xodoria', size, 0.5);
      return { svg: `<path fill="${c.texto}" d="${a.d}"/>`, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 };
    },
  },
};

/* ============================================================
   MONTAGEM DAS VARIANTES
   ============================================================ */
function svgWrap(w, h, inner, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(w)} ${r2(h)}" width="${r2(w)}" height="${r2(h)}" role="img" aria-label="${title}">\n${inner}\n</svg>\n`;
}

function gerarIcone(key, m, mono) {
  const c = m.paletaIcone(mono);
  return svgWrap(256, 256, m.icone(c, mono ? false : true), `${m.nome} — ícone`);
}

function gerarHorizontal(key, m, mono) {
  const c = m.paletaIcone(mono);
  const S = 120, gap = 26, pad = 10;
  const wm = m.wordmark(c, 112);
  const wmH = wm.y2 - wm.y1;
  const total = S + gap + (wm.x2 - wm.x1) + pad * 2;
  const H = S + pad * 2;
  const ty = pad + S / 2 - (wm.y1 + wmH / 2); // centraliza verticalmente
  const tx = pad + S + gap - wm.x1;
  let inner = `<g transform="translate(${pad},${pad}) scale(${r2(S / 256)})">${m.icone(c, !mono)}</g>`;
  inner += `<g transform="translate(${r2(tx)},${r2(ty)})">${wm.svg}</g>`;
  return svgWrap(total, H, inner, `${m.nome} — logo horizontal`);
}

function gerarVertical(key, m, mono) {
  const c = m.paletaIcone(mono);
  const S = 176, pad = 16;
  const wm = m.wordmark(c, 120);
  const tg = text(m.fonteTagline, m.tagline, 30, 1);
  const W = Math.max(S, wm.x2 - wm.x1, tg.x2 - tg.x1) + pad * 2;
  const yIcon = pad;
  const yWord = yIcon + S + 22 - wm.y1;
  const yTag = yWord + wm.y2 + 20 - tg.y1;
  const H = yTag + tg.y2 + pad;
  let inner = `<g transform="translate(${r2((W - S) / 2)},${yIcon}) scale(${r2(S / 256)})">${m.icone(c, !mono)}</g>`;
  inner += `<g transform="translate(${r2((W - (wm.x2 - wm.x1)) / 2 - wm.x1)},${r2(yWord)})">${wm.svg}</g>`;
  inner += `<g transform="translate(${r2((W - (tg.x2 - tg.x1)) / 2 - tg.x1)},${r2(yTag)})"><path fill="${c.texto2}" d="${tg.d}"/></g>`;
  return svgWrap(W, H, inner, `${m.nome} — logo vertical com slogan`);
}

function gerarWordmark(key, m, mono) {
  const c = m.paletaIcone(mono);
  const pad = 8;
  const wm = m.wordmark(c, 112);
  const W = wm.x2 - wm.x1 + pad * 2, H = wm.y2 - wm.y1 + pad * 2;
  const inner = `<g transform="translate(${r2(pad - wm.x1)},${r2(pad - wm.y1)})">${wm.svg}</g>`;
  return svgWrap(W, H, inner, `${m.nome} — wordmark`);
}

const geradas = [];
for (const [key, m] of Object.entries(MARCAS)) {
  const variantes = {
    'icone': gerarIcone(key, m, null),
    'icone-mono-branco': gerarIcone(key, m, 'branco'),
    'icone-mono-preto': gerarIcone(key, m, 'preto'),
    'horizontal': gerarHorizontal(key, m, null),
    'horizontal-mono-branco': gerarHorizontal(key, m, 'branco'),
    'horizontal-mono-preto': gerarHorizontal(key, m, 'preto'),
    'vertical': gerarVertical(key, m, null),
    'vertical-mono-branco': gerarVertical(key, m, 'branco'),
    'wordmark': gerarWordmark(key, m, null),
  };
  for (const [v, svg] of Object.entries(variantes)) {
    const file = `${key}-${v}.svg`;
    fs.writeFileSync(path.join(OUT, file), svg);
    geradas.push(file);
  }
  // favicon = ícone
  fs.writeFileSync(path.join(OUT, `${key}-favicon.svg`), variantes['icone']);
}

/* ============================================================
   PREVIEW HTML
   ============================================================ */
const cards = Object.entries(MARCAS).map(([key, m]) => {
  const c = m.cores;
  const sw = Object.entries(c).map(([n, v]) => `<span class="sw" style="background:${v}" title="${n}: ${v}"><i>${n}</i><b>${v}</b></span>`).join('');
  return `
  <section class="marca" id="${key}">
    <header>
      <h2>${m.nome}</h2>
      <p class="tag">“${m.tagline}”</p>
      <div class="swatches">${sw}</div>
    </header>
    <div class="grid">
      <figure class="light"><img src="logos/${key}-horizontal.svg" alt=""><figcaption>horizontal (fundo claro)</figcaption></figure>
      <figure class="dark"><img src="logos/${key}-horizontal-mono-branco.svg" alt=""><figcaption>horizontal mono branco (fundo escuro)</figcaption></figure>
      <figure class="brand" style="background:${c.primaria}"><img src="logos/${key}-horizontal-mono-branco.svg" alt=""><figcaption>sobre a cor da marca</figcaption></figure>
      <figure class="light"><img src="logos/${key}-vertical.svg" alt="" class="tall"><figcaption>vertical + slogan</figcaption></figure>
      <figure class="light icons"><img src="logos/${key}-icone.svg" alt="" style="width:96px"><img src="logos/${key}-icone.svg" alt="" style="width:48px"><img src="logos/${key}-icone.svg" alt="" style="width:24px"><figcaption>ícone / app / favicon (96 · 48 · 24 px)</figcaption></figure>
      <figure class="light"><img src="logos/${key}-horizontal-mono-preto.svg" alt=""><figcaption>mono preto (impressão, nota fiscal, etiqueta)</figcaption></figure>
    </div>
  </section>`;
}).join('\n');

// Propostas geradas por IA (scripts/gerar-logos-ia.js), se existirem
const IA = path.join(OUT, 'ia');
const iaFiles = fs.existsSync(IA) ? fs.readdirSync(IA).filter((f) => f.endsWith('.png')).sort() : [];
const iaSection = iaFiles.length ? `
  <section class="marca" id="ia">
    <header><h2>Propostas geradas por IA (OpenAI gpt-image)</h2><p class="tag">PNG com fundo transparente · para virar vetor, use Illustrator (Image Trace), Inkscape (Trace Bitmap) ou vectorizer.ai</p></header>
    <div class="grid">
      ${iaFiles.map((f) => `<figure class="light"><img src="logos/ia/${f}" alt="" style="height:${f.includes('horizontal') ? '110' : '200'}px"><figcaption>${f.replace('.png', '')}</figcaption></figure>`).join('')}
    </div>
  </section>` : '';

const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Logos — propostas de identidade</title>
<style>
  :root{--bg:#f6f6f8;--ink:#15121f;--muted:#6b6880;--card:#fff}
  *{box-sizing:border-box} body{margin:0;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--ink)}
  .wrap{max-width:1180px;margin:0 auto;padding:32px 20px 80px}
  h1{font-size:28px;margin:0 0 6px} .lead{color:var(--muted);margin:0 0 28px;max-width:760px;line-height:1.5}
  .marca{background:var(--card);border-radius:20px;padding:24px;margin:0 0 28px;box-shadow:0 8px 30px rgba(20,10,60,.06)}
  .marca header{display:flex;flex-wrap:wrap;align-items:center;gap:14px 24px;margin-bottom:18px}
  .marca h2{margin:0;font-size:24px} .tag{margin:0;color:var(--muted);font-style:italic}
  .swatches{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
  .sw{display:inline-flex;flex-direction:column;justify-content:flex-end;width:92px;height:56px;border-radius:10px;padding:6px;color:#fff;font-size:10px;line-height:1.2;text-shadow:0 1px 2px rgba(0,0,0,.35)}
  .sw i{font-style:normal;opacity:.9} .sw b{font-weight:700}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
  figure{margin:0;border-radius:16px;padding:28px 20px 16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-height:190px;border:1px solid rgba(0,0,0,.06)}
  figure img{max-width:100%;height:64px;width:auto} figure img.tall{height:200px}
  figure.icons{flex-direction:row;flex-wrap:wrap;align-items:center} figure.icons img{height:auto}
  figure.icons figcaption{flex-basis:100%}
  figcaption{font-size:12px;color:var(--muted);text-align:center}
  .light{background:#fff} .dark{background:#15121f} .dark figcaption,.brand figcaption{color:rgba(255,255,255,.75)}
  .note{font-size:13px;color:var(--muted);line-height:1.6;background:#fff;border-radius:14px;padding:16px 18px}
  code{background:#eee;padding:1px 5px;border-radius:5px}
  @media (prefers-color-scheme:dark){:root{--bg:#121018;--ink:#f3f1f8;--muted:#a9a5bd;--card:#1b1826} .light{background:#f7f7fa} .light figcaption{color:#555}}
</style></head><body><div class="wrap">
<h1>Propostas de logo — 3 identidades</h1>
<p class="lead">Arquivos SVG com texto já convertido em curvas (não dependem de fonte instalada). Cada marca tem versões horizontal, vertical com slogan, ícone/favicon e monocromáticas. Para trocar a marca ativa da loja, edite <code>marcaAtiva</code> em <code>assets/js/config.js</code>.</p>
${cards}
${iaSection}
<p class="note"><b>Como usar:</b> ícone → favicon, app, foto de perfil (Instagram/TikTok/WhatsApp); horizontal → cabeçalho do site, e-mails, nota fiscal; vertical → embalagem, cartão, capa de redes; mono → carimbo, etiqueta térmica, bordado. Área de proteção mínima: a altura do ícone ÷ 4 em todos os lados. Tamanho mínimo do horizontal: 110 px de largura.</p>
</div></body></html>
`;
fs.writeFileSync(path.join(ROOT, 'ecomerce', 'branding', 'logos.html'), html);

console.log(`OK — ${geradas.length} SVGs em ecomerce/branding/logos/ + ecomerce/branding/logos.html`);

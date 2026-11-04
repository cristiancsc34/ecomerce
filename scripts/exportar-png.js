#!/usr/bin/env node
/**
 * Exporta PNGs a partir dos SVGs de logo (ícones de app, favicon, apple-touch, logo 2x)
 * e gera a imagem Open Graph (1200x630) de cada marca — usada em WhatsApp, Instagram, Facebook, etc.
 * Requer Playwright + Chromium instalados (require('playwright')).
 *
 * Uso: npm run png
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'ecomerce');
const LOGOS = path.join(ROOT, 'branding', 'logos');
const PNG = path.join(LOGOS, 'png');
const OG = path.join(ROOT, 'branding', 'og');
fs.mkdirSync(PNG, { recursive: true });
fs.mkdirSync(OG, { recursive: true });

// Lê a configuração da loja (mesmo arquivo usado pelo site)
const sandbox = { window: {} };
new Function('window', fs.readFileSync(path.join(ROOT, 'assets', 'js', 'config.js'), 'utf8'))(sandbox.window);
const CFG = sandbox.window.SITE_CONFIG;

// SVG embutido inline (páginas about:blank não podem carregar file://)
const svgSize = (file) => {
  const s = fs.readFileSync(file, 'utf8');
  const m = s.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  return { w: parseFloat(m[1]), h: parseFloat(m[2]) };
};
const svgInline = (file, width, height) =>
  fs.readFileSync(file, 'utf8')
    .replace(/ width="[\d.]+" height="[\d.]+"/, '')
    .replace('<svg ', `<svg style="display:block;width:${width}px;height:${height}px" `);

async function shotSvg(browser, svgFile, outFile, width, scale = 1) {
  const { w, h } = svgSize(svgFile);
  const height = Math.round((width * h) / w);
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.setContent(`<html><body style="margin:0;background:transparent">${svgInline(svgFile, width, height)}</body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: outFile, omitBackground: true });
  await ctx.close();
}

async function og(browser, key, marca) {
  const c = marca.cores;
  const logoBranco = path.join(ROOT, marca.logoBranco);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#fff;
      background:linear-gradient(135deg,${c.primaria} 0%,${c.primariaEscura} 100%);position:relative}
    .glow{position:absolute;right:-120px;top:-160px;width:620px;height:620px;border-radius:50%;background:${c.destaque};opacity:.18;filter:blur(10px)}
    .glow2{position:absolute;left:-140px;bottom:-220px;width:520px;height:520px;border-radius:50%;background:${c.acento};opacity:.22}
    .box{position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between}
    .logo{height:110px;width:auto;display:block}
    h1{font-size:64px;line-height:1.05;margin:0 0 18px;font-weight:800;letter-spacing:-1px;max-width:900px}
    p{font-size:28px;margin:0 0 26px;opacity:.92;max-width:860px}
    .chips{display:flex;gap:14px;flex-wrap:wrap}
    .chip{background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.35);padding:12px 22px;border-radius:999px;font-size:24px;font-weight:700}
    .url{font-size:26px;font-weight:700;opacity:.9;letter-spacing:.5px}
  </style></head><body>
  <div class="glow"></div><div class="glow2"></div>
  <div class="box">
    ${(() => { const { w, h } = svgSize(logoBranco); return svgInline(logoBranco, Math.round((110 * w) / h), 110).replace('<svg ', '<svg class="logo" '); })()}
    <div>
      <h1>${marca.slogan}</h1>
      <p>${marca.descricao}</p>
      <div class="chips"><span class="chip">🚚 Frete grátis acima de R$ ${CFG.freteGratisAcima}</span><span class="chip">💠 Pix com ${Math.round(CFG.descontoPix * 100)}% OFF</span><span class="chip">💳 até ${CFG.parcelasMax}x sem juros</span></div>
    </div>
    <div class="url">${marca.dominio.replace(/^https?:\/\//, '')}</div>
  </div></body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OG, `${key}-og.png`), type: 'png' });
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const [key, marca] of Object.entries(CFG.marcas)) {
    const icone = path.join(LOGOS, `${key}-icone.svg`);
    const horiz = path.join(LOGOS, `${key}-horizontal.svg`);
    const horizBranco = path.join(LOGOS, `${key}-horizontal-mono-branco.svg`);
    await shotSvg(browser, icone, path.join(PNG, `${key}-icone-512.png`), 512);
    await shotSvg(browser, icone, path.join(PNG, `${key}-icone-192.png`), 192);
    await shotSvg(browser, icone, path.join(PNG, `${key}-apple-touch-icon.png`), 180);
    await shotSvg(browser, icone, path.join(PNG, `${key}-favicon-32.png`), 32);
    await shotSvg(browser, horiz, path.join(PNG, `${key}-horizontal@2x.png`), 600, 2);
    await shotSvg(browser, horizBranco, path.join(PNG, `${key}-horizontal-branco@2x.png`), 600, 2);
    await og(browser, key, marca);
    console.log(`✓ ${key}`);
  }
  await browser.close();
  console.log('PNGs em ecomerce/branding/logos/png/ e OG em ecomerce/branding/og/');
})();

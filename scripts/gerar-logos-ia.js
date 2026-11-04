#!/usr/bin/env node
/**
 * Gera propostas de logo com a API de imagens da OpenAI (gpt-image-2.5 / gpt-image-2 / gpt-image-1).
 *
 * A chave NUNCA fica no código: leia de uma variável de ambiente.
 *   Linux/macOS:          export OPENAI_API_KEY="sk-..."   &&  npm run logos:ia
 *   Windows (PowerShell): $env:OPENAI_API_KEY="sk-..."    ;   npm run logos:ia
 *   Arquivo .env (já está no .gitignore, nunca é commitado):  OPENAI_API_KEY=sk-...
 *      e rode:  set -a; . ./.env; set +a; npm run logos:ia
 *   Claude Code na nuvem: menu do ambiente (barra de título da sessão) → Edit → Network secrets /
 *      variáveis de ambiente → OPENAI_API_KEY. Uma sessão nova já enxerga a variável.
 *
 * Opcionais: OPENAI_IMAGE_MODEL (padrão gpt-image-2.5-sunburst), OPENAI_IMAGE_QUALITY (low|medium|high; padrão high)
 * Filtro:    node scripts/gerar-logos-ia.js tcharan      (gera só os pedidos cujo nome contém "tcharan")
 *
 * Saída: ecomerce/branding/logos/ia/*.png (fundo transparente)
 * Custo aproximado: ~US$ 0,15–0,30 por imagem em qualidade high (varia por modelo/tamanho).
 */
const fs = require('fs');
const path = require('path');

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error('✖ Defina a variável de ambiente OPENAI_API_KEY antes de rodar (veja o cabeçalho deste arquivo).');
  process.exit(1);
}
const CADEIA = [process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst', 'gpt-image-2', 'gpt-image-1'].filter((m, i, a) => a.indexOf(m) === i);
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'high';
const OUT = path.join(__dirname, '..', 'ecomerce', 'branding', 'logos', 'ia');
fs.mkdirSync(OUT, { recursive: true });
const filtro = process.argv.slice(2);

const ESTILO = ' Flat vector logo style, clean geometric shapes, solid colors only, no gradients, no shadows, no 3D, no mockup, no background scene, no watermark, isolated on a transparent background, centered, high contrast, professional branding for a Brazilian e-commerce store.';

const PEDIDOS = [
  {
    nome: 'tcharan-logo-horizontal', size: '1536x1024',
    prompt: 'Logo for a Brazilian online store named "tcharan" (the Portuguese "ta-da!" sound when a gift is revealed). Horizontal lockup: on the left an icon of a gift box with the lid popping open and three four-point sparkles bursting out; on the right the wordmark "tcharan!" in lowercase, bold, rounded sans-serif letters. Colors: deep violet #6D28D9, coral orange #FF5A36, bright yellow #FFD23F and white. The word must be spelled exactly "tcharan" followed by an exclamation mark.' + ESTILO,
  },
  {
    nome: 'tcharan-icone', size: '1024x1024',
    prompt: 'App icon for the brand "tcharan": a rounded square in deep violet #6D28D9 containing a white gift box with a coral #FF5A36 ribbon, lid popping open, and three bright yellow #FFD23F four-point sparkles bursting out. No text, no letters.' + ESTILO,
  },
  {
    nome: 'capiva-logo-horizontal', size: '1536x1024',
    prompt: 'Logo for a Brazilian online store named "capiva". Horizontal lockup: on the left a friendly minimalist capybara head mascot, calm and smiling, floating in teal water with a tiny orange fruit resting on its head, inside a teal #0F9D9A circle; on the right the wordmark "capiva" in lowercase, bold, rounded, friendly letters colored dark teal #0B4F4D. Colors: teal #0F9D9A, warm brown #8B5E34, sunny yellow #F5B700, cream. The word must be spelled exactly "capiva".' + ESTILO,
  },
  {
    nome: 'capiva-mascote', size: '1024x1024',
    prompt: 'Mascot character for the brand "capiva": a cute, relaxed capybara sitting calmly with a tiny orange on its head and a small shopping bag beside it, flat vector illustration with a friendly smile, thick clean outlines, warm brown #8B5E34 fur, teal #0F9D9A and yellow #F5B700 accents. No text, no letters.' + ESTILO,
  },
  {
    nome: 'xodoria-logo-horizontal', size: '1536x1024',
    prompt: 'Logo for a Brazilian online store named "xodoria" ("xodó" means a beloved favorite thing). Horizontal lockup: on the left an icon of a heart-shaped shopping bag with a rounded handle inside a plum #5B2A86 rounded square; on the right the wordmark "xodoria" in lowercase, playful, bold, rounded letters colored plum #5B2A86. Colors: coral pink #FF4F6E, plum purple #5B2A86, butter yellow #FFE08A. The word must be spelled exactly "xodoria".' + ESTILO,
  },
  {
    nome: 'xodoria-icone', size: '1024x1024',
    prompt: 'App icon for the brand "xodoria": a plum #5B2A86 rounded square with a coral pink #FF4F6E heart-shaped shopping bag that has a butter yellow #FFE08A rounded handle and a small white highlight. No text, no letters.' + ESTILO,
  },
];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function chamar(model, p) {
  const body = { model, prompt: p.prompt, n: 1, size: p.size, quality: QUALITY, background: 'transparent', output_format: 'png' };
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${res.status} ${(j.error && j.error.message) || JSON.stringify(j)}`);
    err.status = res.status;
    throw err;
  }
  const d = j.data && j.data[0];
  if (d && d.b64_json) return Buffer.from(d.b64_json, 'base64');
  if (d && d.url) return Buffer.from(await (await fetch(d.url)).arrayBuffer());
  throw new Error('resposta sem imagem');
}

(async () => {
  const lista = PEDIDOS.filter((p) => !filtro.length || filtro.some((f) => p.nome.includes(f)));
  console.log(`Gerando ${lista.length} imagem(ns) — modelos: ${CADEIA.join(' → ')} (qualidade ${QUALITY})`);
  let idx = 0; // posição na cadeia de modelos
  for (const p of lista) {
    const file = path.join(OUT, `${p.nome}.png`);
    process.stdout.write(`• ${p.nome} [${CADEIA[idx]}] ... `);
    let ok = false;
    for (let tentativa = 0; tentativa < 4 && !ok; tentativa++) {
      try {
        const buf = await chamar(CADEIA[idx], p);
        fs.writeFileSync(file, buf);
        console.log(`ok (${(buf.length / 1024).toFixed(0)} KB)`);
        ok = true;
      } catch (e) {
        const msg = e.message.slice(0, 160);
        if ((e.status === 400 || e.status === 403 || e.status === 404) && idx < CADEIA.length - 1) {
          idx++;
          process.stdout.write(`\n  ↳ ${msg}\n  ↳ trocando para ${CADEIA[idx]} ... `);
        } else if (e.status === 429 || e.status >= 500) {
          process.stdout.write(`\n  ↳ ${msg} — aguardando 20s ... `);
          await dormir(20000);
        } else {
          console.log(`FALHOU: ${msg}`);
          break;
        }
      }
    }
    if (!ok && !fs.existsSync(file)) console.log(`  ✖ ${p.nome} não foi gerado`);
    await dormir(1500);
  }
  console.log(`\nArquivos em ${path.relative(process.cwd(), OUT)}/`);
})();

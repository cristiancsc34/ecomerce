// Servidor local que imita a Vercel: arquivos estáticos + funções em /api.
// Uso: npm run dev  (ou: node scripts/dev-server.mjs [porta])
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PORTA = Number(process.argv[2] || process.env.PORT || 3000);
const TIPOS = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
    '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg',
};

function comAjudantes(res) {
    res.status = (codigo) => { res.statusCode = codigo; return res; };
    res.json = (obj) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); return res; };
    res.send = (corpo) => { res.end(corpo); return res; };
    return res;
}

async function lerCorpo(req) {
    const partes = [];
    for await (const p of req) partes.push(p);
    const bruto = Buffer.concat(partes).toString('utf8');
    if (!bruto) return undefined;
    if ((req.headers['content-type'] || '').includes('application/json')) {
        try { return JSON.parse(bruto); } catch { return bruto; }
    }
    return bruto;
}

createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
        if (url.pathname.startsWith('/api/')) {
            const nome = url.pathname.slice(5).replace(/\/$/, '');
            if (!/^[a-z0-9/-]+$/.test(nome) || nome.split('/').some(p => p.startsWith('_'))) { res.statusCode = 404; return res.end('Not found'); }
            const arquivo = join(RAIZ, 'api', `${nome}.js`);
            await stat(arquivo);
            const { default: handler } = await import(pathToFileURL(arquivo).href);
            req.query = Object.fromEntries(url.searchParams);
            req.body = await lerCorpo(req);
            return await handler(req, comAjudantes(res));
        }
        let caminho = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
        if (caminho === '' || caminho.endsWith(sep)) caminho = join(caminho, 'index.html');
        const arquivo = join(RAIZ, caminho);
        if (!arquivo.startsWith(RAIZ) || caminho.startsWith('api') || caminho.startsWith('node_modules')) { res.statusCode = 404; return res.end('Not found'); }
        const dados = await readFile(arquivo);
        res.setHeader('Content-Type', TIPOS[extname(arquivo)] || 'application/octet-stream');
        res.end(dados);
    } catch (erro) {
        if (erro.code === 'ENOENT') { res.statusCode = 404; return res.end('Not found'); }
        console.error(erro);
        res.statusCode = 500; res.end('Erro interno');
    }
}).listen(PORTA, () => console.log(`AzConfort rodando em http://localhost:${PORTA}`));

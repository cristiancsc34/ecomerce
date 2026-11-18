// Utilidades HTTP das funções serverless (formato Vercel: req.body, res.status().json()).

export class ErroValidacao extends Error {
    constructor(mensagem, campo) { super(mensagem); this.status = 400; this.campo = campo; }
}

export class ErroNegocio extends Error {
    constructor(mensagem, campo) { super(mensagem); this.status = 422; this.campo = campo; }
}

export class ErroConfiguracao extends Error {
    constructor(mensagem) { super(mensagem); this.status = 503; }
}

export function lerCorpo(req) {
    const b = req.body;
    if (b == null || b === '') return {};
    if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
    try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : b); } catch {
        throw new ErroValidacao('Corpo da requisição inválido (JSON esperado).');
    }
}

// Envolve um handler: método permitido, erros padronizados, sem cache.
export function rota(metodos, fn) {
    return async function handler(req, res) {
        res.setHeader('Cache-Control', 'no-store');
        if (!metodos.includes(req.method)) {
            res.setHeader('Allow', metodos.join(', '));
            return res.status(405).json({ mensagem: 'Método não permitido.' });
        }
        try {
            const resultado = await fn(req, res);
            if (!res.headersSent) res.status(200).json(resultado);
        } catch (erro) {
            if (erro.status && erro.status < 500 || erro instanceof ErroConfiguracao) {
                return res.status(erro.status).json({ mensagem: erro.message, campo: erro.campo });
            }
            console.error('[api] erro inesperado:', erro);
            res.status(500).json({ mensagem: 'Erro interno. Tente novamente em instantes.' });
        }
    };
}

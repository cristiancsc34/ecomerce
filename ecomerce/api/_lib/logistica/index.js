// Cotação de frete com várias transportadoras ao mesmo tempo.
//
// Para adicionar uma transportadora nova (Frenet, Kangu, Correios direto, Loggi...):
//   1. crie transportadoras/<nome>.js exportando { id, configurada(config), cotar(contexto) }
//   2. registre abaixo em TRANSPORTADORAS
//   3. inclua o id em LOGISTICA_TRANSPORTADORAS (ex.: "tabela,melhorenvio,<nome>")
import { tabela } from './transportadoras/tabela.js';
import { melhorEnvio } from './transportadoras/melhorenvio.js';
import { cepParaUF, regiaoDaUF, limparCep } from './cep.js';
import { buscarProduto } from '../../../assets/js/catalogo.js';
import { CONFIG_LOJA } from '../../../assets/js/config-loja.js';
import { arredondar } from '../../../assets/js/validacao.js';
import { ErroValidacao, ErroNegocio, ErroConfiguracao } from '../http.js';

export const TRANSPORTADORAS = { tabela, melhorenvio: melhorEnvio };

// Converte [{id, qtd}] vindos do navegador em itens do catálogo (preço/peso do servidor).
export function resolverItens(itens) {
    if (!Array.isArray(itens) || itens.length === 0) throw new ErroValidacao('O carrinho está vazio.');
    if (itens.length > 50) throw new ErroValidacao('Itens demais no carrinho.');
    const vistos = new Map();
    for (const i of itens) {
        const produto = buscarProduto(i?.id);
        const qtd = Number(i?.qtd);
        if (!produto) throw new ErroValidacao('Um dos produtos do carrinho não está mais disponível.');
        if (!Number.isInteger(qtd) || qtd < 1 || qtd > CONFIG_LOJA.maxPorItem) {
            throw new ErroValidacao(`Quantidade inválida para "${produto.titulo}".`);
        }
        const atual = vistos.get(produto.id);
        vistos.set(produto.id, { ...produto, qtd: Math.min((atual?.qtd || 0) + qtd, CONFIG_LOJA.maxPorItem) });
    }
    return [...vistos.values()];
}

function comTimeout(promessa, ms, controlador) {
    let timer;
    return Promise.race([
        promessa,
        new Promise((_, rej) => { timer = setTimeout(() => { controlador.abort(); rej(new Error(`tempo esgotado (${ms} ms)`)); }, ms); }),
    ]).finally(() => clearTimeout(timer));
}

export async function cotarFrete({ cep, itens }, config, opcoes = {}) {
    const cepDestino = limparCep(cep);
    const uf = cepParaUF(cepDestino);
    if (!uf) throw new ErroValidacao('CEP inválido.', 'cep');
    const itensResolvidos = resolverItens(itens);
    const subtotal = arredondar(itensResolvidos.reduce((s, i) => s + i.preco * i.qtd, 0));
    const log = config.logistica;

    const ativas = log.transportadoras.map(id => TRANSPORTADORAS[id]).filter(t => t && t.configurada(config));
    if (ativas.length === 0) throw new ErroConfiguracao('Nenhuma transportadora configurada na loja.');

    const resultados = await Promise.allSettled(ativas.map(t => {
        const controlador = new AbortController();
        const contexto = { cepOrigem: log.cepOrigem, cepDestino, itens: itensResolvidos, config, signal: controlador.signal, ...opcoes };
        return comTimeout(t.cotar(contexto), log.timeoutMs, controlador)
            .then(lista => lista.map(o => ({ ...o, id: `${t.id}:${o.servicoId}` })));
    }));

    const avisos = [];
    resultados.forEach((r, i) => {
        if (r.status === 'rejected') {
            console.error(`[frete] ${ativas[i].id} falhou:`, r.reason?.message || r.reason);
            avisos.push(`${ativas[i].id} indisponível no momento`);
        }
    });

    let opcoesFrete = resultados
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value)
        .map(o => ({ ...o, prazoDias: o.prazoDias + log.diasManuseio, preco: arredondar(o.preco) }))
        .sort((a, b) => a.preco - b.preco || a.prazoDias - b.prazoDias);

    if (opcoesFrete.length === 0) {
        if (avisos.length === ativas.length) throw new ErroConfiguracao('Não conseguimos calcular o frete agora. Tente novamente em instantes.');
        throw new ErroNegocio('Não há opção de entrega para esses itens neste CEP.', 'cep');
    }

    if (CONFIG_LOJA.freteGratisAcima != null && subtotal >= CONFIG_LOJA.freteGratisAcima) {
        opcoesFrete[0] = { ...opcoesFrete[0], preco: 0, gratis: true };
    }

    const maisRapida = Math.min(...opcoesFrete.map(o => o.prazoDias));
    opcoesFrete = opcoesFrete.map((o, i) => ({
        id: o.id,
        transportadora: o.transportadora,
        servico: o.servico,
        preco: o.preco,
        prazoDias: o.prazoDias,
        gratis: Boolean(o.gratis),
        simulado: Boolean(o.simulado),
        maisBarata: i === 0,
        maisRapida: o.prazoDias === maisRapida && i !== 0,
    }));

    return { cep: cepDestino, uf, regiao: regiaoDaUF(uf), subtotal, opcoes: opcoesFrete, avisos };
}

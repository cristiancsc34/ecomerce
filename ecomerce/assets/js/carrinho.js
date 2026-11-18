// Carrinho de compras: guarda só { id, qtd } no navegador. Preços sempre vêm do catálogo.
import { buscarProduto } from './catalogo.js';
import { CONFIG_LOJA } from './config-loja.js';
import { arredondar } from './validacao.js';
import { armazenamentoSeguro } from './util.js';

const CHAVE = 'azconfort:carrinho:v1';
const CHAVE_CEP = 'azconfort:cep';
const local = armazenamentoSeguro('localStorage');
const ouvintes = new Set();

function ler() {
    const itens = local.ler(CHAVE, []);
    if (!Array.isArray(itens)) return [];
    return itens
        .filter(i => buscarProduto(i?.id) && Number.isInteger(i.qtd) && i.qtd > 0)
        .map(i => ({ id: i.id, qtd: Math.min(i.qtd, CONFIG_LOJA.maxPorItem) }));
}

function salvar(itens) {
    local.gravar(CHAVE, itens);
    ouvintes.forEach(fn => fn());
}

export const carrinho = {
    itens: () => ler(),

    detalhado() {
        return ler().map(({ id, qtd }) => {
            const produto = buscarProduto(id);
            return { ...produto, qtd, totalLinha: arredondar(produto.preco * qtd) };
        });
    },

    totalItens: () => ler().reduce((s, i) => s + i.qtd, 0),

    subtotal() {
        return arredondar(this.detalhado().reduce((s, i) => s + i.totalLinha, 0));
    },

    adicionar(id, qtd = 1) {
        const itens = ler();
        const item = itens.find(i => i.id === id);
        if (item) item.qtd = Math.min(item.qtd + qtd, CONFIG_LOJA.maxPorItem);
        else itens.push({ id, qtd: Math.min(qtd, CONFIG_LOJA.maxPorItem) });
        salvar(itens);
    },

    alterarQtd(id, qtd) {
        const itens = ler();
        const item = itens.find(i => i.id === id);
        if (!item) return;
        if (qtd <= 0) return this.remover(id);
        item.qtd = Math.min(qtd, CONFIG_LOJA.maxPorItem);
        salvar(itens);
    },

    remover(id) {
        salvar(ler().filter(i => i.id !== id));
    },

    limpar() {
        salvar([]);
    },

    // Formato enviado à API: o servidor busca preço e peso no catálogo.
    paraApi: () => ler().map(({ id, qtd }) => ({ id, qtd })),

    cep: {
        ler: () => local.ler(CHAVE_CEP, ''),
        gravar: (cep) => local.gravar(CHAVE_CEP, cep),
    },

    assinar(fn) {
        ouvintes.add(fn);
        return () => ouvintes.delete(fn);
    },
};

// Mantém abas abertas sincronizadas.
window.addEventListener('storage', (e) => {
    if (e.key === CHAVE) ouvintes.forEach(fn => fn());
});

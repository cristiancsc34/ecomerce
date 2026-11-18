// Utilidades de interface (navegador).
import { soDigitos } from './validacao.js';

export const SPRITE = 'assets/icones.svg';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarBRL = (v) => brl.format(v);

export function icone(nome, classe = 'ico') {
    return `<svg class="${classe}" aria-hidden="true"><use href="${SPRITE}#ic-${nome}"/></svg>`;
}

export function escapeHtml(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function prazoTexto(dias) {
    if (dias == null) return '';
    return dias <= 1 ? 'até 1 dia útil' : `até ${dias} dias úteis`;
}

// Máscaras de digitação
export const mascaras = {
    cep: (v) => soDigitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2'),
    cpf: (v) => soDigitos(v).slice(0, 11)
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2'),
    telefone: (v) => {
        const d = soDigitos(v).slice(0, 11);
        if (d.length <= 2) return d.length ? `(${d}` : '';
        if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
        if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    },
    cartao: (v) => soDigitos(v).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '),
    validade: (v) => soDigitos(v).slice(0, 4).replace(/^(\d{2})(\d)/, '$1/$2'),
    cvv: (v) => soDigitos(v).slice(0, 4),
};

export function aplicarMascara(input, tipo) {
    input.addEventListener('input', () => {
        const fim = input.selectionStart === input.value.length;
        input.value = mascaras[tipo](input.value);
        if (fim) input.setSelectionRange(input.value.length, input.value.length);
    });
}

// Chamada à API da loja com tratamento de erro padronizado.
export async function api(caminho, corpo) {
    let resposta;
    try {
        resposta = await fetch(caminho, corpo === undefined ? {} : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(corpo),
        });
    } catch {
        throw new Error('Sem conexão com a loja. Verifique sua internet e tente de novo.');
    }
    let dados = null;
    try { dados = await resposta.json(); } catch { /* resposta sem JSON */ }
    if (!resposta.ok) {
        const erro = new Error(dados?.mensagem || 'Não foi possível concluir agora. Tente novamente em instantes.');
        erro.campo = dados?.campo;
        erro.status = resposta.status;
        throw erro;
    }
    return dados;
}

export function armazenamentoSeguro(tipo = 'localStorage') {
    return {
        ler(chave, padrao = null) {
            try { const v = window[tipo].getItem(chave); return v == null ? padrao : JSON.parse(v); } catch { return padrao; }
        },
        gravar(chave, valor) {
            try { window[tipo].setItem(chave, JSON.stringify(valor)); } catch { /* armazenamento indisponível */ }
        },
        remover(chave) {
            try { window[tipo].removeItem(chave); } catch { /* armazenamento indisponível */ }
        },
    };
}

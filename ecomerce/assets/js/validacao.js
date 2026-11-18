// Validações e cálculos puros (sem DOM). Usados no navegador e no servidor.
import { CONFIG_LOJA } from './config-loja.js';

export const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

export const arredondar = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

export function validarCPF(valor) {
    const cpf = soDigitos(valor);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const digito = (base) => {
        let soma = 0;
        for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
        const resto = (soma * 10) % 11;
        return resto === 10 ? 0 : resto;
    };
    return digito(cpf.slice(0, 9)) === Number(cpf[9]) && digito(cpf.slice(0, 10)) === Number(cpf[10]);
}

export function validarEmail(valor) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor ?? '').trim());
}

export function validarTelefone(valor) {
    const t = soDigitos(valor);
    return t.length === 10 || t.length === 11;
}

export function validarCEP(valor) {
    return soDigitos(valor).length === 8;
}

// Algoritmo de Luhn (número do cartão).
export function validarLuhn(numero) {
    const n = soDigitos(numero);
    if (n.length < 13 || n.length > 19) return false;
    let soma = 0;
    for (let i = 0; i < n.length; i++) {
        let d = Number(n[n.length - 1 - i]);
        if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
        soma += d;
    }
    return soma % 10 === 0;
}

export function detectarBandeira(numero) {
    const n = soDigitos(numero);
    // Elo e Hipercard primeiro: parte das faixas deles começa como Visa/Mastercard.
    if (/^(4011(78|79)|43(1274|8935)|45(1416|7393|763[12])|50(4175|6699|67[0-7]\d|9\d{3})|627780|636297|636368|65(0(0(3[1-3]|[4-9]\d)|4[0-9]\d|5[0-3]\d)|16(5[2-9]|[6-7]\d)|50(0\d|1\d|2[0-1])))/.test(n)) return 'elo';
    if (/^(606282|3841)/.test(n)) return 'hipercard';
    if (/^3[47]/.test(n)) return 'amex';
    if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'mastercard';
    if (/^4/.test(n)) return 'visa';
    return null;
}

// Validade MM/AA (ou MM/AAAA) ainda não vencida.
export function validarValidade(mes, ano, agora = new Date()) {
    const m = Number(mes);
    let a = Number(ano);
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(a)) return false;
    if (a < 100) a += 2000;
    const fimDoMes = new Date(a, m, 1);
    return fimDoMes > agora && a <= agora.getFullYear() + 20;
}

// Opções de parcelamento sem juros para um total.
export function calcularParcelas(total, regras = CONFIG_LOJA.parcelamento) {
    const opcoes = [];
    for (let n = 1; n <= regras.maxParcelas; n++) {
        const valor = arredondar(total / n);
        if (n > 1 && valor < regras.parcelaMinima) break;
        opcoes.push({ parcelas: n, valor });
    }
    return opcoes;
}

export function descontoPix(subtotal, percentual = CONFIG_LOJA.descontoPixPercentual) {
    return arredondar(subtotal * (percentual / 100));
}

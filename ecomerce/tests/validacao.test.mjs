import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validarCPF, validarEmail, validarTelefone, validarLuhn, detectarBandeira, validarValidade, calcularParcelas, arredondar,
} from '../assets/js/validacao.js';

test('CPF: aceita válidos e recusa inválidos', () => {
    assert.equal(validarCPF('529.982.247-25'), true);
    assert.equal(validarCPF('52998224725'), true);
    assert.equal(validarCPF('529.982.247-24'), false);
    assert.equal(validarCPF('111.111.111-11'), false);
    assert.equal(validarCPF('123'), false);
});

test('e-mail e telefone', () => {
    assert.equal(validarEmail('maria@exemplo.com'), true);
    assert.equal(validarEmail('maria@exemplo'), false);
    assert.equal(validarTelefone('(21) 98765-4321'), true);
    assert.equal(validarTelefone('(21) 3456-7890'), true);
    assert.equal(validarTelefone('98765-4321'), false);
});

test('cartão: Luhn, bandeira e validade', () => {
    assert.equal(validarLuhn('4111 1111 1111 1111'), true);
    assert.equal(validarLuhn('4111 1111 1111 1112'), false);
    assert.equal(detectarBandeira('4111111111111111'), 'visa');
    assert.equal(detectarBandeira('5555555555554444'), 'mastercard');
    assert.equal(detectarBandeira('378282246310005'), 'amex');
    assert.equal(detectarBandeira('6362970000457013'), 'elo');
    const hoje = new Date(2026, 10, 18);
    assert.equal(validarValidade('12', '26', hoje), true);
    assert.equal(validarValidade('10', '26', hoje), false);
    assert.equal(validarValidade('13', '30', hoje), false);
});

test('parcelamento respeita máximo e parcela mínima', () => {
    const p = calcularParcelas(100, { maxParcelas: 6, parcelaMinima: 20 });
    assert.deepEqual(p.map(o => o.parcelas), [1, 2, 3, 4, 5]);
    assert.equal(p[2].valor, 33.33);
    assert.deepEqual(calcularParcelas(15, { maxParcelas: 6, parcelaMinima: 20 }).map(o => o.parcelas), [1]);
    assert.equal(arredondar(0.1 + 0.2), 0.3);
});

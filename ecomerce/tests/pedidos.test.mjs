import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarPedido } from '../api/_lib/pedidos.js';
import { obterConfig } from '../api/_lib/config.js';
import { armazenamento } from '../api/_lib/armazenamento.js';

const config = (env = {}) => obterConfig({ LOJA_CEP_ORIGEM: '20040-020', ...env });

const base = () => ({
    cliente: { nome: 'Maria da Silva', email: 'Maria@Exemplo.com', cpf: '529.982.247-25', telefone: '(21) 98765-4321' },
    endereco: { cep: '22041-001', logradouro: 'Avenida Atlântica', numero: '1702', complemento: '', bairro: 'Copacabana', cidade: 'Rio de Janeiro', uf: 'RJ' },
    itens: [{ id: 2, qtd: 1 }, { id: 8, qtd: 2 }],
    frete: { id: 'tabela:economica' },
    pagamento: { metodo: 'pix' },
});

test('Pix: calcula totais no servidor e salva o pedido', async () => {
    const r = await criarPedido(base(), config());
    assert.equal(r.modoTeste, true);
    assert.match(r.pedido.numero, /^AZ\d{11}$/);
    assert.equal(r.pedido.status, 'aguardando_pagamento');
    assert.equal(r.pedido.totais.subtotal, 3599.97);
    assert.equal(r.pedido.totais.total, r.pedido.totais.subtotal + r.pedido.totais.frete);
    assert.match(r.pagamento.pix.copiaECola, /^PIX-TESTE-/);
    const salvo = await armazenamento.buscar(r.pedido.numero);
    assert.equal(salvo.cliente.email, 'maria@exemplo.com');
    assert.equal(salvo.cliente.cpf, '52998224725');
});

test('preço enviado pelo navegador é ignorado', async () => {
    const corpo = base();
    corpo.itens = [{ id: 2, qtd: 1, preco: 1 }];
    const r = await criarPedido(corpo, config());
    assert.equal(r.pedido.itens[0].precoUnitario, 3299.99);
});

test('cartão: aprova, parcela e recusa o cartão de teste final 0002', async () => {
    const corpo = base();
    corpo.pagamento = { metodo: 'cartao', token: 'tok_sim_123456', bandeira: 'visa', ultimos4: '1111', parcelas: 3 };
    const ok = await criarPedido(corpo, config());
    assert.equal(ok.pedido.status, 'pago');
    assert.equal(ok.pagamento.cartao.parcelas, 3);
    assert.equal(ok.pagamento.cartao.valorParcela, Math.round(ok.pedido.totais.total / 3 * 100) / 100);

    corpo.pagamento.ultimos4 = '0002';
    const recusado = await criarPedido(corpo, config());
    assert.equal(recusado.pedido.status, 'pagamento_recusado');
    assert.equal(recusado.pagamento.status, 'recusado');
});

test('cartão: dados abertos são recusados e parcelamento é conferido', async () => {
    const corpo = base();
    corpo.pagamento = { metodo: 'cartao', numero: '4111111111111111', cvv: '123', ultimos4: '1111', parcelas: 1, token: 'tok_sim_1' };
    await assert.rejects(criarPedido(corpo, config()), /tokenizados/);
    corpo.pagamento = { metodo: 'cartao', token: 'tok_sim_123456', ultimos4: '1111', parcelas: 12 };
    await assert.rejects(criarPedido(corpo, config()), { campo: 'parcelas' });
});

test('validações de cliente, endereço e frete', async () => {
    const semSobrenome = base(); semSobrenome.cliente.nome = 'Maria';
    await assert.rejects(criarPedido(semSobrenome, config()), { campo: 'nome' });

    const cpf = base(); cpf.cliente.cpf = '111.111.111-11';
    await assert.rejects(criarPedido(cpf, config()), { campo: 'cpf' });

    const uf = base(); uf.endereco.uf = 'SP';
    await assert.rejects(criarPedido(uf, config()), { campo: 'uf' });

    const frete = base(); frete.frete.id = 'tabela:inexistente';
    await assert.rejects(criarPedido(frete, config()), { campo: 'frete', status: 422 });
});

test('Blue sem credenciais: loja avisa que o pagamento não está configurado', async () => {
    await assert.rejects(criarPedido(base(), config({ PAGAMENTO_PROVEDOR: 'blue' })), { status: 503 });
});

test('Blue com credenciais mas sem integração: erro claro, sem cobrar', async () => {
    const env = { PAGAMENTO_PROVEDOR: 'blue', BLUE_API_URL: 'https://api.exemplo', BLUE_CLIENT_ID: 'id', BLUE_CLIENT_SECRET: 's' };
    await assert.rejects(criarPedido(base(), config(env)), /Blue ainda não está ativo/);
});

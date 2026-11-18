import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cepParaUF, zonaEntrega } from '../api/_lib/logistica/cep.js';
import { dividirEmVolumes, pesoTaxavel } from '../api/_lib/logistica/pacote.js';
import { cotarFrete } from '../api/_lib/logistica/index.js';
import { melhorEnvio } from '../api/_lib/logistica/transportadoras/melhorenvio.js';
import { obterConfig } from '../api/_lib/config.js';

const config = (env = {}) => obterConfig({ LOJA_CEP_ORIGEM: '20040-020', ...env });

test('CEP -> UF e zonas de entrega', () => {
    assert.equal(cepParaUF('01310-100'), 'SP');
    assert.equal(cepParaUF('22041001'), 'RJ');
    assert.equal(cepParaUF('69005010'), 'AM');
    assert.equal(cepParaUF('73010000'), 'DF');
    assert.equal(cepParaUF('1234'), null);
    assert.equal(zonaEntrega('20040020', '24020000'), 'local');
    assert.equal(zonaEntrega('20040020', '01310100'), 'regional');
    assert.equal(zonaEntrega('20040020', '90010000'), 'nacional');
    assert.equal(zonaEntrega('20040020', '69005010'), 'remota');
});

test('volumes: divide quando passa do limite e recusa item grande demais', () => {
    const livro = { peso: 0.4, preco: 30, qtd: 1, dimensoes: { comprimento: 23, largura: 16, altura: 3 } };
    const limites = { pesoKg: 30, ladoCm: 100, somaCm: 200 };
    assert.equal(dividirEmVolumes([livro], limites).length, 1);
    const pesado = { peso: 12, preco: 10, qtd: 3, dimensoes: { comprimento: 30, largura: 30, altura: 10 } };
    assert.equal(dividirEmVolumes([pesado], limites).length, 2, '36 kg viram 2 volumes de até 30 kg');
    const bicicleta = { peso: 16, preco: 900, qtd: 1, dimensoes: { comprimento: 140, largura: 22, altura: 75 } };
    assert.equal(dividirEmVolumes([bicicleta], limites), null);
    assert.equal(pesoTaxavel({ comprimento: 60, largura: 50, altura: 40, pesoKg: 2 }), 20, 'peso cúbico vence');
});

test('cotação: opções ordenadas, prazo com manuseio e tags', async () => {
    const r = await cotarFrete({ cep: '01310-100', itens: [{ id: 6, qtd: 1 }] }, config());
    assert.equal(r.uf, 'SP');
    assert.deepEqual(r.opcoes.map(o => o.id), ['tabela:economica', 'tabela:expressa']);
    assert.equal(r.opcoes[0].maisBarata, true);
    assert.equal(r.opcoes[1].maisRapida, true);
    assert.equal(r.opcoes[0].prazoDias, 5 + 1, 'prazo da tabela + 1 dia de manuseio');
    assert.equal(r.opcoes[0].simulado, true, 'tabela de exemplo marcada como simulada');
});

test('cotação: item grande só sai por transportadora de volumes grandes', async () => {
    const r = await cotarFrete({ cep: '69005-010', itens: [{ id: 5, qtd: 1 }] }, config());
    assert.deepEqual(r.opcoes.map(o => o.id), ['tabela:volumes-grandes']);
});

test('cotação: valida CEP e itens', async () => {
    await assert.rejects(cotarFrete({ cep: '000', itens: [{ id: 1, qtd: 1 }] }, config()), { status: 400 });
    await assert.rejects(cotarFrete({ cep: '01310100', itens: [] }, config()), { status: 400 });
    await assert.rejects(cotarFrete({ cep: '01310100', itens: [{ id: 1, qtd: 99 }] }, config()), { status: 400 });
});

test('cotação: tabela própria via variável de ambiente', async () => {
    const tabela = { nome: 'Parceira X', servicos: [{ id: 'padrao', nome: 'Padrão', limites: { pesoKg: 30, ladoCm: 100, somaCm: 200 }, zonas: { regional: { base: 10, kgAdicional: 0, prazo: 2 } } }] };
    const r = await cotarFrete({ cep: '01310-100', itens: [{ id: 6, qtd: 1 }] }, config({ LOGISTICA_TABELA_JSON: JSON.stringify(tabela) }));
    assert.equal(r.opcoes[0].transportadora, 'Parceira X');
    assert.equal(r.opcoes[0].preco, 10);
    assert.equal(r.opcoes[0].simulado, false);
});

test('Melhor Envio: monta a requisição e converte a resposta', async () => {
    let chamada;
    const fetchImpl = async (url, init) => {
        chamada = { url, init, corpo: JSON.parse(init.body) };
        return new Response(JSON.stringify([
            { id: 1, name: 'PAC', price: '25.50', custom_price: '24.90', delivery_time: 7, custom_delivery_time: 8, company: { name: 'Correios' } },
            { id: 3, name: '.Package', custom_price: '19.00', custom_delivery_time: 6, company: { name: 'Jadlog' } },
            { id: 2, name: 'SEDEX', error: 'Serviço indisponível para o trecho.', company: { name: 'Correios' } },
        ]), { status: 200 });
    };
    const cfg = config({ LOGISTICA_TRANSPORTADORAS: 'melhorenvio', MELHORENVIO_TOKEN: 'tk', LOJA_EMAIL_CONTATO: 'ti@azconfort.com.br' });
    const r = await cotarFrete({ cep: '01310-100', itens: [{ id: 1, qtd: 2 }] }, cfg, { fetchImpl });

    assert.equal(chamada.url, 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate');
    assert.equal(chamada.init.headers.Authorization, 'Bearer tk');
    assert.equal(chamada.init.headers['User-Agent'], 'AzConfort (ti@azconfort.com.br)');
    assert.deepEqual(chamada.corpo.from, { postal_code: '20040020' });
    assert.deepEqual(chamada.corpo.products[0], { id: 'AZ-0001', width: 12, height: 7, length: 20, weight: 0.5, insurance_value: 2499.99, quantity: 2 });

    assert.deepEqual(r.opcoes.map(o => [o.id, o.transportadora, o.preco, o.prazoDias]), [
        ['melhorenvio:3', 'Jadlog', 19, 7],
        ['melhorenvio:1', 'Correios', 24.9, 9],
    ]);
});

test('várias transportadoras: uma fora do ar não derruba a cotação', async () => {
    const fetchImpl = async () => new Response('erro', { status: 500 });
    const cfg = config({ LOGISTICA_TRANSPORTADORAS: 'tabela,melhorenvio', MELHORENVIO_TOKEN: 'tk' });
    const r = await cotarFrete({ cep: '01310-100', itens: [{ id: 6, qtd: 1 }] }, cfg, { fetchImpl });
    assert.ok(r.opcoes.length >= 2);
    assert.deepEqual(r.avisos, ['melhorenvio indisponível no momento']);
    assert.equal(typeof melhorEnvio.cotar, 'function');
});

// Criação de pedidos. Tudo que envolve dinheiro é recalculado aqui no servidor:
// preços vêm do catálogo, frete é cotado de novo e o parcelamento é conferido.
import { randomInt } from 'node:crypto';
import { resolverItens, cotarFrete } from './logistica/index.js';
import { cepParaUF, limparCep } from './logistica/cep.js';
import { cobrar, provedorAtivo } from './pagamento/index.js';
import { armazenamento } from './armazenamento.js';
import { ErroValidacao, ErroNegocio } from './http.js';
import {
    validarCPF, validarEmail, validarTelefone, soDigitos, arredondar, calcularParcelas, descontoPix,
} from '../../assets/js/validacao.js';

const texto = (v, max = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

function validarCliente(c = {}) {
    const nome = texto(c.nome);
    if (nome.split(' ').length < 2 || nome.length < 5) throw new ErroValidacao('Informe nome e sobrenome.', 'nome');
    if (!validarEmail(c.email)) throw new ErroValidacao('E-mail inválido.', 'email');
    if (!validarCPF(c.cpf)) throw new ErroValidacao('CPF inválido.', 'cpf');
    if (!validarTelefone(c.telefone)) throw new ErroValidacao('Celular inválido.', 'telefone');
    return { nome, email: texto(c.email).toLowerCase(), cpf: soDigitos(c.cpf), telefone: soDigitos(c.telefone) };
}

function validarEndereco(e = {}) {
    const cep = limparCep(e.cep);
    const ufDoCep = cepParaUF(cep);
    if (!ufDoCep) throw new ErroValidacao('CEP inválido.', 'cep');
    const uf = texto(e.uf, 2).toUpperCase();
    if (uf !== ufDoCep) throw new ErroValidacao('O CEP não corresponde ao estado informado.', 'uf');
    const end = {
        cep, uf,
        logradouro: texto(e.logradouro),
        numero: texto(e.numero, 10),
        complemento: texto(e.complemento, 60),
        bairro: texto(e.bairro, 80),
        cidade: texto(e.cidade, 80),
    };
    if (end.logradouro.length < 3) throw new ErroValidacao('Informe a rua.', 'logradouro');
    if (!end.numero) throw new ErroValidacao('Informe o número (ou S/N).', 'numero');
    if (end.bairro.length < 2) throw new ErroValidacao('Informe o bairro.', 'bairro');
    if (end.cidade.length < 2) throw new ErroValidacao('Informe a cidade.', 'cidade');
    return end;
}

function validarPagamento(p = {}, total) {
    const metodo = p.metodo;
    if (!['pix', 'cartao', 'boleto'].includes(metodo)) throw new ErroValidacao('Escolha a forma de pagamento.', 'metodo');
    if (metodo !== 'cartao') return { metodo };

    // Dados abertos do cartão nunca podem chegar ao servidor: só o token do provedor.
    if ('numero' in p || 'cvv' in p || 'numeroCartao' in p) {
        throw new ErroValidacao('Os dados do cartão devem ser protegidos (tokenizados) antes do envio.');
    }
    if (typeof p.token !== 'string' || p.token.length < 8 || p.token.length > 200) throw new ErroValidacao('Cartão não validado. Revise os dados.', 'cartao');
    if (!/^\d{4}$/.test(String(p.ultimos4))) throw new ErroValidacao('Cartão inválido.', 'cartao');
    const opcoes = calcularParcelas(total);
    const escolhida = opcoes.find(o => o.parcelas === Number(p.parcelas));
    if (!escolhida) throw new ErroValidacao('Parcelamento indisponível para este valor.', 'parcelas');
    return {
        metodo,
        token: p.token,
        bandeira: texto(p.bandeira, 20) || null,
        ultimos4: String(p.ultimos4),
        parcelas: escolhida.parcelas,
        valorParcela: escolhida.valor,
    };
}

export function gerarNumeroPedido(agora = new Date()) {
    const d = agora.toISOString().slice(2, 10).replace(/-/g, '');
    return `AZ${d}${String(randomInt(0, 100000)).padStart(5, '0')}`;
}

const STATUS_POR_RESULTADO = { aprovado: 'pago', aguardando_pagamento: 'aguardando_pagamento', recusado: 'pagamento_recusado' };

export async function criarPedido(corpo, config, opcoes = {}) {
    const cliente = validarCliente(corpo.cliente);
    const endereco = validarEndereco(corpo.endereco);
    const itens = resolverItens(corpo.itens);

    // Frete cotado de novo: a opção escolhida precisa existir com o preço atual.
    const cotacao = await cotarFrete({ cep: endereco.cep, itens: corpo.itens }, config, opcoes);
    const frete = cotacao.opcoes.find(o => o.id === corpo.frete?.id);
    if (!frete) throw new ErroNegocio('A opção de entrega escolhida não está mais disponível. Escolha novamente.', 'frete');

    const subtotal = arredondar(itens.reduce((s, i) => s + i.preco * i.qtd, 0));
    const desconto = corpo.pagamento?.metodo === 'pix' ? descontoPix(subtotal) : 0;
    const total = arredondar(subtotal - desconto + frete.preco);
    const pagamento = validarPagamento(corpo.pagamento, total);

    const pedido = {
        numero: gerarNumeroPedido(),
        criadoEm: new Date().toISOString(),
        status: 'novo',
        cliente,
        endereco,
        itens: itens.map(i => ({
            id: i.id, sku: i.sku, titulo: i.titulo, qtd: i.qtd,
            precoUnitario: i.preco, total: arredondar(i.preco * i.qtd),
        })),
        frete: { id: frete.id, transportadora: frete.transportadora, servico: frete.servico, preco: frete.preco, prazoDias: frete.prazoDias },
        totais: { subtotal, desconto, frete: frete.preco, total },
        pagamento: { metodo: pagamento.metodo, parcelas: pagamento.parcelas || 1 },
    };

    const resultado = await cobrar({ pedido, pagamento, config });
    pedido.status = STATUS_POR_RESULTADO[resultado.status] || 'aguardando_pagamento';
    pedido.pagamento.transacaoId = resultado.transacaoId;
    pedido.historico = [{ status: pedido.status, em: pedido.criadoEm }];
    await armazenamento.salvar(pedido);

    return {
        modoTeste: Boolean(provedorAtivo(config).teste),
        pedido: {
            numero: pedido.numero,
            status: pedido.status,
            itens: pedido.itens,
            frete: pedido.frete,
            totais: pedido.totais,
            entrega: { cidade: endereco.cidade, uf: endereco.uf },
            email: cliente.email,
        },
        pagamento: {
            metodo: pagamento.metodo,
            status: resultado.status,
            mensagem: resultado.mensagem || null,
            pix: resultado.pix || null,
            boleto: resultado.boleto || null,
            cartao: resultado.cartao || null,
        },
    };
}


// Checkout transparente em 3 etapas: dados, entrega e pagamento.
import { carrinho } from './carrinho.js';
import { CONFIG_LOJA } from './config-loja.js';
import {
    validarCPF, validarEmail, validarTelefone, validarCEP, soDigitos, calcularParcelas, descontoPix, arredondar, detectarBandeira,
} from './validacao.js';
import { formatarBRL, icone, escapeHtml, prazoTexto, mascaras, aplicarMascara, api, armazenamentoSeguro } from './util.js';
import { tokenizarCartao } from './pagamento-cliente.js';

const $ = (s) => document.querySelector(s);
const sessao = armazenamentoSeguro('sessionStorage');
const CHAVE_FRETE = 'azconfort:frete';
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const CAMPOS_ETAPA = {
    1: ['nome', 'email', 'cpf', 'telefone'],
    2: ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'frete'],
};
const BANDEIRAS = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', elo: 'Elo', hipercard: 'Hipercard' };

const estado = {
    etapa: 1,
    concluidas: new Set(),
    cliente: null,
    endereco: null,
    cotacao: null,
    cotando: false,
    freteId: null,
    metodo: 'pix',
    provedor: 'simulacao',
    enviando: false,
    ultimoCepBuscado: null,
    finalizado: false,
};

// ---------- Erros de campo ----------
function erroCampo(id, mensagem) {
    const input = document.getElementById(id);
    const p = document.getElementById(`${id}-erro`);
    if (input) {
        input.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
        if (mensagem) input.setAttribute('aria-describedby', `${id}-erro`);
    }
    if (p) p.textContent = mensagem || '';
}

function limparErros(form) {
    form.querySelectorAll('[aria-invalid]').forEach(i => i.setAttribute('aria-invalid', 'false'));
    form.querySelectorAll('.campo-erro').forEach(p => { p.textContent = ''; });
}

const focarPrimeiroErro = (form) => form.querySelector('[aria-invalid="true"]')?.focus();
const valor = (id) => document.getElementById(id).value.trim();

// ---------- Etapas ----------
function irParaEtapa(n, { focar = true } = {}) {
    estado.etapa = n;
    for (const i of [1, 2, 3]) {
        const secao = $(`#etapa${i}`);
        const ativa = i === n;
        const concluida = estado.concluidas.has(i) && !ativa;
        secao.classList.toggle('ativa', ativa);
        secao.classList.toggle('concluida', concluida);
        secao.classList.toggle('bloqueada', !ativa && !concluida);
        secao.querySelector('.etapa-form').hidden = !ativa;
        const resumo = $(`#resumo${i}`);
        if (resumo) resumo.hidden = !concluida;
        const editar = secao.querySelector('.etapa-editar');
        if (editar) editar.hidden = !concluida;
    }
    if (focar) {
        const secao = $(`#etapa${n}`);
        const topo = secao.getBoundingClientRect().top;
        if (topo < 0 || topo > window.innerHeight * 0.6) secao.scrollIntoView({ behavior: 'smooth', block: 'start' });
        secao.querySelector('.etapa-form input:not([type=radio]), .etapa-form select')?.focus({ preventScroll: true });
    }
}

// ---------- Resumo / totais ----------
function freteAtual() {
    return estado.cotacao?.opcoes.find(o => o.id === estado.freteId) || null;
}

function calcularTotais() {
    const subtotal = carrinho.subtotal();
    const frete = freteAtual();
    const desconto = estado.metodo === 'pix' ? descontoPix(subtotal) : 0;
    const total = arredondar(subtotal - desconto + (frete ? frete.preco : 0));
    return { subtotal, frete, desconto, total };
}

function renderizarResumo() {
    const itens = carrinho.detalhado();
    $('#resumoItens').innerHTML = itens.map(i => `
        <li class="resumo-item">
            <span class="resumo-thumb">${icone(i.icone)}<span class="resumo-qtd" aria-label="${i.qtd} unidade(s)">${i.qtd}</span></span>
            <span class="resumo-titulo">${escapeHtml(i.titulo)}</span>
            <span class="resumo-preco">${formatarBRL(i.totalLinha)}</span>
        </li>`).join('');

    const t = calcularTotais();
    $('#resumoTotais').innerHTML = `
        <div><dt>Subtotal</dt><dd>${formatarBRL(t.subtotal)}</dd></div>
        <div><dt>Frete</dt><dd>${t.frete ? (t.frete.gratis ? 'Grátis' : formatarBRL(t.frete.preco)) : '<span class="muted">Informe o CEP</span>'}</dd></div>
        ${t.desconto > 0 ? `<div class="resumo-desconto"><dt>Desconto Pix</dt><dd>− ${formatarBRL(t.desconto)}</dd></div>` : ''}
        <div class="cart-total"><dt>Total</dt><dd>${formatarBRL(t.total)}</dd></div>`;

    $('#valorPix').textContent = `Total no Pix: ${formatarBRL(t.total)}`;

    const select = $('#parcelas');
    const anterior = Number(select.value) || 1;
    const opcoes = calcularParcelas(t.total);
    select.innerHTML = opcoes.map(o => `<option value="${o.parcelas}">${o.parcelas}x de ${formatarBRL(o.valor)} sem juros</option>`).join('');
    select.value = String(opcoes.some(o => o.parcelas === anterior) ? anterior : 1);

    $('#btnFinalizar span').textContent = `Finalizar pedido · ${formatarBRL(t.total)}`;
}

// ---------- Etapa 1: dados ----------
$('#formDados').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    limparErros(form);
    const c = { nome: valor('nome').replace(/\s+/g, ' '), email: valor('email'), cpf: valor('cpf'), telefone: valor('telefone') };
    let ok = true;
    if (c.nome.split(' ').length < 2 || c.nome.length < 5) { erroCampo('nome', 'Informe nome e sobrenome.'); ok = false; }
    if (!validarEmail(c.email)) { erroCampo('email', 'Digite um e-mail válido.'); ok = false; }
    if (!validarCPF(c.cpf)) { erroCampo('cpf', 'CPF inválido. Confira os números.'); ok = false; }
    if (!validarTelefone(c.telefone)) { erroCampo('telefone', 'Digite o celular com DDD.'); ok = false; }
    if (!ok) return focarPrimeiroErro(form);

    estado.cliente = c;
    estado.concluidas.add(1);
    $('#resumo1').innerHTML = `<p><strong>${escapeHtml(c.nome)}</strong></p><p>${escapeHtml(c.email)} · ${escapeHtml(mascaras.telefone(c.telefone))}</p>`;
    irParaEtapa(estado.concluidas.has(2) ? 3 : 2);
    if (!valor('cep') && carrinho.cep.ler()) {
        $('#cep').value = mascaras.cep(carrinho.cep.ler());
        aoMudarCep();
    }
});

// ---------- Etapa 2: entrega ----------
async function buscarEndereco(cep) {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), 6000);
    try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controlador.signal });
        const dados = await r.json();
        if (dados.erro) {
            erroCampo('cep', 'CEP não encontrado. Confira o número ou preencha o endereço.');
            return;
        }
        $('#logradouro').value = dados.logradouro || $('#logradouro').value;
        $('#bairro').value = dados.bairro || $('#bairro').value;
        $('#cidade').value = dados.localidade || $('#cidade').value;
        if (dados.uf) $('#uf').value = dados.uf;
        ['logradouro', 'bairro', 'cidade', 'uf'].forEach(id => erroCampo(id, ''));
        (dados.logradouro ? $('#numero') : $('#logradouro')).focus();
    } catch {
        // Sem a consulta automática o cliente preenche o endereço manualmente.
    } finally {
        clearTimeout(timer);
    }
}

function renderizarOpcoesFrete() {
    const caixa = $('#freteCheckout');
    const lista = $('#freteCheckoutOpcoes');
    caixa.hidden = false;
    if (estado.cotando) {
        lista.innerHTML = '<p class="frete-info">Calculando opções de entrega…</p>';
        return;
    }
    if (!estado.cotacao) { lista.innerHTML = ''; return; }
    lista.innerHTML = `<div class="frete-opcoes" role="radiogroup" aria-label="Opções de entrega">${estado.cotacao.opcoes.map(o => `
        <label class="frete-opcao">
            <input type="radio" name="frete" value="${escapeHtml(o.id)}" ${o.id === estado.freteId ? 'checked' : ''}>
            <span class="frete-opcao-texto">
                <strong>${escapeHtml(o.servico)}</strong>
                <small>${escapeHtml(o.transportadora)} · ${prazoTexto(o.prazoDias)}</small>
            </span>
            <span class="frete-opcao-preco">${o.gratis ? 'Grátis' : formatarBRL(o.preco)}</span>
            ${o.maisBarata ? '<span class="tag">Mais barata</span>' : o.maisRapida ? '<span class="tag tag-alt">Mais rápida</span>' : ''}
        </label>`).join('')}</div>`;
}

async function cotarFrete(cep) {
    estado.cotando = true;
    estado.cotacao = null;
    erroCampo('frete', '');
    renderizarOpcoesFrete();
    try {
        const cotacao = await api('/api/frete', { cep, itens: carrinho.paraApi() });
        estado.cotacao = cotacao;
        const salvo = sessao.ler(CHAVE_FRETE);
        const preferido = salvo?.cep === cep && cotacao.opcoes.some(o => o.id === salvo.id) ? salvo.id : null;
        const manter = cotacao.opcoes.some(o => o.id === estado.freteId) ? estado.freteId : null;
        estado.freteId = manter || preferido || cotacao.opcoes[0].id;
        sessao.gravar(CHAVE_FRETE, { cep, id: estado.freteId });
        carrinho.cep.gravar(cep);
    } catch (erro) {
        estado.freteId = null;
        if (erro.campo === 'cep' && erro.status === 400) erroCampo('cep', erro.message);
        else erroCampo('frete', erro.message);
    } finally {
        estado.cotando = false;
        renderizarOpcoesFrete();
        renderizarResumo();
    }
}

function aoMudarCep() {
    const cep = soDigitos($('#cep').value);
    if (cep.length !== 8 || cep === estado.ultimoCepBuscado) return;
    estado.ultimoCepBuscado = cep;
    erroCampo('cep', '');
    buscarEndereco(cep);
    cotarFrete(cep);
}

$('#cep').addEventListener('input', aoMudarCep);

$('#freteCheckoutOpcoes').addEventListener('change', (e) => {
    if (e.target.name !== 'frete') return;
    estado.freteId = e.target.value;
    sessao.gravar(CHAVE_FRETE, { cep: estado.cotacao.cep, id: estado.freteId });
    erroCampo('frete', '');
    renderizarResumo();
});

$('#formEntrega').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    limparErros(form);
    const end = {
        cep: soDigitos(valor('cep')), logradouro: valor('logradouro'), numero: valor('numero'),
        complemento: valor('complemento'), bairro: valor('bairro'), cidade: valor('cidade'), uf: valor('uf'),
    };
    let ok = true;
    if (!validarCEP(end.cep)) { erroCampo('cep', 'Digite um CEP válido.'); ok = false; }
    if (end.logradouro.length < 3) { erroCampo('logradouro', 'Informe a rua.'); ok = false; }
    if (!end.numero) { erroCampo('numero', 'Informe o número (ou S/N).'); ok = false; }
    if (end.bairro.length < 2) { erroCampo('bairro', 'Informe o bairro.'); ok = false; }
    if (end.cidade.length < 2) { erroCampo('cidade', 'Informe a cidade.'); ok = false; }
    if (!end.uf) { erroCampo('uf', 'Selecione o estado.'); ok = false; }
    if (ok && estado.cotacao && estado.cotacao.cep === end.cep && estado.cotacao.uf !== end.uf) {
        erroCampo('uf', `Este CEP é de ${estado.cotacao.uf}.`); ok = false;
    }
    if (!ok) return focarPrimeiroErro(form);

    if (!estado.cotacao || estado.cotacao.cep !== end.cep) await cotarFrete(end.cep);
    if (!freteAtual()) {
        if (!$('#frete-erro').textContent) erroCampo('frete', 'Escolha uma opção de entrega.');
        return;
    }

    estado.endereco = end;
    estado.concluidas.add(2);
    const f = freteAtual();
    $('#resumo2').innerHTML = `
        <p>${escapeHtml(end.logradouro)}, ${escapeHtml(end.numero)}${end.complemento ? ` · ${escapeHtml(end.complemento)}` : ''}</p>
        <p>${escapeHtml(end.bairro)} · ${escapeHtml(end.cidade)}/${escapeHtml(end.uf)} · CEP ${mascaras.cep(end.cep)}</p>
        <p class="resumo-frete">${icone('truck')} ${escapeHtml(f.servico)} · ${prazoTexto(f.prazoDias)} · ${f.gratis ? 'Grátis' : formatarBRL(f.preco)}</p>`;
    irParaEtapa(3);
});

// ---------- Etapa 3: pagamento ----------
$('#formPagamento').addEventListener('change', (e) => {
    if (e.target.name !== 'metodo') return;
    estado.metodo = e.target.value;
    document.querySelectorAll('.metodo-painel').forEach(p => { p.hidden = p.dataset.painel !== estado.metodo; });
    $('#pagamentoErro').hidden = true;
    renderizarResumo();
});

$('#cartaoNumero').addEventListener('input', () => {
    const b = detectarBandeira($('#cartaoNumero').value);
    $('#bandeira').textContent = b ? BANDEIRAS[b] : '';
});

function setEnviando(sim) {
    estado.enviando = sim;
    const botao = $('#btnFinalizar');
    botao.disabled = sim;
    botao.classList.toggle('carregando', sim);
    if (sim) botao.querySelector('span').textContent = 'Processando pagamento…';
    else renderizarResumo();
}

function mostrarErroPagamento(mensagem) {
    const caixa = $('#pagamentoErro');
    caixa.innerHTML = `${icone('warning-circle')}<span></span>`;
    caixa.querySelector('span').textContent = mensagem;
    caixa.hidden = false;
    caixa.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function voltarParaCampo(campo, mensagem) {
    const etapa = Object.keys(CAMPOS_ETAPA).find(k => CAMPOS_ETAPA[k].includes(campo));
    if (!etapa) return false;
    irParaEtapa(Number(etapa));
    if (campo === 'frete') {
        estado.ultimoCepBuscado = null;
        aoMudarCep();
    }
    erroCampo(campo, mensagem);
    document.getElementById(campo)?.focus();
    return true;
}

$('#formPagamento').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (estado.enviando) return;
    const form = e.currentTarget;
    limparErros(form);
    $('#pagamentoErro').hidden = true;

    if (!estado.cliente) return irParaEtapa(1);
    if (!estado.endereco || !freteAtual()) return irParaEtapa(2);

    let pagamento = { metodo: estado.metodo };
    if (estado.metodo === 'cartao') {
        try {
            const t = await tokenizarCartao({
                numero: valor('cartaoNumero'), nome: valor('cartaoNome'), validade: valor('cartaoValidade'), cvv: valor('cartaoCvv'),
            }, estado.provedor);
            pagamento = { metodo: 'cartao', token: t.token, bandeira: t.bandeira, ultimos4: t.ultimos4, parcelas: Number($('#parcelas').value) };
        } catch (erro) {
            if (erro.campo) { erroCampo(erro.campo, erro.message); return focarPrimeiroErro(form); }
            return mostrarErroPagamento(erro.message);
        }
    }

    setEnviando(true);
    try {
        const resposta = await api('/api/pedidos', {
            cliente: estado.cliente,
            endereco: estado.endereco,
            itens: carrinho.paraApi(),
            frete: { id: estado.freteId },
            pagamento,
        });
        $('#cartaoCvv').value = '';
        if (resposta.pagamento.status === 'recusado') {
            mostrarErroPagamento(resposta.pagamento.mensagem || 'Pagamento recusado. Tente outro cartão ou pague com Pix.');
            return;
        }
        mostrarConfirmacao(resposta);
    } catch (erro) {
        if (!(erro.campo && voltarParaCampo(erro.campo, erro.message))) mostrarErroPagamento(erro.message);
    } finally {
        setEnviando(false);
    }
});

// ---------- Confirmação ----------
function blocoCodigo(rotulo, codigo) {
    return `
        <div class="codigo">
            <code>${escapeHtml(codigo)}</code>
            <button type="button" class="btn btn-dark" data-copiar="${escapeHtml(codigo)}">${icone('copy')} ${rotulo}</button>
        </div>`;
}

function mostrarConfirmacao({ pedido, pagamento, modoTeste }) {
    const pago = pagamento.status === 'aprovado';
    let blocoPagamento = '';
    if (pagamento.pix) {
        const expira = new Date(pagamento.pix.expiraEm);
        blocoPagamento = `
            <h2>${icone('pix-logo')} Pague com Pix</h2>
            <p>Abra o app do seu banco, escolha <strong>Pix copia e cola</strong> e cole o código abaixo.</p>
            ${pagamento.pix.qrCodeBase64 ? `<img class="qr" src="data:image/png;base64,${escapeHtml(pagamento.pix.qrCodeBase64)}" alt="QR Code Pix" width="220" height="220">` : ''}
            ${blocoCodigo('Copiar código', pagamento.pix.copiaECola)}
            <p class="muted">Código válido até ${expira.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} de ${expira.toLocaleDateString('pt-BR')}.</p>`;
    } else if (pagamento.boleto) {
        const [a, m, d] = pagamento.boleto.vencimento.split('-');
        blocoPagamento = `
            <h2>${icone('barcode')} Pague o boleto</h2>
            <p>Use a linha digitável abaixo no app ou internet banking. Vencimento: <strong>${d}/${m}/${a}</strong>.</p>
            ${blocoCodigo('Copiar linha digitável', pagamento.boleto.linhaDigitavel)}
            ${pagamento.boleto.urlPdf ? `<a class="btn btn-secondary" href="${escapeHtml(pagamento.boleto.urlPdf)}" target="_blank" rel="noopener">Abrir boleto (PDF)</a>` : ''}`;
    } else if (pagamento.cartao) {
        const c = pagamento.cartao;
        blocoPagamento = `<p class="confirmacao-cartao">${icone('credit-card')} ${c.parcelas}x de ${formatarBRL(c.valorParcela)} no cartão ${escapeHtml(BANDEIRAS[c.bandeira] || '')} final ${escapeHtml(c.ultimos4)}</p>`;
    }

    const f = pedido.frete;
    $('#confirmacao').innerHTML = `
        <div class="confirmacao-card">
            ${modoTeste ? '<p class="confirmacao-teste">Pedido de teste: nenhum valor foi cobrado.</p>' : ''}
            <div class="confirmacao-icone">${icone('check-circle')}</div>
            <h1>${pago ? 'Pagamento aprovado!' : 'Pedido recebido!'}</h1>
            <p class="confirmacao-sub">Número do pedido: <strong>${escapeHtml(pedido.numero)}</strong>. Guarde este número para acompanhar sua compra.</p>
            ${blocoPagamento ? `<div class="confirmacao-pagamento">${blocoPagamento}</div>` : ''}
            <div class="confirmacao-entrega">
                ${icone('truck')}
                <p><strong>${escapeHtml(f.servico)}</strong> para ${escapeHtml(pedido.entrega.cidade)}/${escapeHtml(pedido.entrega.uf)}<br>
                <span class="muted">Entrega em ${prazoTexto(f.prazoDias)} após a confirmação do pagamento.</span></p>
            </div>
            <dl class="cart-totais">
                <div><dt>Subtotal</dt><dd>${formatarBRL(pedido.totais.subtotal)}</dd></div>
                <div><dt>Frete</dt><dd>${pedido.totais.frete === 0 ? 'Grátis' : formatarBRL(pedido.totais.frete)}</dd></div>
                ${pedido.totais.desconto > 0 ? `<div><dt>Desconto Pix</dt><dd>− ${formatarBRL(pedido.totais.desconto)}</dd></div>` : ''}
                <div class="cart-total"><dt>Total</dt><dd>${formatarBRL(pedido.totais.total)}</dd></div>
            </dl>
            <a href="index.html" class="btn btn-primary">Voltar à loja</a>
        </div>`;

    estado.finalizado = true;
    $('#checkoutConteudo').hidden = true;
    const secao = $('#confirmacao');
    secao.hidden = false;
    carrinho.limpar();
    sessao.remover(CHAVE_FRETE);
    window.scrollTo({ top: 0 });
    secao.focus();
}

document.addEventListener('click', async (e) => {
    const copiar = e.target.closest('[data-copiar]');
    if (copiar) {
        const texto = copiar.dataset.copiar;
        try { await navigator.clipboard.writeText(texto); } catch {
            const area = document.createElement('textarea');
            area.value = texto; document.body.appendChild(area); area.select();
            document.execCommand('copy'); area.remove();
        }
        const original = copiar.innerHTML;
        copiar.innerHTML = `${icone('check-circle')} Copiado!`;
        setTimeout(() => { copiar.innerHTML = original; }, 2000);
        return;
    }
    const editar = e.target.closest('[data-editar]');
    if (editar) irParaEtapa(Number(editar.dataset.editar));
});

// ---------- Início ----------
async function iniciar() {
    if (carrinho.totalItens() === 0) {
        $('#checkoutVazio').hidden = false;
        return;
    }
    $('#checkoutConteudo').hidden = false;
    $('#uf').innerHTML = '<option value="">Selecione</option>' + UFS.map(uf => `<option>${uf}</option>`).join('');
    $('#diasBoleto').textContent = CONFIG_LOJA.boletoDiasVencimento;
    aplicarMascara($('#cpf'), 'cpf');
    aplicarMascara($('#telefone'), 'telefone');
    aplicarMascara($('#cep'), 'cep');
    aplicarMascara($('#cartaoNumero'), 'cartao');
    aplicarMascara($('#cartaoValidade'), 'validade');
    aplicarMascara($('#cartaoCvv'), 'cvv');
    renderizarResumo();
    irParaEtapa(1, { focar: false });

    carrinho.assinar(() => {
        if (estado.finalizado) return;
        if (carrinho.totalItens() === 0) return location.reload();
        renderizarResumo();
        if (estado.cotacao) cotarFrete(estado.cotacao.cep);
    });

    try {
        const status = await api('/api/status');
        estado.provedor = status.pagamento.provedor;
        if (status.modoTeste) {
            const partes = [];
            if (status.pagamento.teste) partes.push('nenhum pagamento real é cobrado (cartão de teste: 4111 1111 1111 1111, qualquer validade futura e CVV)');
            if (status.logistica.freteDeExemplo) partes.push('os valores de frete são de exemplo');
            if (status.logistica.melhorEnvioSandbox) partes.push('o frete do Melhor Envio está em modo sandbox');
            $('#bannerTesteTexto').textContent = `Ambiente de testes: ${partes.join('; ')}.`;
            $('#bannerTeste').hidden = false;
        }
    } catch {
        // Sem status: segue com o padrão.
    }
}

iniciar();

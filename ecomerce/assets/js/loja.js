// Vitrine: produtos, filtros, busca e carrinho lateral (com cálculo de frete).
import { PRODUTOS } from './catalogo.js';
import { carrinho } from './carrinho.js';
import { CONFIG_LOJA } from './config-loja.js';
import { validarCEP, soDigitos } from './validacao.js';
import { formatarBRL, icone, escapeHtml, prazoTexto, mascaras, aplicarMascara, api, armazenamentoSeguro } from './util.js';

const sessao = armazenamentoSeguro('sessionStorage');
const CHAVE_FRETE = 'azconfort:frete';
const $ = (sel) => document.querySelector(sel);

// ---------- Vitrine ----------
function estrelas(nota) {
    const cheias = Math.round(nota);
    return '★'.repeat(cheias) + '☆'.repeat(5 - cheias);
}

function renderizarProdutos(lista = PRODUTOS) {
    const grade = $('#productsGrid');
    if (lista.length === 0) {
        grade.innerHTML = '';
        const vazio = document.createElement('div');
        vazio.className = 'empty-state';
        vazio.innerHTML = '<h3></h3><p>Tente buscar por outros termos ou navegue pelas categorias.</p>';
        vazio.querySelector('h3').textContent = `Nenhum produto encontrado para "${$('#searchInput').value.trim()}"`;
        grade.appendChild(vazio);
        return;
    }
    grade.innerHTML = lista.map(p => `
        <article class="product-card">
            <div class="product-image">
                ${icone(p.icone)}
                <span class="product-badge">${escapeHtml(p.selo)}</span>
            </div>
            <div class="product-info">
                <h3 class="product-title">${escapeHtml(p.titulo)}</h3>
                <div class="product-rating">
                    <span class="stars" aria-hidden="true">${estrelas(p.nota)}</span>
                    <span class="rating-text">${p.nota.toLocaleString('pt-BR')} (${p.avaliacoes.toLocaleString('pt-BR')} avaliações)</span>
                </div>
                <div class="product-price">
                    <span class="price-now">${formatarBRL(p.preco)}</span>
                    <span class="product-old-price"><span class="sr-only">De </span>${formatarBRL(p.precoAntigo)}</span>
                </div>
                <button class="add-to-cart" type="button" data-adicionar="${p.id}">Adicionar ao carrinho</button>
            </div>
        </article>`).join('');
}

function filtrarCategoria(categoria) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.category === categoria));
    const grade = $('#productsGrid');
    grade.classList.add('loading');
    setTimeout(() => {
        renderizarProdutos(categoria === 'all' ? PRODUTOS : PRODUTOS.filter(p => p.categoria === categoria));
        grade.classList.remove('loading');
    }, 250);
}

function buscar() {
    const termo = $('#searchInput').value.trim().toLowerCase();
    if (!termo) return filtrarCategoria('all');
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    renderizarProdutos(PRODUTOS.filter(p => p.titulo.toLowerCase().includes(termo)));
    $('#products').scrollIntoView();
}

// ---------- Aviso (toast) ----------
let timerAviso;
function avisar(texto) {
    const el = $('#aviso');
    el.innerHTML = `${icone('check-circle')}<span></span><button type="button" class="toast-acao" data-acao="abrir-carrinho">Ver carrinho</button>`;
    el.querySelector('span').textContent = texto;
    el.classList.add('show');
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => el.classList.remove('show'), 3500);
}

// ---------- Carrinho lateral ----------
let ultimoFoco = null;
let freteEstado = { status: 'ocioso', cep: carrinho.cep.ler(), dados: null, erro: null };

function abrirCarrinho() {
    ultimoFoco = document.activeElement;
    $('#carrinhoFundo').hidden = false;
    const gaveta = $('#carrinho');
    gaveta.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => { gaveta.classList.add('open'); $('#carrinhoFundo').classList.add('show'); });
    document.body.classList.add('no-scroll');
    document.querySelectorAll('[data-acao="abrir-carrinho"][aria-controls]').forEach(b => b.setAttribute('aria-expanded', 'true'));
    gaveta.focus();
    if (freteEstado.cep && freteEstado.status === 'ocioso' && carrinho.totalItens() > 0) calcularFrete(freteEstado.cep);
}

function fecharCarrinho() {
    const gaveta = $('#carrinho');
    gaveta.classList.remove('open');
    $('#carrinhoFundo').classList.remove('show');
    gaveta.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    document.querySelectorAll('[data-acao="abrir-carrinho"][aria-controls]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    setTimeout(() => { $('#carrinhoFundo').hidden = true; }, 250);
    if (ultimoFoco) ultimoFoco.focus();
}

function freteSelecionado() {
    const salvo = sessao.ler(CHAVE_FRETE);
    if (!salvo || !freteEstado.dados || salvo.cep !== freteEstado.dados.cep) return null;
    return freteEstado.dados.opcoes.find(o => o.id === salvo.id) || null;
}

function htmlFrete() {
    const cep = freteEstado.cep ? mascaras.cep(freteEstado.cep) : '';
    let resultado = '';
    if (freteEstado.status === 'carregando') {
        resultado = '<p class="frete-info">Calculando opções de entrega…</p>';
    } else if (freteEstado.status === 'erro') {
        resultado = `<p class="frete-erro" role="alert">${icone('warning-circle')}<span>${escapeHtml(freteEstado.erro)}</span></p>`;
    } else if (freteEstado.status === 'ok') {
        const escolhido = freteSelecionado()?.id;
        resultado = `
            <p class="frete-destino">${icone('map-pin')} Entrega para ${escapeHtml(freteEstado.dados.uf)} · CEP ${mascaras.cep(freteEstado.dados.cep)}</p>
            <div class="frete-opcoes" role="radiogroup" aria-label="Opções de entrega">
            ${freteEstado.dados.opcoes.map(o => `
                <label class="frete-opcao">
                    <input type="radio" name="freteOpcao" value="${escapeHtml(o.id)}" ${o.id === escolhido ? 'checked' : ''}>
                    <span class="frete-opcao-texto">
                        <strong>${escapeHtml(o.servico)}</strong>
                        <small>${escapeHtml(o.transportadora)} · ${prazoTexto(o.prazoDias)}</small>
                    </span>
                    <span class="frete-opcao-preco">${o.gratis ? 'Grátis' : formatarBRL(o.preco)}</span>
                    ${o.maisBarata ? '<span class="tag">Mais barata</span>' : o.maisRapida ? '<span class="tag tag-alt">Mais rápida</span>' : ''}
                </label>`).join('')}
            </div>`;
    }
    return `
        <section class="frete-box" aria-labelledby="freteTitulo">
            <h3 id="freteTitulo">${icone('truck')} Calcular frete e prazo</h3>
            <form class="frete-form" data-form="frete" novalidate>
                <label class="sr-only" for="freteCep">CEP</label>
                <input id="freteCep" class="input" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" value="${cep}" maxlength="9">
                <button type="submit" class="btn btn-secondary">Calcular</button>
            </form>
            <a class="link-pequeno" href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener">Não sei meu CEP</a>
            ${resultado}
        </section>`;
}

function renderizarCarrinho() {
    const itens = carrinho.detalhado();
    const qtd = carrinho.totalItens();
    const badge = $('#cartBadge');
    if (badge.textContent !== String(qtd)) {
        badge.textContent = qtd;
        badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
    }
    $('#carrinhoQtd').textContent = qtd ? `(${qtd} ${qtd === 1 ? 'item' : 'itens'})` : '';

    const corpo = $('#carrinhoCorpo');
    const rodape = $('#carrinhoRodape');
    if (itens.length === 0) {
        corpo.innerHTML = `
            <div class="cart-empty">
                <div class="cart-empty-icon">${icone('shopping-cart-simple')}</div>
                <h3>Seu carrinho está vazio</h3>
                <p>Explore as categorias e adicione os produtos que você gostar.</p>
                <button type="button" class="btn btn-primary" data-acao="fechar-carrinho">Continuar comprando</button>
            </div>`;
        rodape.innerHTML = '';
        rodape.hidden = true;
        return;
    }

    const foco = document.activeElement?.id;
    corpo.innerHTML = `
        <ul class="cart-list">
        ${itens.map(i => `
            <li class="cart-item">
                <div class="cart-item-thumb">${icone(i.icone)}</div>
                <div class="cart-item-info">
                    <p class="cart-item-title">${escapeHtml(i.titulo)}</p>
                    <p class="cart-item-unit">${formatarBRL(i.preco)} cada</p>
                    <div class="cart-item-actions">
                        <div class="qty" role="group" aria-label="Quantidade de ${escapeHtml(i.titulo)}">
                            <button type="button" class="qty-btn" data-qtd="${i.id}" data-delta="-1" aria-label="Diminuir quantidade">${icone('minus')}</button>
                            <span class="qty-valor" aria-live="polite">${i.qtd}</span>
                            <button type="button" class="qty-btn" data-qtd="${i.id}" data-delta="1" aria-label="Aumentar quantidade" ${i.qtd >= CONFIG_LOJA.maxPorItem ? 'disabled' : ''}>${icone('plus')}</button>
                        </div>
                        <button type="button" class="link-remover" data-remover="${i.id}">${icone('trash')} Remover</button>
                    </div>
                </div>
                <p class="cart-item-total">${formatarBRL(i.totalLinha)}</p>
            </li>`).join('')}
        </ul>
        ${htmlFrete()}`;

    aplicarMascara($('#freteCep'), 'cep');
    if (foco === 'freteCep') $('#freteCep').focus();

    const subtotal = carrinho.subtotal();
    const frete = freteSelecionado();
    const total = subtotal + (frete ? frete.preco : 0);
    rodape.hidden = false;
    rodape.innerHTML = `
        <dl class="cart-totais">
            <div><dt>Subtotal</dt><dd>${formatarBRL(subtotal)}</dd></div>
            <div><dt>Frete</dt><dd>${frete ? (frete.gratis ? 'Grátis' : formatarBRL(frete.preco)) : '<span class="muted">Calcule acima</span>'}</dd></div>
            <div class="cart-total"><dt>Total</dt><dd>${formatarBRL(total)}</dd></div>
        </dl>
        <a href="checkout.html" class="btn btn-primary btn-block">${icone('lock-simple')} Finalizar compra</a>
        <button type="button" class="btn btn-link btn-block" data-acao="fechar-carrinho">Continuar comprando</button>`;
}

async function calcularFrete(cepBruto) {
    const cep = soDigitos(cepBruto);
    if (!validarCEP(cep)) {
        freteEstado = { ...freteEstado, status: 'erro', erro: 'Digite um CEP válido com 8 números.', cep };
        return renderizarCarrinho();
    }
    carrinho.cep.gravar(cep);
    freteEstado = { status: 'carregando', cep, dados: null, erro: null };
    renderizarCarrinho();
    try {
        const dados = await api('/api/frete', { cep, itens: carrinho.paraApi() });
        freteEstado = { status: 'ok', cep, dados, erro: null };
        const salvo = sessao.ler(CHAVE_FRETE);
        if (!salvo || salvo.cep !== cep || !dados.opcoes.some(o => o.id === salvo.id)) {
            sessao.gravar(CHAVE_FRETE, { cep, id: dados.opcoes[0].id });
        }
    } catch (erro) {
        freteEstado = { status: 'erro', cep, dados: null, erro: erro.message };
    }
    renderizarCarrinho();
}

// Recalcula o frete quando os itens mudam (se já havia CEP).
let timerFrete;
carrinho.assinar(() => {
    renderizarCarrinho();
    if (freteEstado.cep && carrinho.totalItens() > 0 && freteEstado.status !== 'ocioso') {
        clearTimeout(timerFrete);
        timerFrete = setTimeout(() => calcularFrete(freteEstado.cep), 400);
    }
});

// ---------- Eventos ----------
document.addEventListener('click', (e) => {
    const alvo = e.target.closest('button, a, [data-acao]');
    if (!alvo) return;

    if (alvo.dataset.adicionar) {
        const id = Number(alvo.dataset.adicionar);
        carrinho.adicionar(id);
        const produto = PRODUTOS.find(p => p.id === id);
        alvo.textContent = 'Adicionado!';
        alvo.classList.add('added');
        setTimeout(() => { alvo.textContent = 'Adicionar ao carrinho'; alvo.classList.remove('added'); }, 1200);
        avisar(`${produto.titulo} foi adicionado ao carrinho.`);
        return;
    }
    if (alvo.dataset.acao === 'abrir-carrinho') { e.preventDefault(); $('#aviso').classList.remove('show'); return abrirCarrinho(); }
    if (alvo.dataset.acao === 'fechar-carrinho') { e.preventDefault(); return fecharCarrinho(); }
    if (alvo.dataset.qtd) {
        const id = Number(alvo.dataset.qtd);
        const atual = carrinho.itens().find(i => i.id === id)?.qtd || 0;
        return carrinho.alterarQtd(id, atual + Number(alvo.dataset.delta));
    }
    if (alvo.dataset.remover) return carrinho.remover(Number(alvo.dataset.remover));
    if (alvo.dataset.categoria) { filtrarCategoria(alvo.dataset.categoria); return $('#products').scrollIntoView(); }
    if (alvo.classList.contains('nav-link')) return filtrarCategoria(alvo.dataset.category);
});

document.addEventListener('submit', (e) => {
    if (e.target.dataset.form === 'frete') {
        e.preventDefault();
        calcularFrete($('#freteCep').value);
    }
});

document.addEventListener('change', (e) => {
    if (e.target.name === 'freteOpcao') {
        sessao.gravar(CHAVE_FRETE, { cep: freteEstado.dados.cep, id: e.target.value });
        renderizarCarrinho();
    }
});

document.addEventListener('keydown', (e) => {
    const gaveta = $('#carrinho');
    if (!gaveta.classList.contains('open')) return;
    if (e.key === 'Escape') return fecharCarrinho();
    if (e.key === 'Tab') { // mantém o foco dentro da gaveta
        const focaveis = [...gaveta.querySelectorAll('button:not([disabled]), a[href], input, [tabindex="0"]')];
        if (!focaveis.length) return;
        const [primeiro, ultimo] = [focaveis[0], focaveis[focaveis.length - 1]];
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    }
});

$('#searchBtn').addEventListener('click', buscar);
$('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });

// ---------- Início ----------
renderizarProdutos();
renderizarCarrinho();
if (location.hash === '#carrinho') abrirCarrinho();

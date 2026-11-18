// Teste de ponta a ponta (navegador real) do carrinho + checkout.
// Uso: npm run dev (em outro terminal) e depois: node tests/e2e-checkout.mjs [url] [pasta-prints]
// Requer Playwright instalado (npx playwright install chromium).
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const URL_BASE = process.argv[2] || 'http://localhost:3000';
const PRINTS = process.argv[3] || null;

const CLIENTE = { nome: 'Maria da Silva', email: 'maria@exemplo.com', cpf: '52998224725', telefone: '21987654321' };
const ENDERECO_VIACEP = { cep: '22041-001', logradouro: 'Avenida Atlântica', bairro: 'Copacabana', localidade: 'Rio de Janeiro', uf: 'RJ' };

async function novaPagina(navegador, opcoes = {}) {
    const contexto = await navegador.newContext(opcoes);
    const pagina = await contexto.newPage();
    const erros = [];
    pagina.on('pageerror', e => erros.push(e.message));
    pagina.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
    // ViaCEP simulado para o teste não depender da internet.
    await pagina.route('https://viacep.com.br/**', r => r.fulfill({ json: ENDERECO_VIACEP }));
    return { pagina, erros };
}

async function comprar(navegador, { metodo, cartao, mobile = false, print }) {
    const { pagina, erros } = await novaPagina(navegador, mobile ? devices['iPhone 13'] : { viewport: { width: 1280, height: 900 } });
    await pagina.goto(URL_BASE, { waitUntil: 'networkidle' });
    await pagina.locator('[data-adicionar="2"]').click();
    await pagina.locator('[data-adicionar="8"]').click();
    await pagina.goto(`${URL_BASE}/checkout.html`, { waitUntil: 'networkidle' });

    assert.equal(await pagina.locator('.resumo-item').count(), 2, 'resumo com 2 itens');
    assert.ok(await pagina.locator('#bannerTeste').isVisible(), 'aviso de modo teste visível');

    // Etapa 1: valida erros e depois preenche
    await pagina.locator('#formDados button[type=submit]').click();
    assert.equal(await pagina.locator('#nome[aria-invalid="true"]').count(), 1, 'erro no nome vazio');
    await pagina.fill('#nome', CLIENTE.nome);
    await pagina.fill('#email', CLIENTE.email);
    await pagina.fill('#cpf', '11111111111');
    await pagina.fill('#telefone', CLIENTE.telefone);
    await pagina.locator('#formDados button[type=submit]').click();
    assert.equal(await pagina.locator('#cpf-erro').textContent(), 'CPF inválido. Confira os números.');
    await pagina.fill('#cpf', CLIENTE.cpf);
    assert.equal(await pagina.inputValue('#cpf'), '529.982.247-25', 'máscara de CPF');
    await pagina.locator('#formDados button[type=submit]').click();

    // Etapa 2: CEP preenche endereço e cota frete
    await pagina.fill('#cep', '22041001');
    await pagina.waitForSelector('#freteCheckoutOpcoes .frete-opcao');
    assert.equal(await pagina.inputValue('#logradouro'), 'Avenida Atlântica', 'endereço preenchido pelo CEP');
    assert.equal(await pagina.inputValue('#uf'), 'RJ');
    await pagina.fill('#numero', '1702');
    await pagina.locator('#freteCheckoutOpcoes .frete-opcao').nth(1).click();
    await pagina.locator('#formEntrega button[type=submit]').click();
    await pagina.waitForSelector('#formPagamento:not([hidden])');

    // Etapa 3: pagamento
    if (metodo !== 'pix') await pagina.locator(`.metodo:has(input[value="${metodo}"])`).click();
    if (metodo === 'cartao') {
        await pagina.fill('#cartaoNumero', cartao);
        assert.equal(await pagina.locator('#bandeira').textContent(), 'Visa');
        await pagina.fill('#cartaoNome', 'MARIA DA SILVA');
        await pagina.fill('#cartaoValidade', '1230');
        await pagina.fill('#cartaoCvv', '123');
        await pagina.selectOption('#parcelas', '3');
    }
    if (print) await pagina.screenshot({ path: `${PRINTS}/${print}-pagamento.png`, fullPage: true });
    const [requisicao] = await Promise.all([
        pagina.waitForRequest(r => r.url().endsWith('/api/pedidos')),
        pagina.locator('#btnFinalizar').click(),
    ]);
    const enviado = requisicao.postDataJSON();
    assert.ok(!JSON.stringify(enviado).includes(String(cartao || '').replace(/\D/g, '') || '§'), 'número do cartão NÃO vai para o servidor');
    assert.ok(!('preco' in enviado.itens[0]), 'preço não vai do navegador');

    return { pagina, erros };
}

const navegador = await chromium.launch();
try {
    // Pix
    let { pagina, erros } = await comprar(navegador, { metodo: 'pix', print: PRINTS && 'pix' });
    await pagina.waitForSelector('#confirmacao:not([hidden])');
    assert.match(await pagina.locator('.confirmacao-card h1').textContent(), /Pedido recebido/);
    assert.match(await pagina.locator('.codigo code').textContent(), /^PIX-TESTE-AZ\d+/);
    assert.equal(await pagina.evaluate(() => JSON.parse(localStorage.getItem('azconfort:carrinho:v1')).length), 0, 'carrinho limpo');
    if (PRINTS) await pagina.screenshot({ path: `${PRINTS}/pix-confirmacao.png`, fullPage: true });
    assert.deepEqual(erros, []);
    console.log('ok  Pix');

    // Cartão aprovado
    ({ pagina, erros } = await comprar(navegador, { metodo: 'cartao', cartao: '4111 1111 1111 1111' }));
    await pagina.waitForSelector('#confirmacao:not([hidden])');
    assert.match(await pagina.locator('.confirmacao-card h1').textContent(), /Pagamento aprovado/);
    assert.match(await pagina.locator('.confirmacao-cartao').textContent(), /3x de .* final 1111/);
    assert.deepEqual(erros, []);
    console.log('ok  Cartão aprovado');

    // Cartão recusado (final 0002) mantém o cliente no pagamento
    ({ pagina, erros } = await comprar(navegador, { metodo: 'cartao', cartao: '4000 0000 0000 0002' }));
    await pagina.waitForSelector('#pagamentoErro:not([hidden])');
    assert.match(await pagina.locator('#pagamentoErro').textContent(), /recusado/);
    assert.ok(await pagina.locator('#confirmacao').isHidden());
    console.log('ok  Cartão recusado');

    // Boleto no celular
    ({ pagina, erros } = await comprar(navegador, { metodo: 'boleto', mobile: true, print: PRINTS && 'boleto-mobile' }));
    await pagina.waitForSelector('#confirmacao:not([hidden])');
    assert.match(await pagina.locator('.confirmacao-pagamento').textContent(), /Vencimento/);
    const sobra = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.equal(sobra, 0, 'sem rolagem horizontal no celular');
    if (PRINTS) await pagina.screenshot({ path: `${PRINTS}/boleto-mobile-confirmacao.png`, fullPage: true });
    assert.deepEqual(erros, []);
    console.log('ok  Boleto (celular)');

    // Checkout com carrinho vazio
    ({ pagina } = await novaPagina(navegador));
    await pagina.goto(`${URL_BASE}/checkout.html`, { waitUntil: 'networkidle' });
    assert.ok(await pagina.locator('#checkoutVazio').isVisible());
    console.log('ok  Carrinho vazio');

    console.log('\nTodos os testes de ponta a ponta passaram.');
} finally {
    await navegador.close();
}

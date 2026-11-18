// Proteção (tokenização) do cartão NO NAVEGADOR.
// O número completo e o CVV nunca são enviados para o servidor da loja: só um token
// gerado pelo provedor de pagamento, mais bandeira e últimos 4 dígitos.
import { soDigitos, validarLuhn, validarValidade, detectarBandeira } from './validacao.js';

export class ErroCartao extends Error {
    constructor(mensagem, campo) { super(mensagem); this.campo = campo; }
}

export function validarCartao({ numero, nome, validade, cvv }) {
    const n = soDigitos(numero);
    if (!validarLuhn(n)) throw new ErroCartao('Número do cartão inválido.', 'cartaoNumero');
    if (String(nome ?? '').trim().length < 3) throw new ErroCartao('Informe o nome como está no cartão.', 'cartaoNome');
    const [mes, ano] = String(validade ?? '').split('/');
    if (!validarValidade(mes, ano)) throw new ErroCartao('Validade inválida ou vencida.', 'cartaoValidade');
    const bandeira = detectarBandeira(n);
    const tamanhoCvv = bandeira === 'amex' ? 4 : 3;
    if (soDigitos(cvv).length !== tamanhoCvv) throw new ErroCartao(`O código de segurança tem ${tamanhoCvv} dígitos.`, 'cartaoCvv');
    return { numero: n, bandeira, mes, ano };
}

export async function tokenizarCartao(dados, provedor) {
    const { numero, bandeira } = validarCartao(dados);
    const ultimos4 = numero.slice(-4);

    if (provedor === 'simulacao') {
        const aleatorio = crypto.getRandomValues(new Uint32Array(2)).join('');
        return { token: `tok_sim_${aleatorio}`, bandeira, ultimos4 };
    }

    if (provedor === 'blue') {
        // TODO(Blue): carregar o SDK JavaScript da Blue e trocar os dados do cartão por um token, ex.:
        //   const token = await BlueSDK.tokenize({ number, holderName, expMonth, expYear, cvv });
        //   return { token, bandeira, ultimos4 };
        throw new ErroCartao('Pagamento com cartão ainda não está disponível. Use Pix ou boleto.');
    }

    throw new ErroCartao('Pagamento com cartão indisponível no momento.');
}

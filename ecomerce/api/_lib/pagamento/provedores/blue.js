// Provedor de pagamento: Blue (checkout transparente).
//
// ENGATILHADO: a estrutura está pronta, falta a documentação técnica da API da Blue para
// ligar as chamadas. Quando o banco enviar, preencher as 3 funções marcadas com TODO.
//
// Variáveis de ambiente (Vercel > Settings > Environment Variables):
//   PAGAMENTO_PROVEDOR=blue
//   BLUE_API_URL, BLUE_CLIENT_ID, BLUE_CLIENT_SECRET, BLUE_WEBHOOK_SEGREDO
//
// O que pedir para a Blue (lista também no README):
//   - documentação da API e acesso ao ambiente de testes (sandbox)
//   - autenticação (OAuth2 client credentials? certificado mTLS para Pix?)
//   - Pix dinâmico com QR Code e "copia e cola", com expiração
//   - cartão de crédito com TOKENIZAÇÃO no navegador (SDK JavaScript) e parcelamento
//   - boleto registrado (linha digitável + PDF)
//   - webhooks de confirmação de pagamento e como validar a assinatura
//   - estorno/cancelamento e consulta de status
import { ErroConfiguracao } from '../../http.js';

const pendente = (oque) => new ErroConfiguracao(
    `Pagamento via Blue ainda não está ativo (${oque} aguardando a documentação da API do banco). ` +
    'Enquanto isso, use PAGAMENTO_PROVEDOR=simulacao.',
);

export const blue = {
    id: 'blue',
    nome: 'Blue',
    teste: false,

    configurado: (config) => {
        const b = config.pagamento.blue;
        return Boolean(b.apiUrl && b.clientId && b.clientSecret);
    },

    async cobrar({ pedido, pagamento /* , config */ }) {
        // Formato de retorno esperado (igual ao da simulação):
        //   { transacaoId, status: 'aprovado' | 'aguardando_pagamento' | 'recusado', mensagem?,
        //     pix?: { copiaECola, qrCodeBase64?, expiraEm },
        //     boleto?: { linhaDigitavel, urlPdf, vencimento },
        //     cartao?: { bandeira, ultimos4, parcelas, valorParcela } }
        void pedido;
        if (pagamento.metodo === 'pix') {
            // TODO(Blue): criar cobrança Pix dinâmica com valor pedido.totais.total e txid = pedido.numero
            throw pendente('Pix');
        }
        if (pagamento.metodo === 'boleto') {
            // TODO(Blue): registrar boleto com os dados do pagador (pedido.cliente / pedido.endereco)
            throw pendente('boleto');
        }
        // TODO(Blue): autorizar e capturar o cartão usando pagamento.token (gerado pelo SDK no navegador)
        throw pendente('cartão');
    },

    async processarWebhook({ corpo, cabecalhos, config }) {
        // TODO(Blue): validar a assinatura (config.pagamento.blue.webhookSegredo) e devolver
        //   { numeroPedido, status: 'pago' | 'cancelado' | 'expirado', transacaoId }
        void corpo; void cabecalhos; void config;
        throw pendente('webhook');
    },
};

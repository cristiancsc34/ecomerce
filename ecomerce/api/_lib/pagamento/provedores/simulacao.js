// Provedor de pagamento de TESTE: não cobra nada. Usado até a integração com o banco ser ativada.
// Cartão terminado em 0002 simula recusa; qualquer outro cartão válido simula aprovação.
import { CONFIG_LOJA } from '../../../../assets/js/config-loja.js';

export const simulacao = {
    id: 'simulacao',
    nome: 'Simulação (sem cobrança real)',
    teste: true,

    configurado: () => true,

    async cobrar({ pedido, pagamento }) {
        const transacaoId = `sim_${pedido.numero}`;
        const agora = Date.now();

        if (pagamento.metodo === 'pix') {
            return {
                transacaoId,
                status: 'aguardando_pagamento',
                pix: {
                    copiaECola: `PIX-TESTE-${pedido.numero}-SEM-VALOR-REAL`,
                    expiraEm: new Date(agora + 30 * 60 * 1000).toISOString(),
                },
            };
        }

        if (pagamento.metodo === 'boleto') {
            const venc = new Date(agora + CONFIG_LOJA.boletoDiasVencimento * 24 * 60 * 60 * 1000);
            return {
                transacaoId,
                status: 'aguardando_pagamento',
                boleto: {
                    linhaDigitavel: '00000.00000 00000.000000 00000.000000 0 00000000000000',
                    vencimento: venc.toISOString().slice(0, 10),
                    urlPdf: null,
                },
            };
        }

        // cartão
        if (!String(pagamento.token).startsWith('tok_sim_')) {
            return { transacaoId, status: 'recusado', mensagem: 'Cartão não reconhecido. Revise os dados e tente novamente.' };
        }
        if (pagamento.ultimos4 === '0002') {
            return { transacaoId, status: 'recusado', mensagem: 'Pagamento recusado pelo banco emissor. Tente outro cartão ou pague com Pix.' };
        }
        return {
            transacaoId,
            status: 'aprovado',
            cartao: {
                bandeira: pagamento.bandeira,
                ultimos4: pagamento.ultimos4,
                parcelas: pagamento.parcelas,
                valorParcela: pagamento.valorParcela,
            },
        };
    },

    async processarWebhook() {
        return { ignorado: true };
    },
};

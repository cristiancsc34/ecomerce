// POST /api/webhooks/pagamento -> confirmação de pagamento enviada pelo banco (Pix pago, boleto compensado...).
// Cadastre esta URL no painel do banco: https://azconfort.com.br/api/webhooks/pagamento
import { rota, lerCorpo } from '../_lib/http.js';
import { obterConfig } from '../_lib/config.js';
import { provedorAtivo } from '../_lib/pagamento/index.js';
import { armazenamento } from '../_lib/armazenamento.js';

export default rota(['POST'], async (req) => {
    const config = obterConfig();
    const evento = await provedorAtivo(config).processarWebhook({ corpo: lerCorpo(req), cabecalhos: req.headers, config });
    if (evento?.numeroPedido && evento?.status) {
        await armazenamento.atualizarStatus(evento.numeroPedido, evento.status, { transacaoId: evento.transacaoId });
    }
    return { recebido: true };
});

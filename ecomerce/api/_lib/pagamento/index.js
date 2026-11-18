// Escolhe o provedor de pagamento pela variável PAGAMENTO_PROVEDOR (simulacao | blue).
// Para outro banco/gateway: crie provedores/<nome>.js com a mesma interface e registre aqui.
import { simulacao } from './provedores/simulacao.js';
import { blue } from './provedores/blue.js';
import { ErroConfiguracao } from '../http.js';

export const PROVEDORES = { simulacao, blue };

export function provedorAtivo(config) {
    const provedor = PROVEDORES[config.pagamento.provedor];
    if (!provedor) throw new ErroConfiguracao(`Provedor de pagamento desconhecido: ${config.pagamento.provedor}`);
    return provedor;
}

export async function cobrar({ pedido, pagamento, config }) {
    const provedor = provedorAtivo(config);
    if (!provedor.configurado(config)) {
        throw new ErroConfiguracao('Pagamento ainda não configurado na loja. Tente novamente mais tarde.');
    }
    return provedor.cobrar({ pedido, pagamento, config });
}

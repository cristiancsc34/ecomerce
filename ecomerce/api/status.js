// GET /api/status -> o que está ativo na loja (usado pelo checkout para mostrar o aviso de modo teste).
import { rota } from './_lib/http.js';
import { obterConfig } from './_lib/config.js';
import { provedorAtivo } from './_lib/pagamento/index.js';
import { TRANSPORTADORAS } from './_lib/logistica/index.js';
import { CONFIG_LOJA } from '../assets/js/config-loja.js';

export default rota(['GET'], async () => {
    const config = obterConfig();
    const provedor = provedorAtivo(config);
    const transportadoras = config.logistica.transportadoras
        .filter(id => TRANSPORTADORAS[id]?.configurada(config));
    const freteDeExemplo = transportadoras.includes('tabela') && config.logistica.tabelaEhExemplo;
    const melhorEnvioSandbox = transportadoras.includes('melhorenvio') && config.logistica.melhorEnvio.ambiente === 'sandbox';
    return {
        modoTeste: Boolean(provedor.teste || freteDeExemplo || melhorEnvioSandbox),
        pagamento: { provedor: provedor.id, configurado: provedor.configurado(config), teste: Boolean(provedor.teste) },
        logistica: { transportadoras, freteDeExemplo, melhorEnvioSandbox },
        regras: CONFIG_LOJA,
    };
});

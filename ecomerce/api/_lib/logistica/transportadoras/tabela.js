// Transportadora "tabela própria": calcula pelo arquivo de tabela (ou LOGISTICA_TABELA_JSON).
import { zonaEntrega } from '../cep.js';
import { dividirEmVolumes, pesoTaxavel } from '../pacote.js';
import { arredondar } from '../../../../assets/js/validacao.js';

export const tabela = {
    id: 'tabela',

    configurada: () => true,

    async cotar({ cepOrigem, cepDestino, itens, config }) {
        const tab = config.logistica.tabela;
        const zona = zonaEntrega(cepOrigem, cepDestino);
        if (!zona) return [];

        const calculados = tab.servicos.map(servico => {
            const regra = servico.zonas?.[zona];
            const volumes = regra ? dividirEmVolumes(itens, servico.limites) : null;
            if (!volumes) return { servico, disponivel: false };
            const preco = volumes.reduce((total, v) => {
                const excedente = Math.max(0, Math.ceil(pesoTaxavel(v) - 1));
                return total + regra.base + regra.kgAdicional * excedente;
            }, 0);
            return { servico, disponivel: true, preco: arredondar(preco), prazoDias: regra.prazo, volumes: volumes.length };
        });

        const algumComum = calculados.some(c => c.disponivel && !c.servico.somenteSeNecessario);
        return calculados
            .filter(c => c.disponivel && !(c.servico.somenteSeNecessario && algumComum))
            .map(c => ({
                servicoId: c.servico.id,
                transportadora: tab.nome,
                servico: c.servico.nome,
                preco: c.preco,
                prazoDias: c.prazoDias,
                volumes: c.volumes,
                simulado: config.logistica.tabelaEhExemplo,
            }));
    },
};

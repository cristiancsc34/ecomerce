// Melhor Envio: uma integração que cota várias transportadoras ao mesmo tempo
// (Correios, Jadlog, Loggi, J&T, Azul Cargo e outras habilitadas na conta).
// Documentação: https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos
//
// Variáveis: MELHORENVIO_TOKEN, MELHORENVIO_AMBIENTE (sandbox | producao),
// MELHORENVIO_SERVICOS (opcional, ids separados por vírgula), LOJA_EMAIL_CONTATO.

const URLS = {
    sandbox: 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate',
    producao: 'https://melhorenvio.com.br/api/v2/me/shipment/calculate',
};

export const melhorEnvio = {
    id: 'melhorenvio',

    configurada: (config) => Boolean(config.logistica.melhorEnvio.token),

    async cotar({ cepOrigem, cepDestino, itens, config, signal, fetchImpl = globalThis.fetch }) {
        const me = config.logistica.melhorEnvio;
        const corpo = {
            from: { postal_code: cepOrigem },
            to: { postal_code: cepDestino },
            products: itens.map(i => ({
                id: i.sku,
                width: Math.ceil(i.dimensoes.largura),
                height: Math.ceil(i.dimensoes.altura),
                length: Math.ceil(i.dimensoes.comprimento),
                weight: i.peso,
                insurance_value: i.preco,
                quantity: i.qtd,
            })),
            options: { receipt: false, own_hand: false },
        };
        if (me.servicos) corpo.services = me.servicos;

        const resposta = await fetchImpl(URLS[me.ambiente], {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${me.token}`,
                'User-Agent': `AzConfort (${config.contatoTecnico})`,
            },
            body: JSON.stringify(corpo),
            signal,
        });
        if (!resposta.ok) {
            const texto = await resposta.text().catch(() => '');
            throw new Error(`Melhor Envio respondeu ${resposta.status}: ${texto.slice(0, 300)}`);
        }
        const servicos = await resposta.json();
        if (!Array.isArray(servicos)) return [];

        return servicos
            .filter(s => !s.error)
            .map(s => ({
                servicoId: String(s.id),
                transportadora: s.company?.name || 'Transportadora',
                servico: s.name,
                preco: Number(s.custom_price ?? s.price),
                prazoDias: Number(s.custom_delivery_time ?? s.delivery_time),
                simulado: me.ambiente === 'sandbox',
            }))
            .filter(o => Number.isFinite(o.preco) && o.preco >= 0 && Number.isFinite(o.prazoDias));
    },
};

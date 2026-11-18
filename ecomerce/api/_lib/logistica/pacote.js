// Montagem de volumes (caixas) a partir dos itens do pedido.

export const pesoCubico = ({ comprimento, largura, altura }) => (comprimento * largura * altura) / 6000;

export function cabeNoLimite(caixa, limites) {
    const lados = [caixa.comprimento, caixa.largura, caixa.altura];
    return caixa.pesoKg <= limites.pesoKg
        && Math.max(...lados) <= limites.ladoCm
        && lados.reduce((a, b) => a + b, 0) <= limites.somaCm;
}

// Divide as unidades em volumes que respeitam os limites do serviço (empilhando pela altura).
// Retorna null se algum item sozinho não cabe no serviço.
export function dividirEmVolumes(itens, limites) {
    const unidades = [];
    for (const item of itens) {
        // Deita o item: maior medida vira comprimento, menor vira altura.
        const [c, l, a] = [item.dimensoes.comprimento, item.dimensoes.largura, item.dimensoes.altura].sort((x, y) => y - x);
        for (let i = 0; i < item.qtd; i++) unidades.push({ comprimento: c, largura: l, altura: a, pesoKg: item.peso, valor: item.preco });
    }
    unidades.sort((x, y) => (y.comprimento * y.largura * y.altura) - (x.comprimento * x.largura * x.altura));

    const volumes = [];
    for (const u of unidades) {
        if (!cabeNoLimite(u, limites)) return null;
        const destino = volumes.find(v => cabeNoLimite({
            comprimento: Math.max(v.comprimento, u.comprimento),
            largura: Math.max(v.largura, u.largura),
            altura: v.altura + u.altura,
            pesoKg: v.pesoKg + u.pesoKg,
        }, limites));
        if (destino) {
            destino.comprimento = Math.max(destino.comprimento, u.comprimento);
            destino.largura = Math.max(destino.largura, u.largura);
            destino.altura += u.altura;
            destino.pesoKg += u.pesoKg;
            destino.valor += u.valor;
        } else {
            volumes.push({ ...u });
        }
    }
    return volumes;
}

export const pesoTaxavel = (volume) => Math.max(volume.pesoKg, pesoCubico(volume));

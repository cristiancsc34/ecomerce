// Tabela de frete própria (transportadora parceira, motoboy, etc.).
//
// ATENÇÃO: os valores abaixo são EXEMPLOS para testar a loja. Antes de vender, troque pelos
// valores negociados com a transportadora, ou defina a variável LOGISTICA_TABELA_JSON na Vercel
// com o mesmo formato.
//
// Zonas (calculadas a partir do CEP de origem da loja e do CEP do cliente):
//   local    = mesmo estado
//   regional = mesma região do país
//   nacional = outra região (exceto Norte)
//   remota   = região Norte
// Preço de cada volume = base + kgAdicional × (peso taxável acima de 1 kg, arredondado para cima).
// Peso taxável = maior entre o peso real e o peso cúbico (C × L × A / 6000).

export const TABELA_PADRAO = {
    nome: 'Tabela própria',
    servicos: [
        {
            id: 'economica',
            nome: 'Entrega Econômica',
            limites: { pesoKg: 30, ladoCm: 100, somaCm: 200 },
            zonas: {
                local: { base: 16.9, kgAdicional: 1.9, prazo: 3 },
                regional: { base: 19.9, kgAdicional: 2.4, prazo: 5 },
                nacional: { base: 26.9, kgAdicional: 3.5, prazo: 8 },
                remota: { base: 34.9, kgAdicional: 4.9, prazo: 12 },
            },
        },
        {
            id: 'expressa',
            nome: 'Entrega Expressa',
            limites: { pesoKg: 30, ladoCm: 100, somaCm: 200 },
            zonas: {
                local: { base: 24.9, kgAdicional: 2.9, prazo: 1 },
                regional: { base: 32.9, kgAdicional: 3.9, prazo: 2 },
                nacional: { base: 44.9, kgAdicional: 5.5, prazo: 4 },
                remota: { base: 59.9, kgAdicional: 7.5, prazo: 6 },
            },
        },
        {
            // Só aparece quando algum item não cabe nas entregas acima (ex.: bicicleta).
            id: 'volumes-grandes',
            nome: 'Transportadora (volumes grandes)',
            somenteSeNecessario: true,
            limites: { pesoKg: 150, ladoCm: 200, somaCm: 450 },
            zonas: {
                local: { base: 69.9, kgAdicional: 2.2, prazo: 4 },
                regional: { base: 89.9, kgAdicional: 2.8, prazo: 6 },
                nacional: { base: 129.9, kgAdicional: 3.9, prazo: 9 },
                remota: { base: 179.9, kgAdicional: 5.2, prazo: 14 },
            },
        },
    ],
};

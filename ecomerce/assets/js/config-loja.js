// Regras comerciais da loja. Ficam num só lugar e valem para o navegador e para o servidor.
// Todos os valores abaixo são decisões de negócio: ajuste antes de abrir a loja.

export const CONFIG_LOJA = {
    // Quantidade máxima de um mesmo produto por pedido.
    maxPorItem: 10,

    // Parcelamento no cartão (sem juros). Parcela mínima em reais.
    parcelamento: {
        maxParcelas: 6,
        parcelaMinima: 20,
    },

    // Desconto para pagamento via Pix, em % (0 = sem desconto).
    descontoPixPercentual: 0,

    // Frete grátis a partir deste subtotal em reais (null = desativado).
    // Quando ativo, a opção de entrega mais barata sai de graça.
    freteGratisAcima: null,

    // Boleto: dias corridos até o vencimento.
    boletoDiasVencimento: 3,
};

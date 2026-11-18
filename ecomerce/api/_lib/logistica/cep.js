// CEP -> estado (UF) -> região. Faixas oficiais de CEP por estado.
const FAIXAS = [
    [1000000, 19999999, 'SP'], [20000000, 28999999, 'RJ'], [29000000, 29999999, 'ES'],
    [30000000, 39999999, 'MG'], [40000000, 48999999, 'BA'], [49000000, 49999999, 'SE'],
    [50000000, 56999999, 'PE'], [57000000, 57999999, 'AL'], [58000000, 58999999, 'PB'],
    [59000000, 59999999, 'RN'], [60000000, 63999999, 'CE'], [64000000, 64999999, 'PI'],
    [65000000, 65999999, 'MA'], [66000000, 68899999, 'PA'], [68900000, 68999999, 'AP'],
    [69000000, 69299999, 'AM'], [69300000, 69399999, 'RR'], [69400000, 69899999, 'AM'],
    [69900000, 69999999, 'AC'], [70000000, 72799999, 'DF'], [72800000, 72999999, 'GO'],
    [73000000, 73699999, 'DF'], [73700000, 76799999, 'GO'], [76800000, 76999999, 'RO'],
    [77000000, 77999999, 'TO'], [78000000, 78899999, 'MT'], [79000000, 79999999, 'MS'],
    [80000000, 87999999, 'PR'], [88000000, 89999999, 'SC'], [90000000, 99999999, 'RS'],
];

const REGIOES = {
    Sudeste: ['SP', 'RJ', 'ES', 'MG'],
    Sul: ['PR', 'SC', 'RS'],
    'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
    Nordeste: ['BA', 'SE', 'PE', 'AL', 'PB', 'RN', 'CE', 'PI', 'MA'],
    Norte: ['PA', 'AP', 'AM', 'RR', 'AC', 'RO', 'TO'],
};

export const limparCep = (cep) => String(cep ?? '').replace(/\D/g, '');

export function cepParaUF(cep) {
    const n = Number(limparCep(cep));
    if (limparCep(cep).length !== 8) return null;
    const faixa = FAIXAS.find(([ini, fim]) => n >= ini && n <= fim);
    return faixa ? faixa[2] : null;
}

export function regiaoDaUF(uf) {
    return Object.keys(REGIOES).find(r => REGIOES[r].includes(uf)) || null;
}

export function zonaEntrega(cepOrigem, cepDestino) {
    const ufO = cepParaUF(cepOrigem);
    const ufD = cepParaUF(cepDestino);
    if (!ufO || !ufD) return null;
    if (ufO === ufD) return 'local';
    const rO = regiaoDaUF(ufO);
    const rD = regiaoDaUF(ufD);
    if (rO === rD) return 'regional';
    if (rD === 'Norte' || rO === 'Norte') return 'remota';
    return 'nacional';
}

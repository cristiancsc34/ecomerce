// POST /api/frete  { cep, itens: [{ id, qtd }] }  ->  opções de entrega
import { rota, lerCorpo } from './_lib/http.js';
import { obterConfig } from './_lib/config.js';
import { cotarFrete } from './_lib/logistica/index.js';

export default rota(['POST'], async (req) => {
    const { cep, itens } = lerCorpo(req);
    return cotarFrete({ cep, itens }, obterConfig());
});

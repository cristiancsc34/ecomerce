// POST /api/pedidos  { cliente, endereco, itens, frete: { id }, pagamento }  ->  pedido + cobrança
import { rota, lerCorpo } from './_lib/http.js';
import { obterConfig } from './_lib/config.js';
import { criarPedido } from './_lib/pedidos.js';

export default rota(['POST'], async (req) => criarPedido(lerCorpo(req), obterConfig()));

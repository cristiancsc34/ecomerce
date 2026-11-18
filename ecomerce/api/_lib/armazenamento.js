// Armazenamento de pedidos.
//
// PROVISÓRIO: guarda em memória (some quando a função reinicia). Serve para testes.
// Antes de vender de verdade, troque por um banco de dados (ex.: Supabase/Postgres)
// mantendo as mesmas funções: salvar, buscar, atualizarStatus.

const pedidos = new Map();

export const armazenamento = {
    async salvar(pedido) {
        pedidos.set(pedido.numero, structuredClone(pedido));
        return pedido;
    },
    async buscar(numero) {
        const p = pedidos.get(numero);
        return p ? structuredClone(p) : null;
    },
    async atualizarStatus(numero, status, extra = {}) {
        const p = pedidos.get(numero);
        if (!p) return null;
        Object.assign(p, extra, { status, atualizadoEm: new Date().toISOString() });
        p.historico = [...(p.historico || []), { status, em: p.atualizadoEm }];
        return structuredClone(p);
    },
};

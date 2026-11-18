// Configuração do servidor, lida das variáveis de ambiente (na Vercel: Settings > Environment Variables).
// Chaves e senhas NUNCA vão no código: só aqui, via process.env.
import { TABELA_PADRAO } from './logistica/tabela-padrao.js';

const lista = (v, padrao) => (v ?? padrao).split(',').map(s => s.trim()).filter(Boolean);

export function obterConfig(env = process.env) {
    let tabela = TABELA_PADRAO;
    let tabelaEhExemplo = true;
    if (env.LOGISTICA_TABELA_JSON) {
        try { tabela = JSON.parse(env.LOGISTICA_TABELA_JSON); tabelaEhExemplo = false; } catch {
            console.error('[config] LOGISTICA_TABELA_JSON inválido; usando a tabela de exemplo.');
        }
    }
    return {
        contatoTecnico: env.LOJA_EMAIL_CONTATO || 'contato@azconfort.com.br',
        logistica: {
            cepOrigem: (env.LOJA_CEP_ORIGEM || '20040020').replace(/\D/g, ''),
            transportadoras: lista(env.LOGISTICA_TRANSPORTADORAS, 'tabela'),
            diasManuseio: Number(env.LOGISTICA_DIAS_MANUSEIO ?? 1),
            timeoutMs: Number(env.LOGISTICA_TIMEOUT_MS ?? 8000),
            tabela,
            tabelaEhExemplo,
            melhorEnvio: {
                token: env.MELHORENVIO_TOKEN || '',
                ambiente: env.MELHORENVIO_AMBIENTE === 'producao' ? 'producao' : 'sandbox',
                servicos: env.MELHORENVIO_SERVICOS || '',
            },
        },
        pagamento: {
            provedor: env.PAGAMENTO_PROVEDOR || 'simulacao',
            blue: {
                apiUrl: env.BLUE_API_URL || '',
                clientId: env.BLUE_CLIENT_ID || '',
                clientSecret: env.BLUE_CLIENT_SECRET || '',
                webhookSegredo: env.BLUE_WEBHOOK_SEGREDO || '',
            },
        },
    };
}

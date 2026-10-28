# Decisões, integrações pendentes e limitações

## Decisões tomadas na implementação

| Decisão | Por quê |
| --- | --- |
| **Next.js 16 com Cache Components** | Padrão do `create-next-app` atual. Vitrine pré-renderizada (rápida, barata) e invalidada na hora pelo painel com `updateTag("catalog")` |
| **Catálogo filtrado no servidor, em memória** | Com dezenas/centenas de produtos, uma única consulta em cache + filtro em TypeScript é simples, consistente (mesma lógica no modo demonstração) e testável. Acima de ~1.000 produtos, mover busca e filtros para o Postgres (índices/FTS) |
| **Modo demonstração em vez de dados falsos no banco** | A vitrine pode ser vista e testada sem banco; tudo marcado como ilustrativo e `noindex`. No banco, os mesmos produtos ficam em rascunho com `is_demo = true` e não podem ser publicados |
| **Variações por tamanho** | Colchões têm preço por tamanho; filtros de tamanho dependem disso. Tamanhos-padrão brasileiros pré-preenchem medidas, editáveis |
| **Categorias como tabela** | As páginas `/categorias/[slug]` já existem; a spec listava a tabela como futura, mas o fluxo foi implementado agora |
| **Regras críticas no banco** | Publicação, papéis e demonstração são garantidos por triggers/constraints, não só pela interface |
| **RPCs atômicas** (`save_product`, `duplicate_product`…) | Produto + variações salvos numa transação; RLS continua valendo (`security invoker`) |
| **Upload pela Server Action (até 4 MB)** | Permite validar o conteúdo no servidor antes de gravar. Limite da Vercel: 4,5 MB por requisição. Para arquivos maiores (vídeos), usar URL assinada de upload + verificação posterior |
| **Derivados de imagem pelo otimizador do Next** | O original fica intacto no Storage; AVIF/WebP e tamanhos responsivos são gerados na entrega |
| **Sacola no `localStorage`** | Sem conta e sem cookies; só ids e quantidades. Preço sempre recalculado no servidor |
| **3D com `<model-viewer>` sob demanda** | Biblioteca e `.glb` só baixam no clique (testado). Realidade aumentada no celular: Scene Viewer no Android (WebXR de reserva) e AR Quick Look no iPhone |
| **Ilustrações próprias** | Não há fotos reais ainda; usar fotos de terceiros seria copiar identidade. Todas marcadas como ilustrativas |
| **Fonte Inter via `next/font`** | Auto-hospedada no build, com métricas de fallback (evita salto de layout) |
| **`air-blue-ink` (#2E6E9E)** | O `#408AC2` tem contraste 3,7:1 sobre branco (abaixo de AA para texto). Usamos uma variante escura só para texto de links; o azul original fica para ícones e elementos grandes |

## Revisão de código independente (27/10/2026)

Corrigido (com teste que falha sem a correção):

| Achado | Correção |
| --- | --- |
| Editor conseguia sobrescrever ou apagar, direto pela API do Storage, a foto de um produto publicado | Migração `20261027000200_review_fixes.sql`: sobrescrever só admin; editor só apaga arquivo que não está em produto publicado/arquivado |
| Com variações, o preço-base entrava no “a partir de”, filtros, ordenação e JSON-LD, mas a sacola só vende variações | `purchasablePrices`: com variações, só os preços delas |
| Salvar duas vezes seguidas recriava os tamanhos novos (ids mudavam e sacolas abertas perdiam o item) | O formulário recarrega os ids gravados após salvar |
| Slug da cópia (`duplicate_product`) podia passar de 80 caracteres ou gerar `--` | Corte em 67 caracteres sem hífen final |

Registrado como melhoria futura (baixo risco, não alterado para não mexer no que funciona):

- As regras de publicação (preço, foto principal real, textos alternativos) são checadas na **mudança** para
  publicado. Um admin pode, depois, trocar a principal por uma ilustrativa ou apagar o preço de um produto já no ar;
  preço 0 é aceito. O painel avisa, mas o banco não bloqueia. Melhoria: validar também em updates de produtos
  publicados e exigir preço > 0.
- `set_primary_media` e `reorder_media` respondem “ok” mesmo quando a RLS não deixou alterar nenhuma linha (por
  exemplo, editor em produto publicado). Nada muda no banco, mas a mensagem de sucesso aparece. Melhoria: checar
  `found`/quantidade de linhas e devolver erro.

## Medições de desempenho (locais)

Build de produção em modo demonstração, celular emulado (390 px), rede ~4G (150 ms, 1,6 Mbps) e CPU 4× mais lenta,
em 27/10/2026:

| Página | LCP | CLS | JS transferido |
| --- | --- | --- | --- |
| `/` | 0,84 s | 0 | ~199 KB |
| `/produtos` | 0,80 s | 0 | ~205 KB |
| `/produtos/sereno-hibrido` | 0,89 s | 0 | ~205 KB (3D não incluso: só baixa no clique) |

Metas da spec: LCP ≤ 2,5 s, CLS ≤ 0,1. São medições de laboratório num servidor local; confirme em produção com o
Vercel Speed Insights ou o PageSpeed Insights, com fotos reais (mais pesadas que as ilustrações SVG).

## Decisões pendentes (da especificação, seção 18)

1. **Nome**: “Cuxões” segue como placeholder (trocar em `config/brand.ts` e `NEXT_PUBLIC_BRAND_NAME`). Validar marca e domínio antes de investir.
2. **Mix do catálogo**: só colchões ou também bases, camas e acessórios? (Basta criar categorias no painel.)
3. **Pagamento desde o primeiro dia?** Hoje a sacola simula valores e a venda é pelo atendimento.
4. **Estoque e regras de entrega/devolução**: definir fonte do estoque, regiões atendidas e procedimento de troca.
5. **Provedores**: pagamento, frete, IA de imagem e 3D (proposta em [`PROXIMA-FASE-IA-3D.md`](PROXIMA-FASE-IA-3D.md)).
6. **3D no lançamento?** A prova de conceito está pronta; o modelo real precisa ser produzido e revisado.

Também faltam os dados para preencher: contatos, razão social, CNPJ e endereço (`config/brand.ts`), e as fotos e
especificações reais dos três produtos.

## Integrações pendentes (não simuladas)

| Integração | O que precisa ser decidido | Onde entra no código |
| --- | --- | --- |
| **Pagamento** (ex.: Mercado Pago, Pagar.me, Stripe) | Provedor, Pix/cartão/parcelamento, tarifas | Criar `orders`, `order_items`, `payments`; checkout do provedor (tokenização); confirmação **só** por webhook assinado (`PAYMENT_WEBHOOK_SECRET`) com idempotência; preço/estoque recalculados como em `lib/cart/quote.ts` |
| **Frete** (Correios, Melhor Envio, transportadora) | Origem, cobertura, logística volumosa | Cotação por CEP no carrinho; tabela `shipping_quotes`. Nunca mostrar prazo/valor fictício |
| **E-mail transacional** | Provedor; SPF, DKIM, DMARC | Disparo a partir de eventos reais de pedido |
| **IA de imagens e descrições** | Provedor e custo | Ver [`IA-E-3D.md`](IA-E-3D.md) |
| **Analytics** | Ferramenta e consentimento | Só eventos úteis, com banner de consentimento se não for estritamente necessário |

## Limitações conhecidas

- **Supabase em nuvem não foi criado**: a organização atingiu o limite de 2 projetos gratuitos (os outros dois são de
  outro sistema e não foram tocados). Todo o painel foi testado com o Supabase **local** (mesmos serviços). Para
  produção, siga o README.
- **“Soft 404”**: com Partial Prerendering, uma URL de produto inexistente responde com status 200 e a página “não
  encontrada” com `noindex` (o conteúdo é transmitido depois do cabeçalho). Buscadores não indexam.
- **Rate limit do login em memória** (por instância serverless). O Supabase Auth tem limites próprios.
- **Upload até 4 MB** (limite de corpo da Vercel). Comprimir fotos antes de enviar.
- **Repositório público** no GitHub (a spec pede privado).
- **Mudanças feitas direto no banco** (sem o painel) aparecem na vitrine em até 1 hora (`cacheLife("hours")`).

# Checklist de segurança

Legenda: ✅ feito e testado · 🔶 feito, com ressalva · ⏳ pendente (depende de decisão ou do lançamento)

## Acesso e autorização

| Item | Status | Como |
| --- | --- | --- |
| Sem cadastro público de administradores | ✅ | Sign-up desligado no Auth (`supabase/config.toml`); contas só via `scripts/create-admin.mjs` (service role local). Testado: `tests/integration`, `tests/e2e-supabase` |
| Autorização no servidor em toda ação | ✅ | `requireStaffAction()` em cada Server Action; `requireStaffPage()` em cada página. Testado: `tests/unit/admin-actions-auth.test.ts` |
| Papéis (admin × editor) no banco | ✅ | Triggers recusam publicar/arquivar/editar publicado/converter demonstração por editor. Testado: `tests/db/rls.test.ts` |
| `proxy.ts` só como checagem otimista | ✅ | Renova sessão e redireciona; a decisão real fica no servidor e no RLS |
| Papel nunca vem do navegador | ✅ | Lido de `admin_users` com a sessão; `admin_users` não tem política de escrita |
| Sessão validada no servidor | ✅ | `auth.getUser()` (consulta o Auth, detecta sessão revogada) |
| Redirecionamento pós-login sem open redirect | ✅ | `safeNext()` só aceita `/admin/...` |

## Dados (RLS e privilégios)

| Item | Status | Como |
| --- | --- | --- |
| RLS ligado em todas as tabelas expostas | ✅ | `supabase/migrations/20261027000100_catalog.sql` |
| Público só vê publicado e não-demo | ✅ | Políticas + `grant select (colunas)` para `anon`. Testado com PGlite e Supabase real |
| Colunas internas fora do alcance público | ✅ | `created_by`/`updated_by` sem grant para `anon` |
| Demonstração nunca publica | ✅ | Constraint + trigger. Testado |
| Publicar exige preço, foto principal **real**, alt text, categoria e descrição | ✅ | Trigger + `publishIssues()`. Testado |
| Funções do painel inacessíveis ao público | ✅ | `revoke execute ... from anon`; `security invoker` (RLS vale dentro delas) |
| Auditoria imutável pela API | ✅ | `audit_events` sem políticas de escrita; triggers `security definer`. Testado |
| App não usa service role em produção | ✅ | Só a chave pública + sessão do usuário |

## Uploads e Storage

| Item | Status | Como |
| --- | --- | --- |
| Tipo pelo conteúdo (magic bytes), não pela extensão | ✅ | `lib/media/validate.ts`. SVG/HTML/executáveis recusados. Testado |
| Extensão coerente com o conteúdo | ✅ | Testado |
| Tamanho máximo 4 MB, dimensões 400–8000 px | ✅ | Servidor + limite do bucket |
| Nome do arquivo nunca vira caminho | ✅ | `products/<id>/<uuid>.<ext>` |
| Bucket restringe MIME e tamanho | ✅ | `allowed_mime_types`, `file_size_limit` na migração. Testado (HTML recusado) |
| Escrita no Storage só pela equipe e só em `products/` | ✅ | Políticas em `storage.objects`. Testado (anônimo, cliente, editor) |
| Listagem do bucket só pela equipe | ✅ | Sem política de `select` para `anon` |
| Leitura pública por URL | 🔶 | O bucket é público para servir a vitrine. Arquivos de rascunho usam UUID (não adivinháveis), mas quem tiver a URL consegue abrir. Se fotos ainda não lançadas forem sensíveis, trocar por bucket privado + URLs assinadas |
| Arquivos órfãos removidos | ✅ | `lib/admin/storage.ts` (só remove se nenhuma mídia usa o caminho) |

## Aplicação web

| Item | Status | Como |
| --- | --- | --- |
| Preço/estoque nunca vêm do navegador | ✅ | `/api/cart/quote` recalcula com o catálogo; a sacola guarda só ids e quantidades. Testado (preço adulterado ignorado) |
| Entradas validadas com Zod no servidor | ✅ | `lib/validation/product.ts`, `lib/cart/types.ts` |
| Cabeçalhos de segurança | ✅ | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS (produção). Testado |
| CSP | 🔶 | Sem nonce (usa `'unsafe-inline'` em scripts para manter páginas estáticas). Bloqueia frames, plugins, `<base>`, envio de formulário externo e restringe origens de imagem/mídia/conexão |
| Dados estruturados sem injeção | ✅ | `JsonLd` escapa `<` |
| Texto do banco renderizado como texto | ✅ | Sem `dangerouslySetInnerHTML` para conteúdo de produto |
| Rate limiting no login | 🔶 | Por IP e por e-mail, em memória (por instância) + limites do próprio Supabase Auth. Para limite global, usar Redis/KV |
| Rate limiting em endpoints pagos de IA | ⏳ | Não há endpoint de IA ainda |
| Painel `noindex` e sem cache de CDN | ✅ | `X-Robots-Tag` e `Cache-Control: private, no-store` no `proxy.ts` |
| Logs sem dados sensíveis | ✅ | Erros de banco viram mensagens genéricas para o usuário; nada de tokens em logs |

## Segredos e repositório

| Item | Status | Como |
| --- | --- | --- |
| `.env*` fora do Git (exceto `.env.example`) | ✅ | `.gitignore` |
| `.env.example` sem valores | ✅ | |
| Repositório privado | ⏳ | **Hoje o repositório no GitHub é público.** Recomendado: Settings → General → Danger Zone → Change visibility → Private |
| Dependências atualizadas | ✅ | `npm audit`: 0 vulnerabilidades na data da entrega |

## Antes do lançamento (pendente)

- [ ] Projeto Supabase de produção com backups (PITR no plano pago) e teste de restauração.
- [ ] Desligar cadastro público no projeto hospedado (passo do README).
- [ ] Domínio próprio com HTTPS e `NEXT_PUBLIC_SITE_URL` correto.
- [ ] Revisão jurídica da política de privacidade e das regras de troca/entrega; preencher razão social, CNPJ e contato
  em `config/brand.ts` e desligar `policiesUnderReview`.
- [ ] Pagamento só com confirmação por webhook assinado e idempotência; nunca guardar dados de cartão.
- [ ] Monitoramento de erros e alertas de gasto (Vercel/Supabase/IA).

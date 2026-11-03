# Mapa do código: onde mudar o quê

Para a IA (e para quem programa). O projeto usa **Next.js 16**, com mudanças em relação a versões antigas: antes de
alterar código, leia o guia correspondente em `node_modules/next/dist/docs/` (regra do `AGENTS.md`).

## Marca e identidade

| O quê | Onde | Observação |
| --- | --- | --- |
| Nome, slogan, descrição, contatos, redes, razão social, CNPJ, endereço | `config/brand.ts` | Campo vazio (`""`) some da interface. O nome também pode vir de `NEXT_PUBLIC_BRAND_NAME`. |
| Aviso de política em revisão | `config/brand.ts` → `policiesUnderReview` | Deixe `true` até o dono aprovar os textos. |
| Cores | `config/tokens.ts` **e** `app/globals.css` (`@theme`) | Os dois precisam ter os mesmos valores (um teste confere). Outro teste confere o contraste mínimo (acessibilidade). |
| Ícone da aba | `app/icon.svg` | |
| Imagem de compartilhamento (WhatsApp, redes) | `app/opengraph-image.tsx` | Usa as cores de `config/tokens.ts`. |
| Cabeçalho, rodapé, menu | `components/layout/header.tsx`, `footer.tsx`, `nav-links.ts` | |
| Nome do pacote e do projeto local | `package.json` (`name`), `supabase/config.toml` (`project_id`) | Opcional. |
| Chaves do navegador com o prefixo `cuxoes:` | `lib/cart/store.ts`, `lib/use-stored-flag.ts`, `components/admin/ai-studio.tsx` | Opcional; trocar zera sacolas já guardadas (sem problema numa loja nova). Ajuste o teste `tests/e2e/store.spec.ts`. |

## Textos e páginas

| O quê | Onde |
| --- | --- |
| Página inicial (vitrine) | `app/(store)/page.tsx` |
| Atendimento | `app/(store)/atendimento/` |
| Políticas (entrega, trocas, privacidade, termos) | `app/(store)/politicas/*/page.tsx` e `components/layout/policy-page.tsx` |
| E-mails e mensagens de pedido (estrutura pronta, sem envio) | `lib/notifications/templates.ts` (há um teste com o nome da marca em `tests/unit/notifications.test.ts`) |

## Nicho (o projeto nasceu para colchões e móveis)

| O quê | Onde | Para outro nicho |
| --- | --- | --- |
| Categorias iniciais | Criadas pelas migrações (`Colchões`, `Cadeiras e poltronas`) | **Não edite migrações antigas.** Gerencie no painel: **Categorias** (criar, renomear, remover as que não usar). |
| 3D obrigatório por categoria | Painel → Categorias → “Exige modelo 3D para publicar” | |
| Tamanhos de colchão (Solteiro, Casal…) e firmeza | `lib/catalog/types.ts` (`SIZE_INFO`, `FIRMNESS_LEVELS`) e `components/admin/product-form.tsx` (`isMattressCategory`) | Só aparecem em categorias de colchão; pode deixar como está. Para outros tamanhos, adapte `SIZE_INFO`. |
| Instrução da IA para nome e descrição | `lib/ai/copy.ts` (`INSTRUCTIONS`: “loja online brasileira de móveis e colchões”) | Troque pelo nicho da loja. Mantenha as regras de não inventar. |
| Instrução da IA para fotos (limpeza, catálogo, cena) | `scripts/ai-pipeline.mjs` (`cleanupPrompt`, `catalogPrompt`, `scenePrompt`: falam em “furniture”) | Troque “piece of furniture” pelo tipo de produto, se não for móvel. |
| Assistente de vendas (regras e conhecimento) | `lib/assistant/prompt.ts`, `lib/assistant/knowledge.ts`, `lib/assistant/guard.ts` | Veja `docs/ASSISTENTE.md`. |
| Estilo das fotos de catálogo | Variável `CATALOG_STYLE` (`creme`, `neutro`, `ambiente-vazio`) | O cômodo do estilo `ambiente-vazio` está em `ai/cenarios/ambiente-vazio.jpg`. |

## Demonstração (antes de ter o banco)

| O quê | Onde |
| --- | --- |
| Produtos de demonstração (sem banco) | `lib/catalog/demo-data.ts` e as imagens/3D em `public/demo/` |
| Produtos de demonstração no banco (opcional) | `supabase/seed.sql` (ficam em rascunho, não podem ser publicados) |

Os produtos de demonstração são de outra loja (uma poltrona azul com 3D e uma cadeira cinza). Troque pelos da nova loja
ou deixe só até cadastrar os produtos reais; depois, use `CATALOG_SOURCE=supabase`.

## IA, banco e segurança (normalmente não precisa mexer)

| O quê | Onde | Documento |
| --- | --- | --- |
| Estúdio de fotos e 3D (painel) | `components/admin/ai-studio.tsx`, `lib/admin/actions/ai.ts`, `lib/admin/pipeline.ts` | `docs/ESTUDIO-IA.md` |
| IA na nuvem (fila na Vercel) | `lib/ai-cloud/`, `scripts/ai-pipeline.mjs`, `scripts/ai-background.mjs` | `docs/ESTUDIO-IA.md` |
| Nome e descrição guardados (“Aprimorar descrição”) | `lib/ai/copy.ts`, `lib/ai/copy-draft.ts` | `docs/ESTUDIO-IA.md` |
| Visualizador 3D e realidade aumentada | `components/product/viewer-3d.tsx` | `docs/IA-E-3D.md` |
| Pedidos, etapas da entrega, aviso no WhatsApp, “Acompanhar pedido” | `lib/orders/`, `app/admin/(painel)/pedidos/`, `app/(store)/pedido/` | `docs/LOGISTICA.md` |
| Banco, regras de acesso (RLS), bucket de fotos | `supabase/migrations/` | `docs/SEGURANCA.md` |
| Painel e papéis (admin, editor, PIN) | `app/admin/`, `lib/auth/` | `docs/PAINEL.md` |
| Conferir a configuração | `scripts/verificar-config.mjs` (`npm run config:verificar`) | `kit/GUIA-DE-CHAVES.md` |

## Testes

- `npm run check`: lint, tipos e testes de regras (inclui as regras de acesso do banco num Postgres embutido).
- `npm run test:e2e`: vitrine no navegador, no computador e no celular (rode `npx playwright install chromium` uma vez).
- Depois de trocar marca, cores e textos, alguns testes que citam a marca precisam ser atualizados junto (ex.:
  `tests/unit/notifications.test.ts`). Atualize o teste para a nova marca; nunca apague ou desligue um teste para passar.

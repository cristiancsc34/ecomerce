# Cuxões — Especificação do MVP de E-commerce

Versão: 1.0 · Data: 26/10/2026 · Nome da marca: Cuxões (provisório e substituível)

> **Objetivo:** construir um MVP responsivo para uma loja de colchões e produtos de descanso, com identidade azul-clara, catálogo inicial de três produtos, painel administrativo e arquitetura preparada para IA de imagens e visualização 3D. Priorizar confiança, velocidade, estabilidade visual, segurança e facilidade de manutenção.

## 1. Visão do produto

A loja deve transmitir conforto, qualidade e confiança sem parecer uma página genérica de ofertas. O produto e suas informações devem ser protagonistas.

### Objetivos

1. Apresentar a marca e os produtos com qualidade visual.
2. Permitir navegação, busca, filtros e páginas de produto completas.
3. Criar painel administrativo protegido para gerir catálogo e mídia.
4. Preparar integrações de pagamento, frete, IA e 3D sem fingir que estão prontas.
5. Validar o produto com três itens reais antes de escalar.

### Fora do escopo inicial

- App nativo, marketplace, microserviços ou recomendação algorítmica avançada.
- Geração de 3D sem revisão humana.
- Logística própria ou múltiplas integrações de frete antes da validação.
- Checkout real antes da escolha dos provedores e confirmação das regras comerciais.

## 2. Posicionamento e princípios

**Posicionamento:** descanso contemporâneo, acolhedor e fácil de escolher.

- **Produto em primeiro lugar:** fotos reais e especificações objetivas.
- **Calmo, não clínico:** tons suaves, com contraste acessível.
- **Confiança sem exagero:** não inventar avaliações, certificações, benefícios, estoque ou prazos.
- **Mobile-first:** projetar para telas pequenas e expandir para desktop.
- **Estabilidade visual:** reservar espaço para imagens e componentes; evitar layout shift.
- **Desempenho progressivo:** a loja funciona sem 3D; o visualizador carrega sob demanda.
- **IA assistiva:** todo conteúdo gerado precisa de aprovação humana.
- **Marca substituível:** nome, slogan, contatos e links em configuração central.

Pesquisar referências de lojas de colchões e marcas de descanso para aprender com páginas de produto, comparações de firmeza/tamanho, fotografia, transparência de entrega e UX mobile. Usar padrões como inspiração, sem copiar identidade, textos, imagens ou código.

## 3. Identidade visual

### Paleta

| Token | HEX | Uso |
| --- | --- | --- |
| brand/sky-mist | #C4E0F5 | Azul-claro de assinatura e fundos suaves |
| brand/air-blue | #408AC2 | Links, ícones e estados ativos |
| brand/deep-fjord | #132940 | Botões principais, títulos e navegação |
| surface/cloud | #F6FAFC | Fundo principal |
| surface/pale-blue | #E8F2FA | Blocos e superfícies alternadas |
| surface/linen | #E8DBC9 | Acento natural e campanhas |
| accent/warm-coral | #F5C7AD | Acentos discretos |
| text/primary | #1F2B38 | Texto principal |
| text/secondary | #5E707F | Texto secundário |
| border/default | #DCE5EC | Bordas e divisórias |
| surface/white | #FFFFFF | Cartões e modais |

Distribuição inicial sugerida: 70% superfícies claras, 20% azuis, 10% acentos. É orientação, não regra rígida. Testar contraste segundo WCAG 2.2 AA; evitar texto pequeno em azul-claro sobre branco.

### Tipografia e componentes

- Família: Inter. Títulos Bold/Semi Bold; interface Regular/Medium; botões Semi Bold.
- Texto-base de 16 px no mobile.
- Espaçamento consistente em múltiplos de 4 ou 8 px.
- Cantos de 12–24 px; sombras discretas; bordas suaves.
- Estados de foco, hover, pressionado, carregando, vazio e erro.
- Alvos de toque preferencialmente com pelo menos 44 × 44 px.
- Animações sutis e respeito a `prefers-reduced-motion`.
- Evitar carrosséis automáticos.

### Conteúdo temporário

- Marca: Cuxões
- Slogan: “Seu melhor descanso começa aqui.”
- CTA principal: “Encontrar meu colchão”
- CTA secundário: “Conhecer os produtos”

O nome é provisório. Validar naming, domínio e possíveis conflitos de marca antes de investir em registro, anúncios ou embalagens.

## 4. Arquitetura recomendada

### Stack

- Web: Next.js App Router + TypeScript.
- UI: Tailwind CSS + componentes acessíveis, adaptados à identidade.
- Banco e autenticação: Supabase (PostgreSQL + Auth).
- Mídia: Supabase Storage inicialmente; considerar Cloudflare R2 apenas se houver motivo claro.
- Deploy: Vercel.
- Repositório: GitHub privado.
- Validação: Zod + React Hook Form.
- Testes: Vitest e Playwright para fluxos críticos.
- E-mail: adicionar quando houver eventos reais de pedido.
- Pagamento/frete: escolher provedores adequados à operação brasileira antes de construir checkout.

### Regras de arquitetura

1. Não misturar Firebase e Supabase sem necessidade demonstrada.
2. Não criar microserviços no MVP.
3. Nunca colocar segredos no frontend ou em variáveis `NEXT_PUBLIC_*`.
4. `SUPABASE_SERVICE_ROLE_KEY` só no servidor.
5. Validar autorização no servidor; esconder botões não é controle de acesso.
6. Ativar RLS e criar políticas explícitas.
7. Validar MIME, extensão, tamanho e permissões de uploads.
8. Versionar migrações e manter `.env.example` sem segredos.
9. Não confiar em preço, estoque ou role enviados pelo navegador.
10. Usar preview deploy em pull requests e promover a produção após revisão.

### Estrutura sugerida

```
cuxoes/
├── app/
│   ├── (store)/
│   │   ├── page.tsx
│   │   ├── produtos/page.tsx
│   │   ├── produtos/[slug]/page.tsx
│   │   ├── categorias/[slug]/page.tsx
│   │   ├── busca/page.tsx
│   │   ├── carrinho/page.tsx
│   │   ├── atendimento/page.tsx
│   │   └── politicas/
│   ├── admin/
│   │   ├── page.tsx
│   │   └── produtos/
│   └── api/
├── components/{ui,layout,product,catalog,admin}/
├── lib/{supabase,validation,catalog,ai}/
├── config/brand.ts
├── public/
├── tests/
├── supabase/migrations/
├── .env.example
└── README.md
```

## 5. Páginas e funcionalidades

### Homepage

- Barra de aviso opcional, sem promoção falsa.
- Header com logo, navegação, busca, conta e sacola.
- Hero com título curto, CTA e foto real.
- Benefícios verificáveis.
- Categorias e produtos em destaque.
- Guia para escolher colchão.
- Bloco 3D apenas quando houver modelos aprovados.
- FAQ e rodapé com atendimento, políticas e dados legais aplicáveis.

### Catálogo

- Listagem responsiva, busca, filtros e ordenação.
- Filtros por categoria, tamanho, preço e atributos existentes nos dados.
- Ordenação por relevância e preço.
- Estados de carregamento, vazio e erro.
- Refletir filtros na URL para compartilhar resultados.
- Não mostrar filtros de atributos ainda não cadastrados.

### Página de produto

- Galeria com miniaturas, zoom acessível e vídeo opcional.
- Nome, descrição, preço e variações.
- Dimensões, materiais, altura, firmeza, garantia e cuidados, quando confirmados.
- Disponibilidade e entrega calculadas apenas com integração real.
- CTA de compra funcional quando checkout estiver implementado.
- FAQ específica e produtos relacionados relevantes.
- Visualizador 3D opcional, carregado sob demanda, com imagem estática como fallback.
- Avisar quando uma imagem for ilustrativa.

### Carrinho e checkout

O carrinho pode ser prototipado antes do checkout. Antes de aceitar pagamento:

- recalcular preço e estoque no servidor;
- calcular frete com integração real;
- criar pedido com tratamento de idempotência;
- confirmar pagamento por webhook assinado, nunca apenas pelo redirect;
- usar checkout/tokenização do provedor, sem armazenar dados brutos de cartão;
- testar falhas, cancelamentos, estornos e indisponibilidade.

### Painel administrativo

- Login protegido, sem cadastro público de administradores.
- Dashboard de publicados e rascunhos.
- Criar, editar, duplicar, arquivar e publicar produto.
- Upload, ordenação e texto alternativo de mídia.
- Campos de SEO e especificações.
- Preview antes de publicar.
- Estados: draft, review, published, archived.
- Confirmação antes de ações destrutivas.
- Autorização server-side e trilha mínima de alterações importantes.

## 6. Modelo de dados

### products

| Campo | Tipo sugerido | Regra |
| --- | --- | --- |
| id | UUID | Chave primária |
| name | text | Obrigatório |
| slug | text | Único |
| short_description | text | Opcional |
| description | text | Revisado |
| category_id | UUID/text | Categoria válida |
| status | enum/text | draft/review/published/archived |
| price_cents | integer | Centavos; nunca float |
| compare_at_price_cents | integer nullable | Só se legítimo |
| currency | text | BRL |
| sku | text nullable | Único se fornecido |
| stock_quantity | integer nullable | Se houver controle de estoque |
| dimensions | JSONB | Medidas verificadas |
| attributes | JSONB | Especificações confirmadas |
| seo_title | text nullable | Opcional |
| seo_description | text nullable | Opcional |
| created_at, updated_at | timestamptz | Automáticos |
| published_at | timestamptz nullable | Data de publicação |

### product_media

`id`, `product_id`, `storage_path`, `media_type`, `alt_text`, `sort_order`, `is_primary`, `created_at`.

### product_variants (apenas se necessário)

`id`, `product_id`, `name`, `sku`, `price_cents`, `stock_quantity`, `attributes`.

### admin_users ou profiles

`user_id`, `role`, `created_at`. A autorização deve ser validada no servidor e reforçada por RLS/políticas; nunca confiar em role enviada pelo cliente.

### Tabelas futuras

`categories`, `orders`, `order_items`, `payments`, `shipping_quotes`, `ai_jobs`, `model_3d_assets`, `audit_events`. Criar quando o fluxo for implementado, não preventivamente.

## 7. Catálogo inicial e fotos

Cadastrar três produtos reais como rascunho até que as informações estejam verificadas. Os nomes “Nuvem Essencial”, “Brisa Premium” e “Sereno Híbrido” do protótipo são placeholders, não produtos confirmados.

Para cada produto, reunir:

1. Foto frontal/¾.
2. Foto lateral mostrando altura e perfil.
3. Detalhe de tecido, costura ou camada.
4. Foto ambientada.
5. Medidas e especificações técnicas verificadas.
6. Vídeo curto opcional.

Preservar originais e armazenar derivados separadamente. Não publicar avaliações, certificações, preços ou características inventadas.

## 8. IA para imagens, descrições e 3D

### Pipeline de imagens

1. Upload e validação.
2. Preservar o original.
3. Criar cópia de trabalho.
4. Remover/substituir fundo ou gerar composição.
5. Comparar original e resultado.
6. Aprovação humana.
7. Publicar apenas o aprovado.

A IA não pode alterar de forma enganosa cor, textura, costura, formato ou partes do produto. Não gerar selos ou certificações. Não inventar detalhes invisíveis. Guardar status de aprovação e informações do job. Executar a IA no servidor, com limites de tamanho, timeout e controle de custo.

### Descrições com IA

Entrada: dados estruturados aprovados. Saída sugerida: título, descrição curta, descrição longa, bullets e meta description. Nunca inventar materiais, dimensões, densidade, certificados, prazo, garantia ou benefícios médicos. Resultado fica em revisão até aprovação humana.

### 3D

- Recurso de melhoria progressiva, não requisito para a primeira compra.
- Fazer prova de conceito com um único produto antes de escalar.
- Não presumir que 3–4 fotos bastam para fidelidade comercial.
- Revisar geometria, proporção, textura e cor.
- Preferir GLB/GLTF se suportado.
- Carregar sob demanda e manter imagem estática como fallback.
- Não prometer realidade aumentada até implementar e testar.

Tabela futura `ai_jobs`: `id`, `product_id`, `job_type`, `provider`, `status`, `input_path`, `output_path`, `cost_estimate`, `error_code`, `created_at`, `completed_at`, `approved_by`.

## 9. Responsividade, desempenho e acessibilidade

### Evitar layout shift

- Reservar width/height ou aspect-ratio para imagens.
- Definir dimensões para hero, cards e galerias.
- Reservar espaço para mensagens e conteúdo carregado dinamicamente.
- Usar fontes com fallback próximo.
- Evitar animações que causem reflow.
- Testar menus, filtros e elementos sticky em várias larguras.

### Imagens e 3D

- Usar `next/image` ou equivalente.
- Servir AVIF/WebP quando apropriado.
- Definir `sizes` responsivo.
- Lazy-load abaixo da dobra; priorizar imagem principal quando necessário.
- Não carregar 3D, vídeos pesados ou bibliotecas de visualização na primeira pintura.
- Criar miniaturas para listagem.

### Acessibilidade

- Navegação por teclado e foco visível.
- Labels associados aos campos.
- Alt text descritivo.
- Não comunicar estado apenas por cor.
- Respeitar `prefers-reduced-motion`.
- Contraste WCAG 2.2 AA.
- Carrosséis acessíveis, sem rotação automática.
- Erros claros e próximos dos campos.

### Metas de desempenho

Medir antes de prometer: LCP ideal ≤ 2,5 s; INP ≤ 200 ms; CLS ≤ 0,1. Testar rede móvel e aparelhos intermediários. Corrigir primeiro imagens grandes, JavaScript desnecessário e bloqueios de renderização.

## 10. Segurança, privacidade e LGPD

- Autenticação confiável; sem cadastro público de administradores.
- Autorização validada no servidor em todas as ações administrativas.
- RLS em tabelas expostas; políticas de Storage explícitas.
- Rate limiting em login, busca sensível e endpoints pagos de IA.
- Validar/sanitizar entradas e uploads.
- Segredos apenas em ambiente seguro.
- Logs sem tokens, senhas, dados de cartão ou dados pessoais desnecessários.
- HTTPS em produção.
- Backups e procedimento de restauração testados.
- Atualizar dependências e revisar vulnerabilidades.
- Política de privacidade, finalidade de coleta, minimização de dados e canal de contato.
- Cookies/analytics não essenciais devem respeitar consentimento e legislação aplicável.
- Não guardar dados brutos de cartão.

## 11. SEO e conteúdo

- URLs legíveis e estáveis.
- Títulos e meta descriptions únicos.
- Open Graph, sitemap, robots.txt e canonical.
- Schema.org Product e BreadcrumbList somente com dados reais.
- Preço e disponibilidade estruturados iguais aos exibidos.
- Alt text útil, sem keyword stuffing.
- Conteúdo educativo revisado sobre medidas, firmeza, cuidados e dúvidas frequentes.
- Evitar páginas automáticas vazias ou duplicadas.

## 12. Integrações e custos

### Pagamentos

Comparar provedores que operem no Brasil (por exemplo, Mercado Pago, Pagar.me ou Stripe quando adequado), considerando tarifas atuais, Pix, cartão, parcelamento, antifraude, prazo de recebimento, webhooks e suporte. Confirmar elegibilidade e custos diretamente nos sites oficiais.

### Frete

Avaliar Correios, Melhor Envio ou transportadora especializada conforme origem, dimensões, peso e cobertura. Colchões podem exigir logística volumosa. Não mostrar preço/prazo fictício.

### E-mail e analytics

Adicionar e-mail transacional após existir evento real de pedido. Configurar SPF, DKIM e DMARC. Analytics deve medir eventos úteis sem coletar dados pessoais além do necessário.

### Estratégia de custo

- Começar com o mínimo de serviços.
- Validar termos e preços atuais dos planos antes de contratar.
- Definir alertas de gasto para IA e infraestrutura.
- Não rodar IA em cada carregamento da página.
- Cachear resultados aprovados.
- Testar edição de imagem e 3D com um produto antes de processar o catálogo.
- Verificar termos de uso comercial do plano de hospedagem escolhido.

## 13. Plano de execução

### Etapa 0 — Preparação

- [ ] Confirmar naming provisório.
- [ ] Reunir três produtos reais, preços, fotos e especificações.
- [ ] Confirmar estoque, variações, garantia, entrega e devolução.
- [ ] Criar repositório privado.
- [ ] Criar projeto Supabase de desenvolvimento.
- [ ] Preparar variáveis locais.

### Etapa 1 — Fundação visual

- [ ] Inicializar Next.js + TypeScript.
- [ ] Configurar lint, typecheck e testes.
- [ ] Centralizar tokens e marca.
- [ ] Criar header, footer, botões, inputs, badges e cards.
- [ ] Criar estados de foco, erro, loading e vazio.
- [ ] Validar mobile e desktop.

### Etapa 2 — Catálogo

- [ ] Homepage.
- [ ] Listagem, busca, filtros e ordenação.
- [ ] Página de produto e galeria.
- [ ] SEO básico.
- [ ] Três produtos de demonstração em rascunho.
- [ ] Dados vindos de uma fonte consistente.

### Etapa 3 — Admin

- [ ] Login e autorização server-side.
- [ ] RLS e políticas de Storage.
- [ ] CRUD de produto.
- [ ] Upload e ordenação de mídia.
- [ ] Preview, status e validação.
- [ ] Testes de acesso não autorizado.

### Etapa 4 — Compra real

- [ ] Carrinho.
- [ ] Validação server-side de preço e estoque.
- [ ] Pagamento e frete reais.
- [ ] Criação de pedido e webhook verificado.
- [ ] E-mails transacionais.
- [ ] Testes de sucesso, falha e cancelamento.

### Etapa 5 — IA e 3D

- [ ] Endpoint seguro para imagens.
- [ ] Comparação original/resultado.
- [ ] Aprovação humana.
- [ ] Descrições a partir de dados aprovados.
- [ ] Prova de conceito 3D de um produto.
- [ ] Carregamento sob demanda e fallback.
- [ ] Medição de custo e desempenho.

### Etapa 6 — Lançamento

- [ ] Domínio e HTTPS.
- [ ] Políticas comerciais e privacidade revisadas.
- [ ] Testes mobile, teclado e leitor de tela.
- [ ] Pedido ponta a ponta.
- [ ] Backup/restauração e monitoramento.
- [ ] SEO, analytics, segurança e custos revisados.
- [ ] Plano de rollback de deploy.

## 14. Critérios de aceite

O MVP de catálogo/admin está pronto quando:

- [ ] Funciona a partir de 360 px até desktop sem sobreposições.
- [ ] Imagens e componentes não causam saltos relevantes de layout.
- [ ] Admin cria, edita, salva rascunho e publica produtos.
- [ ] Rascunhos não aparecem publicamente.
- [ ] Cada produto tem galeria, alt text, preço e especificações verificadas.
- [ ] Busca, filtros, ordenação e estados vazios funcionam.
- [ ] Rotas administrativas são inacessíveis sem autorização.
- [ ] RLS e uploads foram testados com usuário não autorizado.
- [ ] Segredos não estão no Git nem no bundle público.
- [ ] Erros de rede/formulário são compreensíveis.
- [ ] Navegação por teclado e foco visível funcionam.
- [ ] 3D não baixa até solicitação.
- [ ] Dados demonstrativos estão identificados e não são publicados por engano.
- [ ] README explica instalação, env, migrações, testes e deploy.

O checkout só está pronto após confirmação de pagamento no servidor, frete real, validação de estoque/preço, tratamento de falhas e testes ponta a ponta.

## 15. Variáveis de ambiente

Criar `.env.example` com nomes e valores vazios:

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_BRAND_NAME=Cuxões
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
IMAGE_AI_PROVIDER=
IMAGE_AI_API_KEY=
THREE_D_MODEL_PROVIDER=
THREE_D_MODEL_API_KEY=
PAYMENT_PROVIDER=
PAYMENT_SECRET_KEY=
PAYMENT_WEBHOOK_SECRET=
EMAIL_PROVIDER=
EMAIL_API_KEY=
```

`NEXT_PUBLIC_*` é público. Nunca usar esse prefixo para segredos. Não configurar chaves até a integração ser escolhida. Se um segredo for para o Git, revogar/rotacionar; apagar o commit não basta.

## 16. Prompt inicial para Claude Code, Codex ou agente equivalente

```
Você é um engenheiro de software sênior responsável por implementar o MVP descrito em SPEC-MVP-CUXOES.md.

Antes de codificar:
1. Inspecione o repositório e leia toda a especificação.
2. Apresente plano curto, dependências, riscos e decisões pendentes.
3. Não sobrescreva trabalho existente sem explicar.
4. Não invente credenciais, preços, avaliações, dimensões ou dados comerciais.

Stack preferencial: Next.js App Router, TypeScript, Tailwind CSS, Supabase para PostgreSQL/Auth, um único armazenamento de mídia, validação server-side e componentes acessíveis.

Identidade: tokens centralizados — #C4E0F5, #408AC2, #132940, #F6FAFC, #E8F2FA, #E8DBC9, #F5C7AD, #1F2B38, #5E707F. Tipografia Inter. Marca e slogan devem vir de configuração central.

Implemente por esta ordem:
1. Fundação visual e responsividade.
2. Homepage, catálogo, busca/filtros e página de produto.
3. Banco, migrações, autenticação e painel admin.
4. Upload de mídia e publicação controlada.
5. Testes, SEO, acessibilidade e documentação.
6. Só depois, carrinho/checkout, IA e 3D conforme as decisões comerciais.

Segurança:
- Nunca exponha segredos no frontend.
- Valide autorização no servidor e crie políticas RLS explícitas.
- Não confie em preço/estoque/role do navegador.
- Não crie admin por cadastro público.
- Valide uploads.
- Pagamentos futuros só podem ser confirmados por webhook verificado.
- Não implemente integração real sem provedor e credenciais configurados.

Dados:
Produtos de demonstração devem ficar em rascunho e ser claramente identificados. Não invente especificações. A IA só pode gerar sugestões com base em dados aprovados e precisa de revisão humana. Não simule integrações. O 3D deve carregar sob demanda e ter fallback estático.

Modo de trabalho:
- Faça alterações pequenas e explique decisões relevantes.
- Após cada etapa, rode lint, typecheck e testes disponíveis.
- Corrija erros antes de avançar.
- Versione migrações e mantenha .env.example sem segredos.
- Não adicione dependências sem necessidade.
- Não declare algo concluído sem testar.
- Se não puder executar um teste, informe exatamente qual e por quê.

Entrega: código, README de instalação/env/migrações/testes/deploy, checklist de segurança, integrações pendentes e resumo das decisões. Comece inspecionando o repositório; não comece por IA, 3D ou checkout.
```

## 17. Fontes de documentação para validação

- Next.js: https://nextjs.org/docs
- Supabase: https://supabase.com/docs
- Vercel: https://vercel.com/docs
- Cloudflare R2: https://developers.cloudflare.com/r2/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- ANPD / LGPD: https://www.gov.br/anpd/
- Schema.org Product: https://schema.org/Product
- Web Vitals: https://web.dev/articles/vitals

Preços, planos, limites e disponibilidade regional mudam; conferir documentação e valores oficiais antes de contratar.

## 18. Decisões pendentes

1. O nome Cuxões permanece como placeholder ou será trocado antes do lançamento?
2. O catálogo terá apenas colchões ou também bases, camas e acessórios?
3. O MVP precisa receber pagamentos reais desde o primeiro dia?
4. De onde sai o estoque e quais são as regras de entrega/devolução?
5. Quais provedores serão usados para pagamento, frete, imagem e 3D?
6. O 3D é obrigatório para o lançamento ou pode entrar na segunda fase?

**Recomendação:** começar com catálogo de alta qualidade e painel administrativo seguro; validar três produtos reais; testar IA e 3D em pequena escala; depois implementar compra real. Isso reduz retrabalho, controla custos e permite medir o valor real de cada recurso.

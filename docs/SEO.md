# SEO: como colocar a AzConfort no Google

Guia para o dono da loja, em passos. O site já faz a parte técnica sozinho; aqui está o que **só você** pode fazer
(contas do Google, textos e dados da empresa).

## 1. O que o site já faz sozinho

- **Trava até o lançamento (issue #17, versão corrigida na #31):** enquanto `INDEXING_ALLOWED` for `false` em
  `config/site.ts`, a loja fica fora do Google: `noindex, nofollow` no meta de todas as páginas e no cabeçalho
  `X-Robots-Tag`, sitemap só com o início e as páginas fixas, nenhum dado de produto (Product/Offer/ItemList). O
  `robots.txt` continua liberando a loja (sem `Disallow: /`), senão o Google não chega a ler o `noindex`. Ver a seção 8.
- **Mapa do site** em `https://www.azconfort.com.br/sitemap.xml` (com a trava aberta): página inicial, todos os
  produtos publicados (com as fotos de cada um e a data da última alteração), categorias com produto, guias
  publicados e as páginas de políticas e atendimento. Produto de demonstração, categoria vazia e `/entrega-parana`
  ficam de fora.
- **robots.txt** em `https://www.azconfort.com.br/robots.txt`: libera a loja e esconde painel, sacola, checkout,
  pedidos, conta e busca.
- **Endereço oficial (canonical)** em cada página, para o Google não achar que há páginas repetidas.
- **Título e resumo** de cada produto e categoria. Nas categorias colchões, sofás, poltronas, mesas e cadeiras, há um
  texto padrão (título, resumo, como escolher e 3 perguntas, em `content/categorias-seo.ts`) que vale até você
  escrever o seu no painel. O do painel sempre tem preferência.
- **Trilha de navegação** visível na categoria e no produto (Início › Categoria › Produto), com os mesmos dados para
  o Google (BreadcrumbList).
- **Foto do produto** quando alguém compartilha o link no WhatsApp, Instagram ou Facebook.
- **Dados para o Google** (schema.org): produto com preço, disponibilidade (só se o estoque for controlado), medidas,
  materiais, cores/tamanhos com o preço de cada um; trilha; lista de produtos nas categorias; dados da loja (com área
  atendida = Paraná) e a busca do site. Negócio local (LocalBusiness) só com endereço real em `config/brand.ts`.
- **Nada inventado**: avaliações, frete, prazo, política de devolução, CNPJ e contatos só aparecem quando existirem de
  verdade. Perguntas frequentes ficam só como texto (sem schema de FAQ).
- **Páginas vazias fora do Google**: categoria sem produto, catálogo vazio, `/guias` sem artigo e `/entrega-parana`
  ficam com `noindex`.
- **Endereço que não existe responde 404 de verdade**: produto, categoria ou guia inexistente recebe status 404 (o
  `proxy.ts` confere antes de a página começar a ser enviada).
- **Entrega no Paraná** em `/entrega-parana`, com a lista de cidades da issue #28 (`content/cidades-atendidas.ts`).
  Fica com `noindex` até a lista e o frete serem aprovados; o texto de frete é um TODO.
- **Guias de compra** em `/guias` (o "blog" da loja): 8 guias sobre tamanho do colchão, comprar colchão online no
  Paraná, medir a sala para o sofá, sofá de 2 ou 3 lugares, cuidado com estofados, poltrona, mesa de jantar e o 3D.
  Cada guia tem trilha, dados de artigo para o Google (Article) e links para a categoria e para os outros guias; a
  home e as categorias ligam aos guias. Textos em `content/guias/index.ts`.

## 2. Google Search Console (o mais importante)

É onde o Google mostra se a loja está aparecendo, para quais buscas e se há erros. Grátis.

1. Entre em <https://search.google.com/search-console> com a conta Google da loja.
2. Clique em **Adicionar propriedade** → escolha **Domínio** (a caixa da esquerda) → digite `azconfort.com.br` (sem
   `www` e sem `https`).
3. O Google mostra um código parecido com `google-site-verification=abc123...`. Clique em **Copiar**.
4. Em outra aba, entre no **Registro.br** (<https://registro.br>) → **Domínios** → `azconfort.com.br` → **DNS** →
   **Editar zona** (ou “Configurar zona DNS”).
   - Se o DNS do domínio estiver apontado para a Vercel (servidores `ns1.vercel-dns.com` etc.), o registro é criado na
     Vercel, não no Registro.br: na Vercel, **Domains** → `azconfort.com.br` → **DNS Records** → **Add**.
5. Crie um registro **TXT**:
   - Nome / Host: deixe em branco (ou `@`)
   - Valor / Dados: cole o código copiado no passo 3
   - Salve.
6. Volte ao Search Console e clique em **Verificar**. Pode levar de alguns minutos a algumas horas; se falhar, espere
   e tente de novo. **Não apague** esse registro TXT depois: ele mantém a verificação.

### Enviar o mapa do site

1. No Search Console, menu **Sitemaps**.
2. Em “Adicionar um novo sitemap”, digite `sitemap.xml` e clique em **Enviar**.
3. O status deve ficar **Sucesso**. O Google passa a voltar sozinho quando houver produto novo.

### O que acompanhar (uma vez por semana)

- **Desempenho**: buscas que trouxeram visitas (ex.: “poltrona azul linho”). Use essas palavras nas descrições.
- **Páginas**: páginas que o Google não indexou e por quê.
- **Listagens do comerciante** e **Snippets de produto** (em “Melhorias” / “Shopping”): erros nos dados de produto.
- **Core Web Vitals**: velocidade real medida nos celulares dos clientes.
- Para pedir que um produto novo apareça mais rápido: cole o endereço dele na barra de cima (**Inspecionar URL**) e
  clique em **Solicitar indexação**.

## 3. Textos que fazem diferença (no painel)

O Google recomenda texto próprio e útil. Escreva com as suas palavras, só com informação verdadeira.

- **Produto** (painel → Produtos → editar):
  - **Nome** claro, com o tipo e o diferencial: “Sofá 3 lugares retrátil em linho cinza”, não só “Sofá Milano”.
  - **Descrição curta** (vira o resumo do Google) e **descrição completa** (medidas, materiais, para que ambiente,
    cuidados).
  - **Medidas, materiais e tecido** preenchidos: vão para a página e para os dados do Google.
  - **Texto alternativo** de cada foto descrevendo o que aparece (“Sofá cinza visto de lado, com pés de madeira”).
  - **Título e descrição para o Google** (opcionais): use se quiser um texto diferente do nome/descrição curta.
- **Categoria** (painel → Categorias → “Texto da página e Google”): um texto curto ajudando a escolher (ex.: como
  medir a sala antes de comprar um sofá, diferença entre tecidos). Aparece abaixo dos produtos.
  - Esses campos dependem da atualização do banco (`supabase/migrations/20261120000100_categorias_seo.sql`). Até ela
    ser aplicada, o painel avisa e a loja usa o nome e a descrição da categoria.

Evite: copiar descrição de fabricante ou de outra loja, repetir a mesma frase em todos os produtos, e encher o texto de
palavras-chave.

## 4. Google Merchant Center (produtos grátis na aba Shopping)

Faz os produtos aparecerem na aba **Shopping** e no Google Imagens com preço. Grátis (anúncios pagos são opcionais).
Faça **depois** de ter CNPJ, contatos e políticas de entrega e troca revisadas, porque o Google exige isso.

1. Entre em <https://merchants.google.com> com a mesma conta do Search Console.
2. Informe o nome da loja e o site `https://www.azconfort.com.br`. Como o domínio já está verificado no Search
   Console, a verificação costuma ser automática.
3. Preencha **Informações da empresa**: endereço, telefone e e-mail de atendimento (os mesmos que forem colocados no
   site).
4. Em **Frete e devoluções**, cadastre as regras reais de frete e de troca (as mesmas das páginas de política).
5. Em **Produtos** → **Adicionar produtos** → escolha **Encontrar produtos automaticamente no seu site**. O Google lê
   os dados que o site já publica em cada página de produto.
6. Acompanhe em **Produtos** → **Diagnóstico** e corrija o que for apontado (geralmente foto, preço ou política).

## 5. Perfil da Empresa no Google (Google Maps)

Faça quando houver **CNPJ, endereço ou área de atendimento e telefone** de verdade.

1. Entre em <https://business.google.com> → **Adicionar empresa**.
2. Nome: `AzConfort`. Categoria: **Loja de móveis**.
3. Endereço: se não atende clientes no local, marque que **não tem loja física** e informe a **área de atendimento**
   (cidades/estados para onde entrega).
4. Telefone/WhatsApp e site `https://www.azconfort.com.br`.
5. Faça a verificação que o Google pedir (vídeo, ligação ou carta).
6. Adicione fotos reais dos produtos e o horário de atendimento.

## 6. Quando tiver CNPJ e contatos

Preencha em `config/brand.ts` (ou peça à IA): `contact.email`, `contact.whatsapp`, `contact.phone`, `contact.hours`,
`legal.companyName`, `legal.cnpj`, `legal.address` e as redes em `social`. O site passa a mostrar esses dados no
rodapé, no atendimento e nos dados para o Google automaticamente. Use exatamente os mesmos dados no Merchant Center e
no Perfil da Empresa.

## 7. Velocidade

Medido no build de produção local, celular emulado (Moto G4, 4G lento, processador 4× mais lento), com o catálogo de
demonstração: LCP ~0,85 s, CLS 0, INP ~40 ms — dentro do “bom” do Google (LCP até 2,5 s, CLS até 0,1, INP até
200 ms). O número que vale é o dos clientes reais: veja em **Search Console → Core Web Vitals** ou em
<https://pagespeed.web.dev> depois que a loja tiver visitas.

## 8. Lançamento: abrir para o Google

1. Tirar os produtos de demonstração do ar (issue #29) e publicar os produtos reais.
2. Em `config/site.ts`, trocar `INDEXING_ALLOWED = false` por `true` (ou ligar `ALLOW_INDEXING`, quando a issue #17
   trocar a constante pela variável) e publicar.
3. Abrir `https://www.azconfort.com.br/robots.txt`: deve aparecer a linha `Sitemap:`. Nas páginas, o `noindex` some.
4. Enviar o `sitemap.xml` no Search Console (seção 2).
5. `/entrega-parana` continua com `noindex` até a lista de cidades e o frete serem aprovados (issue #31, decisões 1 e 5).

## 9. Como testar

- **Status 404**: `curl -I https://www.azconfort.com.br/categorias/nao-existe` e
  `curl -I https://www.azconfort.com.br/produtos/nao-existe` devem responder `404`. `curl -I` de uma categoria que
  existe responde `200`.
- **Trava**: `curl -I https://www.azconfort.com.br/` mostra `X-Robots-Tag: noindex, nofollow` até o lançamento.
- **Dados para o Google**: <https://search.google.com/test/rich-results>. A prévia da Vercel é protegida, então copie o
  código-fonte da página e use a aba **Código**. Home: Organização e caixa de busca; categoria e produto: navegação
  estrutural. Produto com preço mostra Product/Offer só com a trava aberta. Alternativa: <https://validator.schema.org>.
- **Velocidade**: Chrome → F12 → **Lighthouse** → Celular, na home e numa página de produto. Antes do lançamento, o
  aviso "A página está bloqueada para indexação" é esperado.

## 10. Depois do lançamento: crescimento

O plano de crescimento (Perfil da Empresa no Google, avaliações reais de clientes, vídeos, presença local e links de
sites da região) fica com o az growth. O site já está pronto para ele: guias em `content/guias/index.ts`, perfis
sociais em `social` e endereço em `location` (`config/brand.ts`) entram sozinhos nos dados para o Google.

## Referências (Google Search Central)

- Dados de produto e listagens do comerciante: <https://developers.google.com/search/docs/appearance/structured-data/merchant-listing>
- Variações de produto (ProductGroup): <https://developers.google.com/search/docs/appearance/structured-data/product-variants>
- Sitemaps de imagem: <https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps>
- Trilha de navegação: <https://developers.google.com/search/docs/appearance/structured-data/breadcrumb>
- Core Web Vitals: <https://developers.google.com/search/docs/appearance/core-web-vitals>

# SEO: como colocar a AzConfort no Google

Guia para o dono da loja, em passos. O site já faz a parte técnica sozinho; aqui está o que **só você** pode fazer
(contas do Google, textos e dados da empresa).

## 1. O que o site já faz sozinho

- **Trava até o lançamento (issue #17):** enquanto `INDEXING_ALLOWED` for `false` em `config/site.ts`, a loja inteira
  fica fora do Google: `robots.txt` com `Disallow: /` (sem a linha do sitemap), `noindex, nofollow` em todas as
  páginas, sitemap só com o início e as páginas fixas e nenhum dado de produto (Product/Offer/ItemList). Ver a seção 8.
- **Arquitetura de endereços** (o que o Google lê como “mapa” da loja):
  - `/colchoes`, com `/colchoes/solteiro`, `/solteiro-king`, `/casal`, `/queen` e `/king` (calculados pelas
    variações de tamanho ou pelas medidas do cadastro);
  - `/estofados` (o atalho `/sofas` leva para lá), com `/estofados/sofa-2-lugares` e `/sofa-3-lugares` (pela
    especificação “Lugares” do cadastro ou pelo nome, ex.: “Sofá 3 lugares retrátil”);
  - `/moveis`, com uma subpágina por categoria do painel (ex.: `/moveis/cadeiras`);
  - a categoria do painel entra na seção pelo começo do endereço: `colch…` → colchões; `sofa…`, `estofad…`,
    `poltrona…`, `puf…` → estofados; o resto → móveis (regra em `lib/catalog/sections.ts`);
  - os endereços antigos `/categorias/<categoria>` redirecionam para os novos (308, permanente).
- **Páginas de entrega:** `/entrega` (todas as cidades atendidas com frete grátis, a mesma lista da regra de frete
  em `lib/shipping/served-cities.ts`) e páginas próprias para **Maringá** e **Londrina** (`/entrega/maringa`,
  `/entrega/londrina`), cada uma com texto exclusivo (textos em `content/cidades.ts`).
- **Mapa do site** em `https://www.azconfort.com.br/sitemap.xml` (com a trava aberta): página inicial, todos os
  produtos publicados (com fotos e data da última alteração), seções e subcategorias com produto, entrega e páginas
  de cidade, atendimento e políticas. Produto de demonstração e categoria vazia ficam de fora.
- **robots.txt** em `https://www.azconfort.com.br/robots.txt` (com a trava aberta): libera a loja e esconde painel,
  sacola, checkout, pedidos e busca.
- **Endereço oficial (canonical)** em cada página, para o Google não achar que há páginas repetidas (a página de
  produto ignora `?cor=` e `?tamanho=`).
- **Título, resumo, H1 e introdução próprios** em cada seção e subcategoria, com foco em Maringá e no Paraná, sem
  repetir palavra-chave (textos em `content/categorias.ts`; os testes barram texto repetido entre páginas). O título e
  o resumo escritos no painel para a categoria têm preferência.
- **Trilha de navegação** visível (Início › Móveis › Cadeiras e poltronas › Produto) e o mesmo caminho em dados para
  o Google (BreadcrumbList).
- **Foto do produto** quando alguém compartilha o link no WhatsApp, Instagram ou Facebook.
- **Dados para o Google** (schema.org): loja (OnlineStore, com área atendida = Paraná) e busca do site (WebSite com
  SearchAction) na página inicial; produto com preço, frete grátis para o Paraná (`shippingDetails`, valor 0, destino
  BR-PR), disponibilidade (só se o estoque for controlado), medidas, materiais, cores/tamanhos com o preço de cada um;
  lista de produtos nas categorias. **Negócio local (LocalBusiness)** só aparece quando o endereço real estiver em
  `config/brand.ts` (`location`).
- **Nada inventado**: avaliações, prazo de entrega, política de devolução, CNPJ, endereço e contatos só aparecem
  quando existirem de verdade. Produto de demonstração nunca tem dados para o Google e sempre sai com `noindex`.
- **Páginas vazias fora do Google**: seção ou subcategoria sem produto e catálogo vazio ficam com `noindex`.
- **Página não encontrada (404)** com busca e atalhos para as seções e a entrega.
- **Velocidade**: fotos pelo otimizador do Next (AVIF/WebP, tamanho certo para cada tela, só a primeira foto com
  prioridade, o resto sob demanda), fonte com `display: swap` e métricas de reserva, e o visualizador 3D baixado só
  quando o cliente pede (o arquivo .glb nunca vem antes; no celular com AR, a biblioteca chega depois da página
  carregada, para a câmera abrir no mesmo toque).

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

Para o **negócio local** (LocalBusiness, que ajuda no Google Maps e nas buscas “perto de mim”), preencha também
`location` com o endereço em partes: `streetAddress` (rua e número), `addressLocality` (cidade), `postalCode` (CEP) e
`addressRegion` (`PR`). Sem os quatro, nada é publicado.

## 7. Velocidade

Medido no build de produção local, celular emulado (Moto G4, 4G lento, processador 4× mais lento), com o catálogo de
demonstração: LCP ~0,85 s, CLS 0, INP ~40 ms — dentro do “bom” do Google (LCP até 2,5 s, CLS até 0,1, INP até
200 ms). O número que vale é o dos clientes reais: veja em **Search Console → Core Web Vitals** ou em
<https://pagespeed.web.dev> depois que a loja tiver visitas.

## 8. Lançamento (11/01/2027): abrir para o Google

1. Tirar os produtos de demonstração do ar (issue #29) e publicar os produtos reais.
2. Conferir se a issue #28 (frete grátis por CEP no checkout) está no ar: as páginas de entrega já dizem que o frete
   é grátis nas cidades atendidas.
3. Em `config/site.ts`, trocar `INDEXING_ALLOWED = false` por `true` (ou, se aprovada, ligar a variável
   `ALLOW_INDEXING` da issue #17) e publicar.
4. Abrir `https://www.azconfort.com.br/robots.txt`: deve aparecer `Allow: /` e a linha `Sitemap:`.
5. No Search Console, enviar o `sitemap.xml` (seção 2) e pedir indexação da página inicial, de `/colchoes`,
   `/estofados`, `/moveis`, `/entrega/maringa` e `/entrega/londrina`.

## 9. Como testar os dados para o Google e a velocidade

**Teste de resultados avançados (Rich Results Test)** — <https://search.google.com/test/rich-results>

- Depois do lançamento: cole o endereço de um produto com preço (ex.: `https://www.azconfort.com.br/produtos/...`).
  Devem aparecer **Snippets de produto** / **Listagens do comerciante** (com o frete grátis) e **Navegação estrutural**.
  Na página inicial: **Logotipo/Organização** e **Caixa de pesquisa** (WebSite). Em `/moveis/...` e
  `/entrega/maringa`: **Navegação estrutural**.
- Antes do lançamento (trava fechada, prévia protegida pela Vercel): o Google não consegue abrir a prévia. Abra a
  página no navegador, clique com o botão direito → **Exibir código-fonte**, copie tudo e use a aba **Código** do
  teste. Com a trava fechada, a página de produto mostra só a trilha (BreadcrumbList); Product/Offer aparecem com a
  trava aberta e produto com preço. Para conferir o formato sem a trava, use também <https://validator.schema.org>.
- O aviso “campo `deliveryTime` ausente” é esperado: a loja ainda não tem prazo de entrega e ele não é inventado.

**Lighthouse** (Chrome → F12 → aba **Lighthouse**, ou <https://pagespeed.web.dev> depois do lançamento)

1. Abra a prévia em uma janela anônima (sem extensões), modo **Celular**, categorias **Desempenho**, **SEO** e
   **Acessibilidade**.
2. Rode na página inicial e numa página de produto. Metas do Google: LCP até 2,5 s, CLS até 0,1, INP até 200 ms.
3. Antes do lançamento, o item de SEO “A página está bloqueada para indexação” é **esperado** (é a trava da #17).

## Referências (Google Search Central)

- Dados de produto e listagens do comerciante: <https://developers.google.com/search/docs/appearance/structured-data/merchant-listing>
- Variações de produto (ProductGroup): <https://developers.google.com/search/docs/appearance/structured-data/product-variants>
- Sitemaps de imagem: <https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps>
- Trilha de navegação: <https://developers.google.com/search/docs/appearance/structured-data/breadcrumb>
- Core Web Vitals: <https://developers.google.com/search/docs/appearance/core-web-vitals>
- Frete no produto (shippingDetails): <https://developers.google.com/search/docs/appearance/structured-data/merchant-listing#shipping-details>
- Negócio local: <https://developers.google.com/search/docs/appearance/structured-data/local-business>

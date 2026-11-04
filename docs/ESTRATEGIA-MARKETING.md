# Estratégia de crescimento — SEO, orgânico, tráfego pago e conversão

> Loja: multi-categoria (eletrônicos, moda, casa, esportes, livros, brinquedos, beleza) — posicionada como **"achadinhos com cara de loja séria"**.
> Marca recomendada: **Tcharan** (ver `NOMES-E-DOMINIOS.md`). Data: 04/11/2026.
> Legenda: ✅ já implementado no site · ☐ próximo passo (você faz) · 💰 custa dinheiro

---

## 0. Resumo executivo

**O problema:** o site anterior era uma vitrine sem motor — nenhuma forma real de comprar, zero SEO, zero rastreamento, sem WhatsApp, sem Pix/parcelamento, sem páginas legais e com um nome genérico. Ele não conseguiria nem ser aprovado no Google Merchant Center.

**O que mudou (direto no site):** SEO técnico completo, páginas de produto indexáveis, feed para Google Shopping, carrinho real com cupom + barra de frete grátis + Pix/parcelas, checkout pelo WhatsApp que já carrega a origem do tráfego (UTM), captura de leads com cupom, pixels prontos (GA4, Google Ads, Meta, TikTok), páginas legais (CDC/LGPD), 3 identidades de marca com logos.

**A estratégia em uma frase:** vencer no Brasil onde os marketplaces são fracos — **confiança + rapidez + atendimento humano** — e usar os termos que o brasileiro já digita ("achadinhos", "cupom", "frete grátis", "presente para…", "é confiável?") para atrair tráfego orgânico barato, enquanto o tráfego pago começa pequeno, com catálogo, e só escala com ROAS comprovado.

**Primeiros 30 dias (ordem):** domínio + redes → fotos reais dos produtos → gateway de pagamento → Search Console + Merchant Center + pixels → Instagram/TikTok 5x por semana + grupo VIP no WhatsApp → R$ 30–50/dia em Meta Advantage+ e Google Shopping.

---

## 1. Diagnóstico do site anterior → o que foi feito

| # | Problema encontrado | Impacto | Solução |
|---|---|---|---|
| 1 | Script de *challenge* da Cloudflare copiado junto com o HTML (iframe invisível chamando `/cdn-cgi/…` que não existe) | Erro 404 em toda visita, lixo no código, sinal de página "copiada" | ✅ Removido |
| 2 | Sem SEO: título "RoyalMarket - E-commerce", sem meta description, canonical, Open Graph, favicon, schema, sitemap ou robots | Invisível no Google; link feio no WhatsApp | ✅ Tudo implementado (seção 5) |
| 3 | Categorias e links com `href="#"` + `onclick` | Google não navega; usuário não consegue compartilhar | ✅ Links reais (`#categoria/…`, `p/<slug>.html`) |
| 4 | Carrinho em `alert()`, sem persistência, sem checkout | **Impossível vender** | ✅ Drawer com quantidade, cupom, totais, persistência e checkout (WhatsApp ou gateway) |
| 5 | Sem Pix, parcelamento ou regra de frete | Os 3 maiores gatilhos de compra do Brasil ausentes | ✅ Preço no Pix, "até 12x", barra de frete grátis progressiva |
| 6 | Avaliações e contagens inventadas ("1.234 avaliações", "2.567 produtos") | Risco jurídico (CDC/CONAR) e penalidade do Google por avaliação falsa | ✅ Campos reais, exibidos só quando > 0; schema de avaliação desligado até ter dados reais |
| 7 | Nenhum rastreamento (GA4/Meta/TikTok) | Impossível otimizar tráfego pago | ✅ Camada de eventos GA4 e-commerce + Meta + TikTok + GTM, com atribuição de UTM |
| 8 | Sem WhatsApp | Canal nº 1 de venda no Brasil ausente | ✅ Botão flutuante, no cabeçalho, no produto e no carrinho |
| 9 | Sem CNPJ, trocas, privacidade | Obrigatório pelo Decreto 7.962/2013 e LGPD; bloqueia Merchant Center | ✅ Rodapé com CNPJ + 3 páginas legais |
| 10 | Código frágil (`event.target` global, `© 2024`, emojis como imagem, sem `alt`, sem acessibilidade) | Bugs em alguns navegadores, baixa nota em Lighthouse | ✅ Reescrito; acessível (teclado, ARIA, foco), responsivo, lazy-loading |
| 11 | Nome genérico e disputado | Sem marca própria, sem domínio | ✅ 3 nomes com domínio livre + logos (`NOMES-E-DOMINIOS.md`) |

---

## 2. Posicionamento

**Promessa:** *preço de marketplace com a segurança de uma loja de verdade — e o pacote chega rápido.*

Por que isso funciona (dados reais do Autocomplete do Google, 04/11/2026 — `docs/pesquisa/`):
- As pessoas perguntam **"é confiável comprar na temu / no tiktok shop / na aliexpress / na shopee"**. Confiança é a dúvida nº 1 — nota fiscal, CNPJ, troca em 7 dias e atendimento humano são o seu diferencial contra os asiáticos.
- **"achadinhos da shopee para casa / cozinha / quarto"**, **"comprinhas de autocuidado / para casa"**, **"produtos virais tiktok 2026"**: o brasileiro busca *curadoria* — a loja deve se apresentar como quem garimpa por ele.
- **"frete grátis"** aparece colado a todo marketplace, e 3 em cada 4 brasileiros desistem por causa do frete — por isso a barra de frete grátis é o primeiro elemento que o usuário vê.
- **"cupom mercado livre / amazon / shopee"**: cupom é hábito. O cupom de boas-vindas + grupo VIP capturam o lead antes da compra.

**Persona principal:** mulher 25–44, classe B/C, mobile-first, compra pelo Instagram/TikTok/WhatsApp, compara preço, quer entrega rápida e ter com quem falar. Secundária: homem 25–40 comprando eletrônicos/esporte/presente.

**Tom:** divertido, direto, brasileiro ("tcharan!", "é de boa"), nunca infoprodutor.

---

## 3. O que o Brasil está buscando (pesquisa)

### 3.1 Produtos mais desejados no Google Brasil (lista oficial do Google, 2025)
Labubu (nº 1), Poco X7 Pro, livros de colorir Bobbie Goods, iPhones, tênis de corrida, **perfumes árabes**, jogos de tabuleiro, patinetes e bicicletas elétricas, creatina, ar-condicionado, cadeira de praia. Tendência apontada pelo Google: "descanso do digital" (hobbies analógicos) + mobilidade + beleza.

→ **Ação:** mantenha no catálogo pelo menos 1 item de cada "febre" acessível: perfume árabe, livro de colorir, jogo de tabuleiro, acessórios de corrida, pelúcia/colecionável (capivara de pelúcia aparece no autocomplete!), air fryer, fone bluetooth, smartwatch.

### 3.2 Quem domina a audiência (Conversion, relatório out/2025)
Mercado Livre 14,2% · Shopee 10,7% · Amazon 8,4% · Temu, Magalu, Shein, AliExpress completam o topo; **as 10 maiores lojas concentram ~58% de todo o tráfego**. TikTok Shop (lançado em mai/2025) já responde por ~6,5% das finalizações de compra online e estima-se R$ 5,3 bi de GMV no 1º semestre de 2026.

→ **Ação:** não brigue por "comprar celular" contra eles. Brigue por **cauda longa + confiança + comunidade** e esteja **dentro** dos canais que crescem (TikTok Shop, Instagram Shopping, grupos de WhatsApp/Telegram de achadinhos).

### 3.3 Termos de vantagem
Ordem de relevância de busca (estudo Google/Conversion): **promoção > frete grátis > cupom > desconto**. "Cupom" tem menos concorrência em anúncios (CPC menor).

### 3.4 Clusters do Autocomplete (o que as pessoas realmente digitam)

| Cluster | Exemplos reais | Uso |
|---|---|---|
| Curadoria | achadinhos da shopee (para casa, cozinha, quarto), achadinhos do momento, comprinhas (shopee, shein, autocuidado, para casa), produtos virais tiktok/shopee 2026, produtos mais vendidos na shopee 2026, queridinhos | nome de seções, chips de filtro, reels, grupo VIP |
| Confiança | é confiável comprar na temu / tiktok shop / aliexpress / shopee, loja confiável para comprar iphone, site confiável reclame aqui | FAQ "A loja é confiável?", página Sobre, selo CNPJ/NF, conteúdo "bastidores" |
| Vantagem | cupom (mercado livre, amazon, shopee, magalu, netshoes), frete grátis + marketplace, desconto, ofertas do dia, promoção de celular | cupom de boas-vindas, topbar, campanhas de busca "cupom + categoria" |
| Presentes | presente para namorado (gamer, criativo, personalizado, 1 ano de namoro), presente para namorada (barato, simples, ideias), presente para mãe, presente barato para mulher/homem, ideias de presente dia dos pais/professores/crianças | guias de presente (blog), coleções sazonais, anúncios de Search |
| Produto | fone de ouvido bluetooth/jbl, air fryer (mondial, wap, philco), tênis nike feminino, celular samsung/xiaomi/motorola barato, smartphone barato e bom 2026, relógio masculino/smartwatch, bicicleta elétrica/aro 29, brinquedo para criança de 1/2 anos, brinquedos educativos, perfume árabe masculino/feminino, mochila | títulos de produto, páginas de categoria, Shopping |
| Formato/ocasião | loja de tudo 10 reais, black friday (é quando, data), decoração de natal 2026, dia das mães 2026 | seção "até R$ 100", calendário sazonal |

---

## 4. Mapa de palavras-chave por intenção

| Intenção | Termos-alvo (pt-BR) | Onde ranquear | Canal |
|---|---|---|---|
| Marca | tcharan, tcharan loja, tcharan é confiável, tcharan cupom | Home, Sobre, FAQ | SEO + Search (marca, barato) |
| Curadoria/descoberta | achadinhos para casa, achadinhos até 100 reais, produtos virais 2026, queridinhos da internet | Chips "Achadinhos" e "Até R$ 100", posts/guias | SEO + Reels/TikTok + Pinterest |
| Presente (alta conversão) | presente para namorado gamer, presente criativo para amiga, presente barato para homem, ideias de presente dia dos pais 2027 | Guias de presente (1 página por ocasião/pessoa) | SEO + Search + Pinterest |
| Produto específico | air fryer 4l digital, fone bluetooth cancelamento de ruído, smartwatch com gps, perfume árabe masculino 100ml | `p/<slug>.html` (título = termo + diferencial) | Shopping + SEO |
| Vantagem | cupom tcharan, frete grátis eletrônicos, pix com desconto | Página de cupons/ofertas, topbar | SEO + Search |
| Confiança | tcharan é confiável, tcharan reclame aqui | Sobre + Reclame Aqui + Google Perfil da Empresa | SEO |

Regra de título de produto (SEO + Shopping): **Produto + característica-chave + marca/variação** → "Air Fryer Digital 4L Antiaderente 8 Programas 110V". Regra de descrição: benefício → prova → objeção (prazo, garantia, troca).

---

## 5. SEO (o "DIO")

### 5.1 Técnico — ✅ implementado
- `<title>` e `meta description` únicos (home, produto, institucionais), `canonical`, `robots` (index, follow, image-preview large), `lang="pt-BR"`, `theme-color`, favicon SVG + PNG, `site.webmanifest` (PWA instalável).
- Open Graph + Twitter Card com imagem 1200×630 gerada por marca (`branding/og/`) → links bonitos no WhatsApp/Instagram.
- Dados estruturados (JSON-LD): `OnlineStore` (Organization), `WebSite` + `SearchAction` (caixa de busca nos resultados), `ItemList` de `Product` com `Offer` (preço, estoque, política de devolução, frete), `FAQPage` (rich result de perguntas), `BreadcrumbList`; `Product` + `BreadcrumbList` em cada página de produto.
- **Páginas de produto estáticas** (`p/<slug>.html`) — 1 URL indexável por produto, com `priceValidUntil`, relacionados e FAQ.
- `sitemap.xml` (home, institucionais, produtos) e `robots.txt` apontando o sitemap. Nada bloqueado (o Google precisa do JS/CSS).
- Performance: sem frameworks, CSS único, fontes com `display=swap`, imagens `loading="lazy"`, HTML semântico, acessível (skip link, labels, ARIA, teclado). Meta: Lighthouse ≥ 90 em mobile.
- Hash-routes (`#categoria/…`, `#busca/…`, `#produto/…`) para UX; URLs reais para SEO.

### 5.2 On-page — ☐ você mantém
- Um H1 por página com o termo principal (home: "Achadinhos, eletrônicos e presentes com até 50% OFF").
- Fotos reais com `alt` descritivo ("air fryer digital 4L preta na bancada"). **Fotos são o maior salto de conversão possível hoje** — emoji é placeholder.
- Descrições de 60–120 palavras, únicas (nunca copie do fornecedor — conteúdo duplicado não ranqueia).
- Links internos: cada produto linka 4 relacionados (✅ automático) e cada guia linka produtos.

### 5.3 Conteúdo (SEO de cauda longa) — ☐ 1 guia por semana
Crie `guias/<slug>.html` (mesmo visual das páginas institucionais) para termos de presente/curadoria:
1. "Presente para namorado gamer: 15 ideias de R$ 50 a R$ 300"
2. "Presente criativo para amiga (que ela vai usar de verdade)"
3. "Achadinhos para casa até R$ 100 que valem a pena em 2026"
4. "Air fryer: qual tamanho comprar para 2, 4 ou 6 pessoas"
5. "Fone bluetooth barato e bom: como escolher (ANC, bateria, microfone)"
6. "Smartwatch com GPS: vale a pena? 5 modelos até R$ 300"
7. "Perfume árabe masculino: os 7 mais pedidos e por quê"
8. "Presente para mãe de primeira viagem"
9. "Brinquedo para criança de 1 ano: o que desenvolve (e o que evitar)"
10. "Como saber se uma loja online é confiável (checklist)" — ranqueia a dúvida nº 1 e vende a sua credibilidade
11. "Dia das Mães 2027: presentes por perfil (prática, vaidosa, caseira…)"
12. "Black Friday 2026: como não cair em desconto falso"
Cada guia: 800–1.500 palavras, FAQ no fim (schema), 6–10 produtos linkados, imagem própria.

### 5.4 Google de graça — ☐ semana 1
- **Search Console**: verificar domínio, enviar `sitemap.xml`, acompanhar "Desempenho" por consulta.
- **Merchant Center**: cadastrar a loja, enviar `feed/produtos.xml` (feed programado, diário). Ativa as **listagens gratuitas** na aba Shopping — tráfego de produto sem pagar clique. Exige: política de devolução, contato, CNPJ, SSL (✅ já no site) e preços idênticos ao site (✅ página estática).
- **Perfil da Empresa (Google Business Profile)**: mesmo sendo só online, crie como "empresa de serviço" — aparece no mapa/"perto de mim" e coleta avaliações.
- **Google Analytics 4**: cole o ID em `config.js` → eventos de e-commerce já disparam (`view_item_list`, `select_item`, `view_item`, `add_to_cart`, `view_cart`, `begin_checkout`, `generate_lead`, `search`, `add_to_wishlist`, `select_promotion`).

### 5.5 Avaliações (só reais) — ☐ a partir da 1ª venda
Peça avaliação por WhatsApp 3 dias após a entrega (com link do Google Perfil). Quando tiver ≥ 5 avaliações reais por produto, preencha `avaliacao/avaliacoes` em `produtos.js` e ative `incluirAvaliacoesNoSchema: true` para as estrelas aparecerem no Google. Cadastre-se no Reclame Aqui antes que alguém reclame — e responda tudo em < 24h.

### 5.6 Links e menções — ☐ mês 2+
- Cadastrar cupom em Cuponomia, Méliuz, Pelando e Promobit (tráfego + link).
- Parcerias com perfis de "achadinhos" (micro-influencers de 5–50k seguidores) com cupom próprio (`ACHADINHOSDAANA`) — rastreável no carrinho (`select_promotion`).
- Guest post / entrevista em blogs de maternidade, casa, games conforme a categoria.

---

## 6. Orgânico nas redes (o motor de descoberta)

### 6.1 Pilares de conteúdo (Instagram Reels + TikTok + YouTube Shorts, mesmo vídeo nos 3)
| Pilar | Formato | Frequência |
|---|---|---|
| **Tcharan! (unboxing)** | pacote chegando, cliente abrindo, reveal em 3 s com o bordão | 2x/semana |
| **Achadinhos até R$ 100** | 3 produtos, preço na tela, "link na bio" | 2x/semana |
| **É confiável? (bastidores)** | separando pedido, emitindo nota, embalando, respondendo cliente | 1x/semana |
| **Comparativo/teste** | air fryer vs forno, fone de R$ 150 vs R$ 1.000 | 1x/semana |
| **Guia de presente** | "presente pra namorado gamer por menos de R$ 200" | 1x/semana, mais perto de datas |
| **Stories diários** | enquete "qual você levaria?", caixinha de perguntas, prova social (prints com autorização), cupom relâmpago | todo dia |

Regras: vertical 9:16, legenda queimada (80% assistem sem som), preço e "frete grátis" na tela, CTA "comenta ACHEI que eu te mando o link", responder todo comentário em 1 h nas primeiras 2 h do post.

### 6.2 Hooks magnéticos (primeiros 3 segundos — tema: achadinhos da loja)

🧲 hooks magnéticos: achadinhos e ofertas da loja

🎯 ATRAÇÃO — parar o scroll
1. esse achadinho de r$ 39 tá fazendo mais sucesso que produto de r$ 400
2. o pacote chegou e ninguém acreditou no que tinha dentro
3. 3 coisas pra casa que você não sabia que precisava (até ver)
4. parei de comprar na shopee depois que descobri isso
5. o produto mais vendido da loja essa semana custa menos que um lanche

👑 AUTORIDADE — posicionar como referência
1. testei 7 air fryers pra você não comprar a errada
2. como eu garimpo achadinho que vale a pena (e os que eu descarto)
3. fone de r$ 150 vs r$ 1.000: a diferença que ninguém te conta
4. é assim que a gente confere cada pedido antes de enviar
5. o checklist que eu uso pra saber se um produto é bom antes de colocar na loja

💛 CONEXÃO — criar identificação
1. se você já ficou 20 minutos no carrinho sem coragem de fechar, esse vídeo é pra você
2. aquele presente que você compra pra outra pessoa e quer ficar pra você
3. comprei "só pra ver" e agora uso todo dia
4. pra quem cansou de pedido que chega depois de 40 dias
5. você também guarda a caixa do produto "por via das dúvidas"?

💰 VENDA — direcionar para ação
1. frete grátis acima de r$ 199 e 5% off no pix: a conta fecha sozinha
2. últimas 3 unidades — quando acabar, só mês que vem
3. comenta ACHEI que eu te mando o cupom de 10% no privado
4. o kit de presente pronto que resolve seu problema de hoje à noite
5. entra no grupo vip antes da black friday: as ofertas saem lá primeiro

### 6.3 Grupo VIP (WhatsApp/Telegram) — o ativo mais valioso
O autocomplete mostra "achadinhos da shopee grupo whatsapp / telegram" — as pessoas **procuram** grupos de achadinhos. Crie o seu:
- Comunidade no WhatsApp (só admin posta) + canal no Telegram espelho.
- Entrada pelo cupom de boas-vindas (✅ formulário do site e pop-up), pela bio e por Stories.
- Cadência: 1 oferta/dia útil às 12h e 19h30, 1 "oferta só do grupo" por semana, enquete toda sexta.
- Meta: 1.000 membros em 90 dias. Cada envio para 1.000 pessoas com 2% de conversão e ticket R$ 150 = R$ 3.000.

### 6.4 Outros canais
- **Pinterest**: pins dos guias de presente e achadinhos para casa (tráfego de longo prazo, ótimo para "ideias de presente"). 5 pins/semana.
- **TikTok Shop / Instagram Shopping / Kwai Shop**: cadastre o catálogo (mesmo feed) e ative o Shop — vende dentro do app e aproveita afiliados.
- **Afiliados**: programa simples (cupom + 10% de comissão por venda via WhatsApp/planilha; depois ferramentas como Lomadee/Monetizze). Criadores de achadinhos vivem disso.

---

## 7. Tráfego pago (começa pequeno, escala com dado)

### 7.1 Antes de gastar R$ 1 — ☐
1. Fotos reais em todos os produtos; 2. gateway de pagamento no `checkoutUrl` (Pix automático converte mais que WhatsApp); 3. pixels no `config.js` + evento `purchase` no agradecimento do gateway; 4. feed no Merchant Center e no Gerenciador de Comércio da Meta; 5. padrão de UTM (abaixo).

**Padrão de UTM** (o site salva e envia no pedido do WhatsApp — você sabe de onde veio cada venda mesmo sem gateway):
`?utm_source=instagram&utm_medium=cpc&utm_campaign=achadinhos-casa&utm_content=video-airfryer` · orgânico: `utm_medium=social`, grupo VIP: `utm_source=whatsapp&utm_medium=vip`.

### 7.2 Fase 1 — validação (dias 1–30, 💰 R$ 30–50/dia)
| Canal | Campanha | Público | Criativo | Meta |
|---|---|---|---|---|
| Meta (Instagram/Facebook) | Advantage+ Shopping com catálogo | Brasil, 22–55, deixa o algoritmo achar | 3 vídeos (unboxing "tcharan!", achadinhos até R$ 100, comparativo) + carrossel de catálogo | ROAS ≥ 2,5 |
| Google | Performance Max com feed (Shopping) | — | Imagens + títulos do feed | ROAS ≥ 3 |
| Google | Search "cupom"/"presente" exato | palavras do mapa (seção 4) | anúncio com preço, Pix e frete grátis | CPC < R$ 1,50 |

### 7.3 Fase 2 — escala (dias 31–90, 💰 R$ 100–300/dia conforme ROAS)
- **Remarketing em camadas**: visitou (7 d) → viu produto (14 d) → carrinho (30 d), criativos de prova social + cupom. Meta e Google (lista do pixel) e TikTok.
- **Lookalike** dos leads do grupo VIP e compradores (exporte a planilha de leads).
- **TikTok Spark Ads** impulsionando os vídeos orgânicos que já performaram (nunca criativo "de anúncio").
- **Google Search por produto** apenas para os 10 itens de maior margem.
- Regra de ouro: escale 20% por dia o conjunto que mantém ROAS; corte em 3 dias o que não entrega.

### 7.4 KPIs e benchmarks (Brasil, loja pequena)
CTR vídeo ≥ 1,5% · CPC ≤ R$ 1,50 · taxa de adição ao carrinho 8–12% · conversão 1–2% (3–5% em remarketing) · CPA ≤ 25% do ticket · ROAS ≥ 3 · ticket médio alvo R$ 150–250 (o limite de frete grátis de R$ 199 empurra o ticket para cima).

---

## 8. Conversão (CRO) — o que já está no site e o que falta

✅ Barra de anúncio rotativa (frete grátis, Pix, cupom) · ✅ selos de confiança acima da dobra · ✅ oferta relâmpago com contagem regressiva (reseta diariamente, `ofertaRelampago.terminaAs`) · ✅ preço no Pix em verde + parcelas em cada card · ✅ "-X%" e "restam só N" (só com estoque real ≤ 5) · ✅ barra "faltam R$ X para frete grátis" · ✅ cupom no carrinho · ✅ "Comprar agora" (vai direto ao carrinho) · ✅ modal rápido de produto + página completa · ✅ busca com sugestões (buscas populares vindas do autocomplete) · ✅ favoritos · ✅ FAQ com as objeções reais (prazo, pagamento, troca, confiança, frete) · ✅ pop-up de cupom por intenção de saída/25 s (1x a cada 3 dias, nunca para quem já é lead) · ✅ WhatsApp em todos os pontos de dúvida · ✅ mobile-first (grade 2 colunas, botões grandes).

☐ Próximos ganhos, em ordem de impacto: **fotos reais** (+30–100% de conversão) → gateway com Pix automático e cartão → cálculo de frete por CEP (Melhor Envio/Frenet API) → avaliações reais com foto → kits e combos ("leve 2, ganhe frete") → cross-sell no carrinho → recuperação de carrinho (seção 9).

Matemática do frete grátis: ticket médio atual × 1,3 ≈ limite ideal. Com ticket de R$ 150, R$ 199 está certo; se o ticket subir para R$ 230, suba para R$ 299.

---

## 9. Retenção — WhatsApp e e-mail (onde está o lucro)

| Fluxo | Quando | Mensagem | Ferramenta |
|---|---|---|---|
| Boas-vindas | ao entrar no grupo/lead | cupom + 3 achadinhos + como funciona a loja | WhatsApp Business (grátis) → ManyChat/Z-API quando escalar |
| Carrinho abandonado | 1 h e 24 h após `begin_checkout` sem compra | "ficou alguma dúvida?" + link + cupom se > 24 h | manual (lista do dia) → automação |
| Pós-venda | pagamento confirmado / enviado / entregue | NF + rastreio + "qualquer coisa, estou aqui" | WhatsApp Business + gateway |
| Avaliação | 3 dias após entrega | pedir foto/avaliação no Google (brinde: cupom de R$ 10) | WhatsApp |
| Recompra | 30/60 dias | produto complementar da categoria comprada | lista de transmissão / Brevo |
| Datas | aniversário, Dia das Mães, Black Friday | acesso antecipado para o grupo VIP | grupo |

Métrica-guia: **% da receita vinda de clientes recorrentes** — meta 25% em 6 meses. Cliente recorrente custa 5x menos que aquisição paga.

---

## 10. Métricas e rotina

**Dashboard GA4 (eventos já enviados pelo site):** sessões por origem (UTM) → `view_item` → `add_to_cart` → `begin_checkout` → compra (gateway) → `generate_lead`. Acompanhe por semana: taxa de carrinho, taxa de checkout, CPA, ROAS, ticket, % recorrente, membros do grupo, seguidores.

**Rotina:**
- Diário (20 min): responder WhatsApp/comentários, postar story, publicar oferta no grupo, checar anúncios.
- Semanal (2 h): 5 vídeos gravados em lote, 1 guia SEO, revisar ROAS por conjunto, atualizar `produtos.js` (estoque/preço) e rodar `npm run feed`.
- Mensal: Search Console (quais termos crescem → novos guias), reprecificar, renegociar frete, novos produtos das listas "mais desejados"/"virais".

---

## 11. Calendário

### Próximos 90 dias (a partir de 04/11/2026)
| Semana | Foco |
|---|---|
| 1 | Registrar domínio e @ nas redes (`NOMES-E-DOMINIOS.md`), publicar o site (GitHub Pages/Vercel), WhatsApp Business, fotos dos 12 primeiros produtos |
| 2 | Gateway + Pix, Search Console, GA4 + pixels, Merchant Center (listagens gratuitas), Perfil da Empresa, Reclame Aqui |
| 3 | 10 vídeos gravados (pilares), grupo VIP aberto, cupom em Cuponomia/Méliuz, 1º guia de presente (Natal) |
| 4 | Ligar Meta Advantage+ (R$ 30/dia) e PMax (R$ 20/dia); **Black Friday 27/11**: oferta relâmpago diária, grupo VIP com acesso antecipado, cupom BF |
| 5–7 | Natal: guias "presente para…", kits prontos, prazo de entrega visível ("compre até dia X"); remarketing ligado |
| 8–9 | Janeiro: "saldão", volta às aulas (mochila, papelaria, eletrônicos), 1 guia/semana, avaliar ROAS e escalar o que funciona |
| 10–13 | Carnaval (9/2/2027) e **Dia do Consumidor (15/3/2027)** — "a Black Friday do 1º semestre"; TikTok Shop + afiliados; meta de 1.000 membros no grupo |

### Datas que vendem (2026–2027)
Black Friday 27/11/2026 · Cyber Monday 30/11/2026 · Natal (último dia de envio ~15/12) · Saldão de janeiro · Volta às aulas (jan–fev) · Carnaval 9/2/2027 · Dia do Consumidor 15/3/2027 · Dia das Mães 9/5/2027 · Dia dos Namorados 12/6/2027 · Dia dos Pais 8/8/2027 · Dia do Cliente 15/9 · Dia das Crianças 12/10 · Black Friday 26/11/2027.

---

## 12. Checklist de lançamento
☐ domínio `.com.br` + `.com` registrados · ☐ @ iguais em Instagram/TikTok/YouTube/Pinterest · ☐ `config.js` preenchido (WhatsApp, CNPJ, e-mail, domínio) · ☐ títulos estáticos do `<head>` com o nome final · ☐ fotos reais + descrições próprias · ☐ `npm run feed` · ☐ publicado com HTTPS · ☐ Search Console + sitemap · ☐ GA4 + Meta Pixel + TikTok Pixel · ☐ Merchant Center + feed · ☐ Perfil da Empresa no Google · ☐ WhatsApp Business com catálogo e mensagens automáticas · ☐ gateway de pagamento · ☐ frete (Melhor Envio) · ☐ Reclame Aqui cadastrado · ☐ grupo VIP criado · ☐ 10 vídeos no banco · ☐ cupom em Cuponomia/Méliuz · ☐ anúncios da Fase 1.

---

## Fontes
- Google Brasil — "Os 50 produtos mais desejados do ano (2025)": [Consumidor Moderno](https://consumidormoderno.com.br/50-produtos-mais-buscados-no-google/), [Propmark](https://propmark.com.br/google-revela-os-50-produtos-mais-desejados-do-ano/), [Diário do Comércio](https://dcomercio.com.br/publicacao/s/os-50-produtos-mais-desejados-pelos-brasileiros-segundo-o-google)
- Google — [As Buscas do Ano 2025 no Brasil](https://blog.google/intl/pt-br/produtos/as-buscas-do-ano-o-que-os-brasileiros-mais-pesquisaram-no-google-em-2025/)
- Conversion — [Relatório Setores do E-commerce no Brasil, nov/2025 (dados de out/2025)](https://www.conversion.com.br/wp-content/uploads/2025/11/Novembro-25-Relatorio-Setores-do-E-commerce-no-Brasil.pdf) e [Ranking de e-commerces](https://www.conversion.com.br/blog/ranking-ecommerces); Mercado&Consumo — [cinco dos 10 maiores e-commerces são asiáticos / concentração de audiência](https://mercadoeconsumo.com.br/26/02/2025/ecommerce/cinco-dos-10-maiores-e-commerces-do-brasil-sao-asiaticos/)
- TikTok Shop no Brasil — [Momentum Works, H1 2026](https://momentum.asia/insights/detail/tiktok-shop-in-brazil-h1-2026), [Mercado&Consumo](https://mercadoeconsumo.com.br/07/06/2025/mc-internacional/with-shop-and-search-ads-tiktok-becomes-a-shopping-destination-in-brazil/), [V4 Company](https://v4company.com/blog/marketing-digital/tiktok-shop)
- ABComm — [R$ 100,5 bi no 1º semestre de 2025](https://mercadoeconsumo.com.br/22/08/2025/ecommerce/e-commerce-brasileiro-movimenta-r-1005-bilhoes-no-1o-semestre/amp/), [projeções 2026 / 100 milhões de compradores](https://centraldovarejo.com.br/mais-de-100-milhoes-de-pessoas-devem-comprar-no-e-commerce-no-brasil-ate-2026/), [tendências 2026](https://centraldovarejo.com.br/tendencias-para-o-e-commerce-em-2026/)
- Google — Black Friday 2025: [60% pretendem comprar](https://mais.opovo.com.br/jornal/farol/2025/08/29/black-friday-2025-seis-em-cada-dez-brasileiros-querem-comprar-diz-google.html), [40% vão gastar mais](https://www.tribunadosertao.com.br/economia/2025/11/06/814011-google-40-dos-brasileiros-pretendem-gastar-mais-na-black-friday-de-2025-em-relacao-ao-ano-passado)
- Frete — [75% desistem da compra por causa do frete (O Povo)](https://www.opovo.com.br/noticias/economia/2023/02/14/amp/valor-do-frete-faz-75-dos-brasileiros-desistirem-de-compras-online.html)
- Termos de vantagem — [Conversion: palavras mais buscadas](https://www.conversion.com.br/blog/palavras-mais-buscadas)
- Autocomplete do Google Brasil (coleta própria, 04/11/2026) — `docs/pesquisa/autocomplete-google-br.md`

/* =====================================================================
   CATÁLOGO — DADOS DE EXEMPLO. Substitua pelos seus produtos reais.
   Campos:
     id, slug (URL), titulo, descricao (SEO: 1-2 frases com benefício),
     preco, precoAntigo, categoria, imagem (URL da foto real; se vazio usa o emoji),
     emoji, estoque, vendidos (número REAL de vendas — não invente), tags,
     marca, sku, destaque (true = aparece na oferta relâmpago),
     avaliacao / avaliacoes: deixe 0 até ter avaliações reais.
   ===================================================================== */
window.CATEGORIAS = [
  { slug: "eletronicos", nome: "Eletrônicos", emoji: "📱", descricao: "Celulares, fones, notebooks e gadgets" },
  { slug: "moda",        nome: "Moda",        emoji: "👟", descricao: "Tênis, roupas e acessórios" },
  { slug: "casa",        nome: "Casa e Cozinha", emoji: "🏠", descricao: "Utilidades, decoração e eletroportáteis" },
  { slug: "esportes",    nome: "Esportes",    emoji: "⚽", descricao: "Bikes, fitness e lazer" },
  { slug: "livros",      nome: "Livros",      emoji: "📚", descricao: "Bestsellers e lançamentos" },
  { slug: "brinquedos",  nome: "Brinquedos",  emoji: "🧸", descricao: "Diversão para todas as idades" },
  { slug: "beleza",      nome: "Beleza",      emoji: "✨", descricao: "Perfumes e autocuidado" }
];

window.PRODUTOS = [
  { id: 1, slug: "smartphone-galaxy-s24-256gb", titulo: "Smartphone Samsung Galaxy S24 256GB", descricao: "Tela AMOLED 6.2\", câmera com IA e bateria para o dia todo. Nota fiscal e garantia de 1 ano.", preco: 2499.90, precoAntigo: 2999.90, categoria: "eletronicos", emoji: "📱", imagem: "", estoque: 7, vendidos: 0, tags: ["celular", "samsung", "android"], marca: "Samsung", sku: "SM-S24-256", destaque: true, avaliacao: 0, avaliacoes: 0 },
  { id: 2, slug: "notebook-dell-inspiron-15", titulo: "Notebook Dell Inspiron 15 i5 16GB 512GB SSD", descricao: "Leve, rápido e com SSD: abre tudo em segundos. Ideal para trabalho, estudo e home office.", preco: 3299.90, precoAntigo: 3799.90, categoria: "eletronicos", emoji: "💻", imagem: "", estoque: 4, vendidos: 0, tags: ["notebook", "dell", "home office"], marca: "Dell", sku: "DL-INSP15", destaque: false, avaliacao: 0, avaliacoes: 0 },
  { id: 3, slug: "tenis-nike-air-max", titulo: "Tênis Nike Air Max Masculino", descricao: "Amortecimento Air para o dia a dia e corrida leve. Original com nota fiscal.", preco: 399.90, precoAntigo: 499.90, categoria: "moda", emoji: "👟", imagem: "", estoque: 12, vendidos: 0, tags: ["tênis", "nike", "corrida"], marca: "Nike", sku: "NK-AM-01", destaque: true, avaliacao: 0, avaliacoes: 0 },
  { id: 4, slug: "cafeteira-philips-walita", titulo: "Cafeteira Elétrica Philips Walita 30 Xícaras", descricao: "Café fresquinho em minutos, jarra de vidro e sistema corta-pingos. 110V/220V.", preco: 189.90, precoAntigo: 249.90, categoria: "casa", emoji: "☕", imagem: "", estoque: 15, vendidos: 0, tags: ["cafeteira", "cozinha", "café"], marca: "Philips Walita", sku: "PW-CAF30", destaque: false, avaliacao: 0, avaliacoes: 0 },
  { id: 5, slug: "bicicleta-mountain-bike-aro-29", titulo: "Bicicleta Mountain Bike Aro 29 21 Marchas", descricao: "Quadro em alumínio, freio a disco e 21 marchas Shimano. Montagem fácil com manual em português.", preco: 899.90, precoAntigo: 1199.90, categoria: "esportes", emoji: "🚴", imagem: "", estoque: 3, vendidos: 0, tags: ["bicicleta", "mtb", "aro 29"], marca: "Genérica", sku: "BK-MTB29", destaque: true, avaliacao: 0, avaliacoes: 0 },
  { id: 6, slug: "livro-o-poder-do-habito", titulo: "Livro: O Poder do Hábito — Charles Duhigg", descricao: "O bestseller que explica por que fazemos o que fazemos e como mudar. Capa comum, 408 páginas.", preco: 29.90, precoAntigo: 39.90, categoria: "livros", emoji: "📖", imagem: "", estoque: 30, vendidos: 0, tags: ["livro", "bestseller", "produtividade"], marca: "Objetiva", sku: "LV-PDH", destaque: false, avaliacao: 0, avaliacoes: 0 },
  { id: 7, slug: "lego-creator-expert", titulo: "LEGO Creator Expert 3 em 1", descricao: "Três modelos em uma caixa: horas de diversão para crianças e adultos. Produto original LEGO.", preco: 299.90, precoAntigo: 349.90, categoria: "brinquedos", emoji: "🧩", imagem: "", estoque: 9, vendidos: 0, tags: ["lego", "brinquedo", "presente"], marca: "LEGO", sku: "LG-CE3", destaque: false, avaliacao: 0, avaliacoes: 0 },
  { id: 8, slug: "fone-bluetooth-cancelamento-ruido", titulo: "Fone de Ouvido Bluetooth com Cancelamento de Ruído", descricao: "30h de bateria, cancelamento ativo de ruído e microfone para chamadas. Estojo de carregamento incluso.", preco: 149.90, precoAntigo: 199.90, categoria: "eletronicos", emoji: "🎧", imagem: "", estoque: 25, vendidos: 0, tags: ["fone", "bluetooth", "achadinho"], marca: "Genérica", sku: "FN-BT-ANC", destaque: true, avaliacao: 0, avaliacoes: 0 },
  { id: 9, slug: "air-fryer-4l-digital", titulo: "Air Fryer Digital 4L Antiaderente", descricao: "Fritura sem óleo com 8 programas e cesto antiaderente removível. Até 60% mais rápida que o forno.", preco: 279.90, precoAntigo: 399.90, categoria: "casa", emoji: "🍟", imagem: "", estoque: 11, vendidos: 0, tags: ["air fryer", "cozinha", "achadinho"], marca: "Genérica", sku: "AF-4L-DG", destaque: true, avaliacao: 0, avaliacoes: 0 },
  { id: 10, slug: "smartwatch-monitor-cardiaco", titulo: "Smartwatch com Monitor Cardíaco e GPS", descricao: "Tela AMOLED, 7 dias de bateria, oxímetro e 100+ modos de treino. Compatível com Android e iPhone.", preco: 199.90, precoAntigo: 329.90, categoria: "eletronicos", emoji: "⌚", imagem: "", estoque: 18, vendidos: 0, tags: ["smartwatch", "relógio", "fitness"], marca: "Genérica", sku: "SW-GPS-01", destaque: false, avaliacao: 0, avaliacoes: 0 },
  { id: 11, slug: "kit-organizadores-cozinha", titulo: "Kit 10 Potes Organizadores Herméticos", descricao: "Mantém alimentos frescos por mais tempo. Empilháveis, livres de BPA e com etiquetas inclusas.", preco: 89.90, precoAntigo: 129.90, categoria: "casa", emoji: "🫙", imagem: "", estoque: 40, vendidos: 0, tags: ["organização", "cozinha", "achadinhos para casa"], marca: "Genérica", sku: "KT-ORG10", destaque: false, avaliacao: 0, avaliacoes: 0 },
  { id: 12, slug: "perfume-arabe-masculino-100ml", titulo: "Perfume Árabe Masculino 100ml Fixação 12h", descricao: "Fragrância amadeirada de alta fixação — o presente que mais cresce em buscas no Brasil.", preco: 159.90, precoAntigo: 219.90, categoria: "beleza", emoji: "🧴", imagem: "", estoque: 20, vendidos: 0, tags: ["perfume", "perfume árabe", "presente"], marca: "Genérica", sku: "PF-AR-100", destaque: false, avaliacao: 0, avaliacoes: 0 }
];

/* Depoimentos — EXEMPLO DE ESTRUTURA. Troque por depoimentos reais (com autorização) ou
   deixe o array vazio [] que a seção some sozinha. */
window.DEPOIMENTOS = [];

/* FAQ — aparece na página e vira schema FAQPage (rich result no Google). */
window.FAQ = [
  { p: "Qual o prazo de entrega?", r: "Enviamos em até 1 dia útil após a confirmação do pagamento. O prazo médio é de 2 a 7 dias úteis, dependendo da região. Você recebe o código de rastreio por WhatsApp e e-mail." },
  { p: "Quais formas de pagamento vocês aceitam?", r: "Pix (com 5% de desconto), cartão de crédito em até 12x sem juros e boleto bancário." },
  { p: "Posso trocar ou devolver?", r: "Sim. Você tem 7 dias após o recebimento para desistir da compra (Código de Defesa do Consumidor) e 30 dias para troca por defeito. Basta chamar no WhatsApp." },
  { p: "A loja é confiável?", r: "Sim. Somos uma empresa registrada (CNPJ no rodapé), emitimos nota fiscal em todas as compras e seu pagamento é processado em ambiente seguro com certificado SSL." },
  { p: "Como funciona o frete grátis?", r: "Compras acima de R$ 199 têm frete grátis para todo o Brasil. Abaixo disso, o frete é calculado no checkout pelo CEP." }
];

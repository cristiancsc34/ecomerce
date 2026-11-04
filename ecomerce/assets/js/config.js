/* =====================================================================
   CONFIGURAÇÃO DA LOJA — edite só este arquivo para personalizar tudo.
   ===================================================================== */
window.SITE_CONFIG = {
  /* ---------- MARCA ---------- */
  // Troque aqui para "capiva" ou "xodoria" para testar as outras identidades
  // (logo, cores e slogan mudam sozinhos — veja branding/logos.html).
  marcaAtiva: "tcharan",
  marcas: {
    tcharan: {
      nome: "Tcharan",
      slogan: "Chegou. Abriu. Tcharan!",
      descricao: "A loja do momento feliz: achadinhos, eletrônicos, moda, casa e presentes com frete grátis.",
      dominio: "https://tcharan.com.br",
      instagram: "tcharan", tiktok: "tcharan",
      cores: { primaria: "#6D28D9", primariaEscura: "#4C1D95", acento: "#FF5A36", destaque: "#FFD23F", tinta: "#1E1535" },
      fonteTitulos: "'Baloo 2', 'Segoe UI', sans-serif",
      logo: "branding/logos/tcharan-horizontal.svg",
      logoBranco: "branding/logos/tcharan-horizontal-mono-branco.svg",
      icone: "branding/logos/tcharan-icone.svg"
    },
    capiva: {
      nome: "Capiva",
      slogan: "Tem de tudo. É de boa.",
      descricao: "A loja mais de boa do Brasil: achadinhos, eletrônicos, moda, casa e presentes com frete grátis.",
      dominio: "https://capiva.com.br",
      instagram: "capiva", tiktok: "capiva",
      cores: { primaria: "#0F9D9A", primariaEscura: "#0B6B68", acento: "#F59E0B", destaque: "#FFE08A", tinta: "#0B2E2D" },
      fonteTitulos: "'Fredoka', 'Segoe UI', sans-serif",
      logo: "branding/logos/capiva-horizontal.svg",
      logoBranco: "branding/logos/capiva-horizontal-mono-branco.svg",
      icone: "branding/logos/capiva-icone.svg"
    },
    xodoria: {
      nome: "Xodoria",
      slogan: "A loja dos seus xodós.",
      descricao: "Os queridinhos da internet em um só lugar: eletrônicos, moda, casa e presentes com frete grátis.",
      dominio: "https://xodoria.com.br",
      instagram: "xodoria", tiktok: "xodoria",
      cores: { primaria: "#E8365A", primariaEscura: "#5B2A86", acento: "#5B2A86", destaque: "#FFE08A", tinta: "#2C1240" },
      fonteTitulos: "'Baloo 2', 'Segoe UI', sans-serif",
      logo: "branding/logos/xodoria-horizontal.svg",
      logoBranco: "branding/logos/xodoria-horizontal-mono-branco.svg",
      icone: "branding/logos/xodoria-icone.svg"
    }
  },

  /* ---------- CONTATO / EMPRESA ---------- */
  whatsapp: "5511999999999",          // DDI + DDD + número, só dígitos
  email: "contato@tcharan.com.br",
  cnpj: "00.000.000/0001-00",          // obrigatório exibir no rodapé (CDC / Decreto 7.962)
  endereco: "São Paulo, SP",
  horarioAtendimento: "Seg a Sex, 9h às 18h",

  /* ---------- REGRAS COMERCIAIS ---------- */
  freteGratisAcima: 199,               // R$ — barra de progresso no carrinho
  descontoPix: 0.05,                   // 5% no Pix
  parcelasMax: 12,                     // "até 12x sem juros"
  parcelaMinima: 25,                   // valor mínimo da parcela
  cupomBoasVindas: { codigo: "BEMVINDO10", desconto: 0.10, descricao: "10% OFF na primeira compra" },
  cupons: {                             // outros cupons válidos (código em MAIÚSCULAS)
    FRETEGRATIS: { tipo: "frete", valor: 0, descricao: "Frete grátis" },
    ACHADINHO15: { tipo: "percentual", valor: 0.15, minimo: 300, descricao: "15% OFF acima de R$ 300" }
  },
  ofertaRelampago: { ativa: true, terminaAs: "23:59", rotulo: "Oferta relâmpago" },

  /* ---------- CHECKOUT ----------
     Sem backend ainda? O carrinho fecha pelo WhatsApp (funciona hoje).
     Quando tiver gateway (Pagar.me, Mercado Pago, Yampi, Nuvemshop etc.),
     coloque a URL em checkoutUrl e o botão "Finalizar compra" passa a usá-la. */
  checkoutUrl: "",
  // Endpoint opcional para salvar leads (Formspree, Google Forms, Make, n8n...). Vazio = só WhatsApp/localStorage.
  leadEndpoint: "",

  /* ---------- TRÁFEGO / PIXELS (preencha e os scripts carregam sozinhos) ---------- */
  pixels: {
    ga4: "",            // ex.: "G-XXXXXXXXXX"
    googleAds: "",      // ex.: "AW-XXXXXXXXX"
    metaPixel: "",      // ex.: "123456789012345"
    tiktokPixel: "",    // ex.: "CXXXXXXXXXXXXXXX"
    gtm: ""             // ex.: "GTM-XXXXXXX" (se usar GTM, deixe os outros vazios e configure lá)
  },

  /* ---------- SEO ---------- */
  seo: {
    tituloHome: "{marca} | Achadinhos, Ofertas e Presentes com Frete Grátis",
    descricaoHome: "Eletrônicos, moda, casa, esportes, livros e brinquedos com até 50% OFF, Pix com 5% de desconto e frete grátis acima de R$ 199. Entrega rápida e compra 100% segura.",
    // Só ative quando tiver avaliações REAIS de clientes (Google penaliza avaliações inventadas).
    incluirAvaliacoesNoSchema: false
  },

  /* ---------- BUSCAS POPULARES (sugestões na barra de busca — vindas do Google Autocomplete BR) ---------- */
  buscasPopulares: ["achadinhos para casa", "fone bluetooth", "presente para namorado", "air fryer", "tênis de corrida", "cafeteira", "lego", "smartwatch"]
};

# Pesquisa de logística: Trama Original, transportadoras e plataformas

> Levantamento feito em **10/11/2026**.
> ✅ = dado tirado do **site oficial** da empresa.
> ⚠️ = dado de **diretório, blog ou rede social de terceiros**. Confirme antes de usar.

---

## 1. Resumo rápido (para quem só quer ligar)

| Empresa | Telefone principal | WhatsApp | E-mail | Cotação online |
|---|---|---|---|---|
| **Rodonaves (RTE)** | — | ✅ (16) 4000-2345 (atendimento de entregas) | ✅ sac@rte.com.br | ✅ rodonaves.com.br/express · comercial: "Fale com um consultor" em rodonaves.com.br/carga-fracionada |
| **Braspress** | ✅ (11) 3429-3333 (matriz) · ✅ 0800 775 3333 | ✅ (11) 2223-3500 (assistente virtual) | ✅ sac@braspress.com | ✅ cotação online exige cadastro (CNPJ) antes |
| **Jamef** | ✅ (11) 2121-6100 (matriz) · ✅ 0800 707 8333 | ✅ (11) 2121-6366 | ✅ comercial@sao.jamef.com.br (um por unidade) | ✅ "Quero ser cliente" em jamef.com.br/contato |
| **Bauer Express** | ✅ 0800 707 1950 (SAC) · ✅ (49) 3319-3000 | ✅ (49) 99109-2267 | — | ✅ bauerexpress.com.br/area-do-cliente/solicite-sua-cotacao |
| **Tecmar** (forte no Nordeste) | ✅ (11) 3613-5922 (matriz) | — | — | Portal do cliente em tecmartransportes.com.br |
| **JAW Transportes** | ✅ (44) 3631-9379 · ✅ (44) 99739-3357 | ✅ (44) 3631-9379 | ✅ cianorte@jawtransportes.com.br | ✅ jawtransportes.com.br/cotacao |
| **Giovana Transportes** | ⚠️ empresa não identificada com certeza (ver seção 4.7) | — | — | — |
| **Mercado Pago** | ✅ 0800 637 7246 (pede código de atendimento gerado no app) | — | — | — |
| **Mercado Livre** | Sem telefone público para vendedor. O contato é pela Central de Ajuda dentro da conta | — | — | — |
| **MadeiraMadeira** | (0800 e WhatsApp do site são televendas, não lojista) | — | — | Cadastro de lojista: madeiramadeira.com.br/marketplace · chamado: madeiramadeira.zendesk.com |
| **Melhor Envio** | — | — | contato@melhorenvio.com | chat em melhorenvio.com.br |
| **Frenet** | — | — | suporte@frenet.com.br | formulário comercial: frenet.com.br/suporte |

---

## 2. A loja: Trama Original

**O que vende:** móveis artesanais para área externa: sofás, poltronas, espreguiçadeiras e conjuntos. Os materiais são corda náutica, alumínio, tecido impermeável e madeira cumaru.

Exemplos encontrados em buscas (preços podem ter mudado):

- Sofá **Modena** (cumaru + tricô náutico): cerca de R$ 34.770 no site próprio.
- Sofá **Império** (corda náutica + alumínio): cerca de R$ 18.068 no site próprio.
- Sofá **Belle** 2 m + 2 poltronas: cerca de R$ 9.495 no Mercado Livre.
- Sofá **Caraívas** 2,60 m: cerca de R$ 9.025 no Mercado Livre.

**Onde vende hoje:**

- Site próprio: tramaoriginal.com.br
- Mercado Livre
- MadeiraMadeira

**Localização:** uma página no Facebook cita Umuarama (PR), mas a equipe confirmou que **a loja não fica em Umuarama**. Defina a transportadora mais próxima a partir do CEP de origem real.

### Por que o frete de sofá é diferente

1. **Volume grande e peso real moderado.** As transportadoras cobram pelo maior valor entre o peso real e o **peso cubado**. O peso cubado é o volume em m³ vezes um fator, normalmente perto de 300 kg/m³ no rodoviário. Pergunte sempre qual fator cada uma usa.
2. **Alto valor por nota.** Sobre o valor da nota incidem **ad valorem** e **GRIS** (seguro e gerenciamento de risco). Num sofá de R$ 20 mil, isso pesa muito.
3. **Acabamento frágil.** Corda, tecido e madeira marcam fácil. Use embalagem reforçada (canto, filme e papelão) para evitar avaria e briga por indenização.
4. **Entrega para pessoa física (B2C).** Muitas transportadoras de carga fracionada são focadas em empresas (B2B). Pergunte se fazem entrega residencial, agendamento, condomínio e apartamento, e quanto custam as taxas **TDE** (dificuldade de entrega) e **TDA** (dificuldade de acesso).
5. **Marketplaces limitam volumosos.** No Mercado Livre, sofá grande normalmente sai do Mercado Envios padrão e do Full (ver seção 5.1). Nesse caso a loja precisa da **própria transportadora**, e é aí que as empresas desta lista entram.

---

## 3. O que encontramos no repositório

O repositório tem **um único arquivo**: `ecomerce/index.html`. É um modelo genérico chamado **"RoyalMarket"** e ainda **não tem nada da Trama Original**:

- As categorias são genéricas (Eletrônicos, Moda, Livros, Brinquedos...). Os 8 produtos de exemplo são smartphone, notebook, tênis etc.
- **Não calcula frete:** não tem campo de CEP, prazo de entrega nem frete grátis.
- Os produtos **não têm peso, dimensões nem valor declarado**, e sem isso nenhuma transportadora ou gateway consegue cotar.
- **Não tem checkout nem pagamento:** o carrinho só mostra um `alert()` com o total.
- O rodapé tem links vazios (`#`), copyright de 2024 e um script residual da Cloudflare no fim do HTML.

**O que precisa entrar no site para vender sofá com frete calculado:**

1. Em cada produto, cadastrar **peso embalado, altura, largura, comprimento e quantidade de volumes**. Um sofá pode ir em 2 ou 3 caixas.
2. **Cálculo de frete por CEP** no carrinho. Há duas formas:
   - um **gateway** (Frenet, Melhor Envio), que consulta várias transportadoras de uma vez;
   - a **API ou tabela** de uma transportadora contratada (Braspress, Jamef, Rodonaves etc.).
3. **Checkout com Mercado Pago:** Pix, cartão parcelado e link de pagamento.
4. Uma página de **política de entrega** para volumosos: prazos, agendamento, conferência na entrega e avarias.

---

## 4. Transportadoras

### 4.1 Rodonaves (RTE Rodonaves)

| | |
|---|---|
| Site | ✅ https://rodonaves.com.br |
| WhatsApp (atendimento central) | ✅ **(16) 4000-2345** · https://wa.me/551640002345 |
| E-mail SAC | ✅ sac@rte.com.br |
| Fale conosco | ✅ https://rodonaves.com.br/fale-conosco |
| Unidades (busca por cidade) | ✅ https://rodonaves.com.br/unidades |
| Cidades atendidas | ✅ https://rodonaves.com.br/cidades-atendidas |
| Cotação online | ✅ "em menos de 2 minutos", pelo **Rodonaves Express**: https://rodonaves.com.br/express |
| Comercial | ✅ formulário **"Fale com um consultor"** em https://rodonaves.com.br/carga-fracionada (pede frequência de envio e estados de destino) |
| Serviços | Carga fracionada, carga dedicada, aéreo, armazenagem |

**Para a Trama:** o **Rodonaves Express** é a operação digital do grupo para pequenas e médias empresas, com cotação, coleta agendada e rastreio online. É um bom começo para comparar preço sem depender de vendedor. Na unidade, peça a tabela para e-commerce e confirme a entrega residencial.

### 4.2 Braspress

| | |
|---|---|
| Site | ✅ https://www.braspress.com |
| Matriz | ✅ Rod. Presidente Dutra, km 217,8, Cumbica, Guarulhos-SP, CEP 07180-903 · **(11) 3429-3333** |
| São Paulo e região | ✅ **(11) 2223-3500** (o site lista essa linha junto da Central de Cobrança) |
| Demais regiões | ✅ **0800 775 3333** |
| WhatsApp | ✅ **(11) 2223-3500**, atendido pela Romilda (assistente virtual) |
| E-mail SAC | ✅ sac@braspress.com |
| Cotação online | ✅ https://www.braspress.com/acesso-rapido/cotacao-online/. Exige login: antes, peça acesso (cadastro com CNPJ) em https://www.braspress.com/area-do-cliente/minha-conta/solicite-seu-acesso/ |
| Filiais | ✅ https://www.braspress.com/acesso-rapido/nossas-filiais/ |
| Serviços | Rodoviário, aéreo, **transporte para e-commerce**, rodofluvial, internacional |

**Para a Trama:** tem abrangência nacional e um serviço próprio para e-commerce. No WhatsApp, peça o contato do **comercial da filial que atende a sua cidade de origem**.

### 4.3 Jamef

| | |
|---|---|
| Site | ✅ https://www.jamef.com.br |
| WhatsApp | ✅ **(11) 2121-6366** · https://wa.me/551121216366 |
| Novo cliente | ✅ formulário em https://www.jamef.com.br/contato com a opção **"Quero ser cliente"** |
| Comercial | ✅ cada unidade tem e-mail comercial próprio. Matriz SP: (11) 2121-6100 · comercial@sao.jamef.com.br. Lista completa em `docs/mensagens-prontas-contatos.md` |
| SAC | ✅ 0800 707 8333 |
| Outros serviços no site | Prazo de entrega (rodoviário e aéreo), rastreamento, "difícil acesso" (consulta de áreas com restrição) |

**Para a Trama:** o site tem uma ferramenta de **áreas de difícil acesso**. Consulte os CEPs de destino antes de prometer prazo ao cliente.

### 4.4 Bauer Express

| | |
|---|---|
| Site | ✅ https://www.bauerexpress.com.br |
| Matriz | ✅ Av. Getúlio Vargas, 3540 N, Bairro Líder, **Chapecó-SC**, CEP 89805-184 |
| SAC | ✅ **0800 707 1950** |
| Telefone | ✅ **(49) 3319-3000** |
| WhatsApp | ✅ **(49) 99109-2267** |
| Contato comercial | ✅ https://www.bauerexpress.com.br/contato-comercial |
| Cotação | ✅ https://www.bauerexpress.com.br/area-do-cliente/solicite-sua-cotacao |
| Unidades | ✅ https://www.bauerexpress.com.br/unidades-de-atendimento |
| Cobertura | **Sul e Sudeste** (em 2024 anunciou presença em 100% do Sul) |
| Serviços | Carga fracionada e encomenda expressa |

**Para a Trama:** boa opção para entregas no **Sul (PR, SC, RS)** e Sudeste.

### 4.5 Tecmar Transporte & Logística (forte no Nordeste)

| | |
|---|---|
| Site | ✅ https://tecmartransportes.com.br |
| Matriz | ✅ Rua da Congregação, 206, Bairro Gramado, **Embu das Artes-SP**, CEP 06816-005 · **(11) 3613-5922** |

**Filiais no Nordeste** ✅

| Filial | Telefone | Endereço |
|---|---|---|
| Salvador-BA | (71) 3295-4900 | Estrada da Iasa, 434, Galpão 4, Pirajá |
| Feira de Santana-BA | (75) 3614-7100 | Av. Dep. Luís Eduardo Magalhães, s/n, km 103, Bairro Subaé, BR-324 |
| Aracaju (N. Sra. do Socorro-SE) | (79) 3253-6000 | Av. Boa Viagem, s/n, Lot. Jardim Itacanema |
| Maceió-AL | (82) 3142-0538 | Rua Paulo Henrique Mendes, 75, Tabuleiro do Martins |
| Recife (Cabo de Sto. Agostinho-PE) | (81) 3512-5500 | Rod. BR-101 Sul, 9200, km 96 |
| João Pessoa-PB | (83) 3233-1366 | Rua Martinho Lutero, 60, Jardim Veneza |
| Natal (Parnamirim-RN) | (84) 3604-5900 | Av. Piloto Pereira Tim, 314, Galpão 2 |
| Fortaleza-CE | (85) 3403-4400 | Av. 4º Anel Viário, 2700 B, Pedras |

**Filiais no Sul** ✅

| Filial | Telefone |
|---|---|
| Curitiba (São José dos Pinhais-PR) | (41) 3753-2100 |
| Blumenau-SC | (47) 3334-6565 |
| Joinville-SC | (47) 3429-5812 |
| Cachoeirinha-RS | (51) 3469-5600 |

**Outras filiais** ✅

| Filial | Telefone |
|---|---|
| Campinas-SP | (19) 2660-2029 |
| Pouso Alegre-MG | (35) 3311-1000 |
| Viana-ES | (27) 2464-2958 |
| Goiânia-GO | (62) 3532-6200 |
| Manaus-AM | (92) 3624-3700 |
| Boa Vista-RR | (95) 3015-6248 |
| Santos-SP | (site não informa telefone) |

**Para a Trama:** é a melhor rede da lista para **vender no Nordeste**. A unidade paranaense é a de Curitiba. Pergunte se coletam na sua cidade de origem ou se é preciso levar a carga até a filial mais próxima.

### 4.6 JAW Transportes

| | |
|---|---|
| Site | ✅ https://jawtransportes.com.br |
| Matriz | ✅ Via Vereador Djalma Magalhães Barros, 7206, Zona 11A, **Cianorte-PR**, CEP 87211-400 |
| Telefones | ✅ **(44) 3631-9379** (também é o WhatsApp) · **(44) 99739-3357** |
| E-mail | ✅ cianorte@jawtransportes.com.br |
| Horário | ✅ Seg. a sex., 08:00–11:30 e 13:00–18:00 |
| Cotação / coleta | ✅ https://jawtransportes.com.br/cotacao · https://jawtransportes.com.br/solicitar-coleta |
| Filial Maringá | ⚠️ (44) 99184-7917, segundo diretório |
| Serviços | Carga fechada (veículo exclusivo), carga fracionada, atendimento personalizado. Atua desde 2004 |

**Para a Trama:** é **regional** (noroeste do PR). Vale a pena se a origem for no Paraná. Serve para entregas no estado, para **cargas fechadas** (vários sofás para um lojista ou showroom) e como **coleta/transferência** até o terminal de uma transportadora nacional.

### 4.7 Giovana Transportes ⚠️ não identificada com certeza

Não encontrei site oficial. Há várias empresas com nome parecido:

| Empresa | Cidade | Contato | Situação |
|---|---|---|---|
| TS e Giovana Transportes Cargas e Encomendas | Goiânia-GO | ⚠️ (62) 3586-6346 | Diretório |
| Giovanna Transportes (CNPJ 19.842.416/0001-85) | Curitiba-PR (Xaxim) | ⚠️ sem telefone confirmado | Diretório: fretes, cargas e mudanças |
| Giovana Transportes Ltda (CNPJ 52.149.077/0001-21) | Guarulhos-SP | — | **Baixada** (encerrada) |
| Transportes Giovana / Trans Giovana | Severiano de Almeida-RS | — | Transporte de **passageiros** (fretamento), não serve |

👉 **Ação:** se vocês tiverem o cartão, o site ou o CNPJ de quem indicou a "Giovana", me passem que eu completo esta parte.

---

## 5. Plataformas de venda, pagamento e frete

### 5.1 Mercado Livre (vendas)

- **Contato:** não existe telefone público para vendedor. O atendimento é pela **Central de Ajuda dentro da conta de vendedor**: chat e, conforme o caso, ligação agendada ou WhatsApp. Conteúdo para vendedores: https://vendedores.mercadolivre.com.br
- ⚠️ Sites de terceiros divulgam 0800 637 7246 e 4020-1735 como "Mercado Livre", mas na prática essas linhas são do **Mercado Pago**.
- **Frete de sofá no Mercado Livre:**
  - Mercado Envios padrão e Coleta têm limites de peso e tamanho (por exemplo, até 50 kg e maior lado de até 200 cm na Coleta). Sofá grande normalmente passa disso.
  - **Full:** blogs do setor relatam que, em 2026, o ML passou a restringir itens **extragrandes** nos centros de distribuição. ⚠️ Confirme no painel.
  - **ME1 (Mercado Envios 1):** é a modalidade para **itens pesados ou volumosos**. **O vendedor informa custo e prazo** e entrega com a **própria transportadora**. Para a Trama, é aqui que entram os contratos com as transportadoras da seção 4. Página: https://www.mercadolivre.com.br/a/store/mercado-envios-1
  - Página de envios de produtos pesados: https://www.mercadolivre.com.br/a/store/envios-produtos-pesados

### 5.2 Mercado Pago (pagamentos)

| | |
|---|---|
| SAC | ✅ **0800 637 7246**. Antes de ligar, gere o **código de atendimento** em Ajuda > Fale conosco no app ou no site |
| Libras (deficiência auditiva ou de fala) | ✅ 0800 650 2121, seg. a sex., 8h–18h, por videochamada |
| Ouvidoria | ✅ 0800 688 4365, só com protocolo de um atendimento anterior |
| Atendimento empresarial | ✅ Quem vendeu **mais de R$ 90 mil nos últimos 3 meses** tem atendimento exclusivo (chat, telefone ou e-mail) pelo botão **"Contato"** no painel |
| Guia oficial de canais | https://www.mercadopago.com.br/blog/atendimento-mercado-pago-como-entrar-em-contato |

O Mercado Pago avisa que **nunca pede senha, código ou dados de cartão por telefone**.

**Uso para a Trama:** checkout no site próprio, Pix, cartão parcelado (importante para tíquete alto) e link de pagamento para vendas pelo WhatsApp e Instagram.

### 5.3 MadeiraMadeira (marketplace de casa e decoração; a Trama já vende lá)

| | |
|---|---|
| Cadastro e informações para lojista | https://www.madeiramadeira.com.br/marketplace |
| Suporte a lojista | ✅ chamado em https://madeiramadeira.zendesk.com/hc/pt-br/requests/new |
| Logística | A página do marketplace cita o **Madeira Envios** |
| Atenção | O 0800 080 0099 e o WhatsApp (41) 7403-1865 são **televendas** (canal de compra), não atendimento a lojista |
| Repasse | Ciclo do dia 26 de um mês ao dia 25 do mês seguinte (página do marketplace) |

**Uso para a Trama:** é o canal mais alinhado ao produto (móveis e decoração). Pergunte ao suporte de lojista se existe **logística própria para volumosos** ou se a entrega fica com a loja.

### 5.4 Gateways de frete (cotam várias transportadoras de uma vez)

| Plataforma | Contato | Observação para sofá |
|---|---|---|
| **Frenet** | suporte@frenet.com.br · comercial pelo formulário em frenet.com.br/suporte | Integra com várias plataformas de loja. Uma documentação de integração cita peso máximo de **1.000 kg**. Pergunte se dá para cadastrar **contratos próprios** com Braspress, Jamef, Rodonaves etc. |
| **Melhor Envio** | contato@melhorenvio.com · chat no site · facebook.com/MelhorEnvio | Ótimo para itens menores (almofadas, acessórios). As parceiras têm limites baixos (ex.: Loggi até 30 kg e 200 cm somando os lados), então confirme se há modalidade para volumosos |
| **Central do Frete** | ⚠️ (11) 4226-4850 (diretório), São Caetano do Sul-SP | Marketplace de cotação de frete. Confirme o telefone no site |

---

## 6. Antes de ligar: o que ter em mãos

- CNPJ, inscrição estadual e **CEP de origem** (fábrica ou estoque).
- Para cada modelo: **medidas e peso já embalado**, número de volumes e valor médio da nota.
- **Volume mensal** estimado (pedidos por mês) e principais destinos (ex.: SP capital, Sul, Nordeste).
- Três **rotas-teste** para comparar preços entre todas, sempre com o mesmo sofá. Exemplo:
  - origem → São Paulo-SP
  - origem → Florianópolis-SC
  - origem → Recife-PE

## 7. Perguntas para fazer a cada transportadora

1. Vocês **coletam na minha cidade** ou preciso levar ao terminal? Qual unidade atende?
2. Fazem **entrega residencial (pessoa física)**? Com **agendamento**? Sobem andar ou entregam no térreo?
3. Qual o **fator de cubagem** (kg/m³)? Qual o **frete mínimo**?
4. Quanto é o **ad valorem / GRIS** sobre o valor da nota? O seguro cobre **avaria** de acabamento?
5. Cobram **TDE / TDA / TRT**? Quais CEPs têm restrição?
6. Qual o **prazo** por região? Existe tabela específica para **e-commerce**?
7. Têm **API ou EDI** para cotação automática no site, ou integram com **Frenet / Melhor Envio**?
8. Como funcionam **reentrega e devolução** (cliente ausente ou recusa)?
9. Que **embalagem** exigem para aceitar indenização em caso de avaria?
10. Qual a forma de **faturamento** (prazo, boleto, volume mínimo)?

---

## 8. Recomendação inicial

| Destino | Primeiras opções para cotar |
|---|---|
| Paraná e coleta regional | **JAW** (Cianorte) |
| Sul (PR/SC/RS) | **Bauer Express**, **Rodonaves**, **Braspress** |
| Sudeste | **Rodonaves**, **Braspress**, **Jamef**, **Bauer** |
| Nordeste | **Tecmar** (8 filiais na região), **Braspress**, **Jamef** |
| Canal de venda | **Mercado Livre (ME1)** + **MadeiraMadeira** + site próprio com **Mercado Pago** |
| Frete calculado no site | **Frenet** usando os contratos negociados acima |

---

## Fontes

**Sites oficiais**

- rodonaves.com.br (página inicial, /fale-conosco, /unidades)
- braspress.com (página inicial, /contato, /whatsapp-braspress, /servicos, /acesso-rapido/nossas-filiais)
- jamef.com.br (configuração pública do site com WhatsApp e endpoints de cotação)
- bauerexpress.com.br (página inicial, sitemap e configuração pública do WhatsApp)
- tecmartransportes.com.br (lista de filiais do site)
- jawtransportes.com.br (página inicial e /contato)
- madeiramadeira.com.br (rodapé com SAC e WhatsApp, /marketplace)
- mercadopago.com.br (blog oficial de canais de atendimento)
- mercadolivre.com.br (páginas de ME1, envios pesados e dimensões)

**Terceiros ⚠️**

- [Trama Original no Facebook](https://www.facebook.com/Tramadesignmoveis/) (endereço em Umuarama)
- [Trama Original no Mercado Livre](https://lista.mercadolivre.com.br/trama-original)
- Solutudo e Applocal (unidades Jamef, JAW Maringá, Central do Frete, TS e Giovana)
- Econodata e cnpj.biz (registros "Giovana")
- Blogs do setor sobre regras do Full em 2026 (Base, E-commerce Verso, GoSmarter)

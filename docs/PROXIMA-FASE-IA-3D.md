# Próxima fase: foto suja → foto profissional → 3D → legenda (no painel)

> **Status (28/10/2026):** o estúdio está no painel — envio das fotos do celular, **limpeza de fundo automática
> funcionando** (modelos abertos, rodando localmente), fila, antes × depois, regra “3D obrigatório” por categoria.
> **Falta ligar o gerador 3D e a legenda com IA**: ver [`ESTUDIO-IA.md`](ESTUDIO-IA.md). O vídeo passo a passo será
> gravado quando o 3D estiver ligado.

## O pedido (registrado em 27/10/2026)

- Um funcionário fotografa o objeto (cadeira, mesa, sofá…) e, **dentro do painel**, cadastra um novo item do catálogo.
- As fotos “sujas” (fundo qualquer) passam por um app de **remoção de fundo** e viram fotos profissionais.
- A partir dessas fotos limpas (3 a 4 ângulos), o sistema **gera o modelo 3D**.
- A **legenda/descrição** é escrita com IA (API do Claude ou do ChatGPT).
- Cada item do catálogo tem **fotos profissionais e 3D (obrigatórios)** e **vídeo (opcional)**. Na criação, o painel
  mostra as três opções: foto, 3D e vídeo.
- **Vídeo passo a passo (observação salva):** gravar a tela do painel mostrando todo o processo com fotos reais de uma
  cadeira: subir as fotos sujas → limpeza → modelagem 3D → item publicado e exibido na loja.
- É um MVP: o caminho mais simples que funcione de verdade.

## Fluxo proposto no painel

1. **Novo item**: nome, categoria (Cadeiras, Mesas, Sofás… criadas no painel) e as mídias que o item terá:
   ☑ Fotos (obrigatório) · ☑ 3D (obrigatório) · ☐ Vídeo (opcional).
2. **Fotos sujas**: o funcionário envia 3 ou 4 fotos pelo celular (frente, lateral esquerda, traseira, lateral
   direita), com um guia curto de como fotografar. Envio direto ao Storage por URL assinada (fotos de celular passam
   do limite de 4,5 MB das funções da Vercel).
3. **Limpeza**: cada foto vai para a remoção de fundo → PNG com fundo transparente → o servidor aplica o fundo padrão
   da loja (claro, com sombra suave) e padroniza tamanho e enquadramento. Tela **antes × depois**; o funcionário
   aprova ou refaz. O original fica guardado.
4. **3D**: as fotos limpas aprovadas vão para o gerador 3D de múltiplas vistas → arquivo `.glb` → o servidor comprime
   (malha e texturas) para carregar rápido no celular → prévia girando no painel (`<model-viewer>`, já usado na loja)
   → aprovar ou gerar de novo. Se o modelo não ficar fiel, marcar como “ilustrativo” (a loja avisa).
5. **Legenda com IA**: o Claude (com visão) recebe as fotos limpas e os dados que o funcionário informou (medidas,
   material, cor) e sugere título, descrição curta e longa, tópicos, textos alternativos e SEO. Cada campo só entra
   no produto se a pessoa aceitar. Regra: não inventar medidas, materiais, garantias ou certificações.
6. **Vídeo (opcional)**: envio de vídeo do produto (URL assinada, com limite de tamanho e validação do conteúdo).
   Futuro: gerar automaticamente um vídeo girando o modelo 3D.
7. **Publicar**: além das regras atuais, itens de categorias marcadas como “exige 3D” só publicam com o 3D aprovado.

## Arquitetura (mesma stack: Vercel + Supabase)

- **Tarefas assíncronas**: limpeza e 3D levam de segundos a alguns minutos. A Server Action cria um registro em
  `ai_jobs` (tabela já desenhada em [`IA-E-3D.md`](IA-E-3D.md)) e envia para a fila do provedor com **webhook**. Uma
  rota `/api/webhooks/...` recebe o resultado (assinatura verificada), salva no Storage e atualiza o job. O painel
  acompanha o progresso. Assim nenhuma função da Vercel fica presa esperando.
- **Chaves só no servidor** (nunca `NEXT_PUBLIC_*`), limite de gasto diário, limite de tentativas por usuário e
  registro de custo por job na auditoria.
- **Adaptação do catálogo**: hoje os campos são pensados para colchão (firmeza, tamanhos). Para móveis: medidas
  L × P × A, material e cor como campos gerais. Firmeza e tamanhos de cama ficam só para colchões.

## Provedores recomendados (preços de out/2026; conferir antes de contratar)

| Etapa | Recomendação | Custo aproximado | Alternativas |
| --- | --- | --- | --- |
| Remoção de fundo | **fal.ai** (BiRefNet ou Bria RMBG 2.0) | ~US$ 0,01–0,02 por foto | Photoroom (US$ 0,02/foto) |
| 3D de várias fotos | **fal.ai — Tripo H3.1 multiview-to-3D** (gera `.glb`) | US$ 0,30 com textura (US$ 0,40 em HD) | Hunyuan3D v3 na fal.ai; Meshy |
| Legenda e descrições | **API do Claude** (com visão) | centavos por item | API da OpenAI |

Por que a **fal.ai**: uma única conta e chave para limpeza e 3D, pagamento por uso, fila com webhook. Estimativa total:
**menos de US$ 1 por item** (4 fotos + 1 modelo 3D + textos). O remove.bg não é recomendado: a API dele está sendo
descontinuada.

Fontes: [Tripo multiview na fal.ai](https://fal.ai/models/tripo3d/h3.1/multiview-to-3d),
[Hunyuan3D v3 na fal.ai](https://fal.ai/models/fal-ai/hunyuan3d-v3/image-to-3d),
[removedores de fundo na fal.ai](https://fal.ai/explore/background-remover-apis),
[comparativo de APIs de remoção de fundo](https://fapihub.com/blog/background-removal-api-comparison-2026/).

### Limites honestos

- 3D gerado por IA é **aproximado**, não é medida de fábrica: revisão humana sempre. Vidro, metal espelhado e pernas
  muito finas de cadeira costumam sair piores.
- O `.glb` bruto pode ter dezenas de MB (o exemplo do provedor tem ~43 MB): a compressão no servidor é obrigatória.
- A qualidade depende das fotos: boa luz, objeto inteiro no quadro, sem pessoas, mesmos ângulos sempre.

## O que o dono do projeto precisa providenciar

1. **Conta na fal.ai** com uma chave de API e limite de gasto → variável `FAL_KEY`.
2. **Chave da API do Claude** (console da Anthropic) → variável `ANTHROPIC_API_KEY`. (Se preferir a OpenAI:
   `OPENAI_API_KEY`.)
3. As chaves entram como segredos do ambiente (nas configurações do ambiente da sessão e, em produção, nas variáveis
   de ambiente da Vercel). **Nunca colar chaves no chat nem no código.**
4. **Supabase em nuvem** (projeto novo) e **projeto na Vercel** importando este repositório, para rodar fora do
   ambiente local.
5. **Fotos reais**: para cada item, 4 fotos (frente, lateral esquerda, traseira, lateral direita), objeto inteiro,
   câmera na altura do meio do objeto, boa luz.
6. Dizer **“ok, faça isso”**.

## Como será gravado o vídeo passo a passo

Com as chaves e as fotos reais da cadeira, um roteiro automatizado (Playwright, já usado nos testes) abre o painel e
grava a tela: login → novo item “Cadeira” → envio das fotos sujas → limpeza (antes × depois) → 3D sendo gerado →
modelo pronto girando → legenda sugerida pela IA → publicar → item na loja com fotos e 3D. Tudo com APIs reais, nada
simulado. Entrega em MP4 com o título de cada etapa na tela.

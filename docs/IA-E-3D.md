# IA (imagens e descrições) e 3D

Estado: **3D com carregamento sob demanda implementado** (prova de conceito com modelo ilustrativo). **IA não
implementada** — a spec pede para não simular integrações sem provedor e credenciais. Este documento descreve como
encaixar quando o provedor for escolhido.

> **Próxima fase pedida pelo dono do projeto** (foto suja → foto limpa → 3D → legenda com IA, dentro do painel, e o vídeo
> passo a passo): plano, provedores e o que falta em [`PROXIMA-FASE-IA-3D.md`](PROXIMA-FASE-IA-3D.md). **Só começa quando ele
> disser “ok, faça isso”.**

## 3D (pronto para uso)

- Envie um `.glb` (glTF 2.0 binário) pelo painel, na seção de mídia, com texto alternativo. O tipo é validado pelo
  conteúdo (`glTF` versão 2).
- Na página do produto, **sobre a foto principal** (canto inferior), ficam **“Ver no seu ambiente”** e **“Girar em
  3D”** — só nos produtos com modelo 3D. “Girar em 3D” troca a foto pelo visualizador no mesmo lugar (“Ver fotos”
  volta). Só então são baixados o `<model-viewer>` (three.js) e o arquivo (teste E2E garante isso).
- “Ver no seu ambiente” depende do aparelho (`lib/ar/device.ts`): celular com AR abre a câmera; navegador de dentro
  de app (Instagram, WhatsApp, app do Google; Firefox no Android) abre a mesma página no Safari/Chrome; computador ou
  celular sem AR abre um **modal com código QR** (gerado no navegador pela biblioteca `qrcode`, sem serviço externo),
  o link por extenso e “Copiar link”. O QR abre `/produtos/<slug>?ar=1` (com `&cor=<cor>` quando há cor escolhida):
  no celular, a página já mostra o 3D e o botão grande “Abrir no seu ambiente” (a câmera só abre com um toque, regra
  dos navegadores); no computador, `?ar=1` abre o próprio modal. O nome antigo `?ver-no-ambiente=1` continua aceito.
- Eventos de uso `ar_click`, `ar_open`, `view3d_click` e `ar_qr_open` (com `produto_id`) saem por `lib/analytics.ts`: vão para o
  `window.dataLayer`, se existir, e para o evento do navegador `cuxoes:evento`. O projeto ainda não tem provedor de
  analytics; para ligar um, é só chamá-lo em `track()`.
- Marque “ilustrativa” se o modelo não for fiel ao produto; a página avisa.
- **Realidade aumentada (“Ver no seu ambiente”)**: no celular, **um toque** abre a câmera com o produto no chão do
  cliente, direto da foto. Os navegadores só abrem a câmera alguns segundos depois de um toque (cerca de 5 s); por
  isso nada pesado é baixado depois do toque:
  - a biblioteca do visualizador (model-viewer/three.js, ~300 KB) chega com a página já parada, só em celular com
    AR e sem economia de dados ligada; o `.glb` nunca é baixado antes de o cliente pedir o 3D;
  - um `<model-viewer>` escondido (`data-abre-camera`, `arLauncherAttributes`) abre o visualizador do sistema no
    mesmo toque: **Scene Viewer** no Android (o app do Google baixa o `.glb` sozinho) e **AR Quick Look** no
    iPhone/iPad com o **`.usdz` pronto** (`ios-src`). A foto continua na tela;
  - com o 3D aberto, a câmera abre pelo próprio 3D (`ar-modes="webxr scene-viewer quick-look"`: WebXR no Android,
    que mostra a cor escolhida). WebXR e `.usdz` gerado na hora esperam o `.glb` carregar;
  - se mesmo assim o toque ficar para trás (rede muito lenta), a página não troca de tela: mostra o botão grande
    “Abrir no seu ambiente” e o aviso “O navegador só abre a câmera com um toque seu”; o próximo toque abre na hora.
  Medido em 04/11/2026 (iPhone simulado, rede de 4 Mbps): antes, a câmera era pedida 18 s depois do toque (recusada)
  e só o segundo toque abria; agora, 0,02 s depois do toque. No computador, a página orienta a abrir no celular. Só
  funciona em HTTPS (Vercel).
- **Tamanho real no AR (só com medidas conferidas)**: o Tripo entrega o modelo com 1 m de altura. Quando o produto
  tem **largura, profundidade e altura** no catálogo, o estúdio (`scripts/ar-files.mjs`) escolhe a escala uniforme
  que mais aproxima o modelo das medidas, **confere cada medida com tolerância de 2 cm**, grava o `.glb` em escala
  real e gera o **`.usdz`** (iPhone/AR Quick Look) no mesmo lugar do Storage, e confere de novo a caixa dos arquivos
  gerados. Na loja: `ios-src` com o `.usdz`, `ar-modes="webxr scene-viewer quick-look"` e `ar-scale="fixed"` (o
  cliente não redimensiona), e os textos dizem “tamanho real”.
- **Sem medidas, ou fora da tolerância**: nada é publicado como tamanho real. O painel mostra o aviso com o motivo
  (“Faltam largura e profundidade…”, “largura 69 cm no modelo × 80 cm no catálogo”), o AR continua com o tamanho
  aproximado (`ar-scale="auto"`: o cliente ajusta com dois dedos) e a página avisa. Mesmo assim o estúdio grava um
  `.usdz` **no tamanho do próprio modelo** (`real_scale = false`, sem `bounds_cm`) — o mesmo que o model-viewer
  geraria na hora, só que pronto, para o iPhone abrir a câmera no mesmo toque. Se as medidas mudarem depois da
  conferência, a loja volta sozinha para “aproximado” até conferir de novo (o `.usdz` continua, sem prender o
  tamanho). A demonstração usa `public/demo/poltrona-azul.usdz` (77,5 × 90,3 × 100 cm, o tamanho do modelo;
  `npm run ar:usdz -- --glb public/demo/poltrona-azul.glb --aproximado`). Os `.usdz` saem com o tipo
  `model/vnd.usdz+zip` (`next.config.ts`).
- **Produtos que já têm 3D**: botão **“Conferir medidas e gerar o arquivo do iPhone”** no Estúdio (Modelo 3D), ou
  `npm run ar:usdz -- --supabase` (simula) / `--supabase --aplicar` (grava). Para um arquivo solto:
  `npm run ar:usdz -- --glb arquivo.glb --medidas 78x90x100` (ou `--aproximado`, sem medidas). Sem medidas, o
  `--supabase --aplicar` grava o `.usdz` no tamanho do modelo para quem ainda não tem um.
- Banco: colunas `usdz_storage_path`, `real_scale` e `bounds_cm` em `product_media` e o tipo `model/vnd.usdz+zip`
  no bucket (migração `20261103000400_ar_real_scale.sql`).
- **Variantes de cor ou tecido**: cada variação pode ter uma cor (`#RRGGBB`, campo “Cor (hex)” da variação no painel)
  e mídias próprias (`product_media.variant_id`: fotos e, se existir, um modelo 3D próprio). Na página, as variações
  com cor viram o seletor **“Cor”** (amostras redondas). A cor escolhida troca as fotos (as da cor ou, sem elas, as do
  produto), o 3D (modelo próprio → troca o arquivo, e o AR usa esse arquivo; sem ele → a variante do próprio `.glb`
  com `KHR_materials_variants`, pelo nome da cor, ou a cor do material principal com `setBaseColorFactor`), o preço
  (se a variação tiver outro) e vai para a URL (`?cor=marrom`) e para o link do código QR (`?ar=1&cor=marrom`). A
  primeira cor da lista é a das fotos e do modelo do produto. Sem variação com cor, o seletor não aparece.
  Limitação: cor pintada na hora (sem modelo próprio) não chega ao Scene Viewer do Android, que abre o arquivo
  original; por isso, com uma dessas cores, a câmera abre pelo 3D da tela (WebXR no Android; `.usdz` gerado na
  hora no iPhone), que mostra a cor escolhida — pode pedir o segundo toque em rede lenta. Pendente no painel:
  ligar uma foto ou um modelo a uma cor (hoje só pelo banco).
- **Cores de exemplo (só desenvolvimento)**: `CATALOG_DEV_EXAMPLES=1` com `CATALOG_SOURCE=demo`, fora da Vercel, mostra
  a Poltrona Azul em azul, marrom, branco, vermelho e bege. As fotos e o `.glb` com as 5 cores
  (`public/demo/exemplo`) saem de `npm run demo:variantes` (**recolor por computador**: só o tecido muda; madeira, fundo
  e sombras ficam) ou de `npm run demo:variantes:gpt` (**tom do GPT**, com `OPENAI_API_KEY`). No modo GPT, **a foto
  da loja é sempre a original com o tecido repintado**: madeira, fundo, sombra e forma vêm da original, pixel a pixel,
  e nada que a IA acrescente ou mude na foto dela chega à loja. Da foto do GPT sai só o tom da cor nova (`gptTone`):
  que cor o tecido tem em cada nível de luz (sombra, dobra, brilho), em 32 faixas, pela mediana. Antes, cada foto do
  GPT é alinhada com a original (deslocamento de até 48 px, escala de ±2%, formato diferente cortado ou com faixas),
  e o ângulo é descartado se a foto não corresponde à original (diferença fora do tecido > 10, já descontada a luz)
  ou se o tecido dela não é uma cor só (> 25% fora do tom: estampa, dois tons, algo por cima). Com pelo menos 3 dos 4
  ângulos bons, o tom sai de todos juntos (a cor fica igual nos 4) e a cor medida tem de ser a pedida (ΔE ≤ 10 e mais
  perto dela que do azul). Senão, a cor inteira fica com o recolor por computador. O 3D usa a cor medida.
  Por que não usar a foto do GPT direto: um teste de ataque (109 casos) mostrou que conferir pixel a pixel não separa
  adulteração de foto fiel refeita — sofá ou almofadas acrescentados, apoio de cabeça apagado, madeira mais escura e
  estampas passavam, e uma foto fiel deslocada 12 px era recusada. Calibrado com 41 casos (fiéis refeitas, cor
  errada, foto que não corresponde) e testado em `tests/unit/variantes-gpt.test.ts`. Relatório por cor e por foto em
  `public/demo/exemplo/relatorio-gpt.json`. **Para gerar de novo com o GPT:** é preciso a `OPENAI_API_KEY` na
  máquina que roda o script. A chave da Vercel é protegida e só existe no servidor de produção. As fotos atuais foram
  geradas por uma rota temporária do site (`POST /api/interno/cores-exemplo`), que usava a chave do servidor e foi
  retirada em 08/11/2026, depois de cumprir o papel. As fotos que o GPT devolve ficam em `ai/cache/cores-gpt` (fora do
  git), e rodar de novo só paga o que faltou. Para pedir de novo uma cor, use `--refazer=vermelho`. **Fotos de
  exemplo atuais (04/11/2026):**
  geradas pelo GPT do site e usadas como o GPT entregou (`--fotos-do-gpt`), por escolha do Cristian depois de
  comparar com a versão repintada. As 4 cores passaram no alinhamento e na cor (ΔE 5–6,5), e as 16 fotos foram
  conferidas uma a uma com as originais: mesma forma, madeira, ripas, parafusos, sapatas, fundo e sombra, nada
  acrescentado. Para gerar de novo assim, a conferência por pessoa é obrigatória. Marcadas como ilustrativas e sem
  preço. Não aparecem na loja de verdade. Proposta para o painel: [`CORES-NO-ESTUDIO.md`](CORES-NO-ESTUDIO.md).
- **Para arquitetos e designers** (fase de teste): enquanto as medidas não forem conferidas com o modelo 3D, a página
  mostra só uma linha discreta no fim — “É arquiteto ou designer de interiores? Peça o arquivo 3D e a ficha técnica” —
  que leva ao WhatsApp com a mensagem pronta (ou ao atendimento, com e-mail/telefone) e dispara o evento
  `arquitetos_interesse`. **A linha só aparece com algum canal de contato cadastrado** (`config/brand.ts`); hoje não
  há nenhum, então ela fica escondida. O evento só é guardado quando houver um provedor de analytics ligado em
  `lib/analytics.ts` (hoje vai para `window.dataLayer`, que não existe, e para o evento do navegador). Nenhum arquivo
  com escala aproximada é oferecido. Com o tamanho real conferido, aparece a
  seção recolhida com o download do `.glb` e do `.usdz` (nome legível, `cuxoes-<produto>.glb`; no Storage, via
  `?download=`) e a ficha técnica só com dados do catálogo. O texto diz o que cada programa abre, conferido nas
  documentações: `.glb` no Blender, no SketchUp para computador 2024+ (Pro/Studio), Lumion, D5, Twinmotion e Rhino;
  o Revit e o Promob não abrem `.glb`. No Brasil o padrão das marcas é o bloco `.skp` (SketchUp) e o `.dwg`; um `.obj`
  leve em milímetros ampliaria o alcance (Revit, Archicad, 3ds Max, Promob). Próximo passo possível: programa de
  indicação ([`PROGRAMA-INDICACAO.md`](PROGRAMA-INDICACAO.md)).
- Checklist de revisão de um modelo: proporções conferidas com as medidas reais, cor e textura comparadas com a foto,
  costuras/faixas presentes, arquivo < 4 MB (comprimir texturas), orientação e escala (metros). Para o AR do Android:
  texturas JPEG/PNG (nada de WebP), até 2048 px, até 100 mil triângulos e a base do modelo apoiada em y = 0 — o
  processador já entrega assim.

## Pipeline de imagens com IA (a implementar)

1. Upload e validação (já existe: `lib/media/validate.ts`).
2. Original preservado (já é assim: o arquivo enviado não é alterado).
3. Cópia de trabalho em `products/<id>/ai/<job>.png`.
4. Remoção/troca de fundo ou composição pelo provedor, **no servidor**, com limite de tamanho, timeout e teto de custo.
5. Tela de comparação lado a lado (original × resultado).
6. Aprovação humana: só então vira mídia do produto (marcada como ilustrativa quando for composição).
7. Publicação segue as regras atuais (foto principal precisa ser real).

Tabela sugerida (criar junto com a implementação):

```sql
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  job_type text not null check (job_type in ('background_removal', 'composition', 'description', 'model_3d')),
  provider text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','approved','rejected')),
  input_path text,
  output_path text,
  cost_estimate_cents integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  approved_by uuid references auth.users(id)
);
-- RLS: só a equipe lê/escreve; aprovação só por admin.
```

Regras: a IA não altera cor, textura, costura ou formato de forma enganosa; não gera selos/certificações; não inventa
detalhes invisíveis. Rate limit por usuário e alerta de gasto.

## Descrições com IA (a implementar)

- **Entrada**: só os campos já confirmados do produto (nome, medidas, firmeza, materiais, camadas, garantia).
- **Saída sugerida**: título, descrição curta, descrição longa, bullets e meta description.
- **Proibido**: inventar materiais, dimensões, densidade, certificados, prazo, garantia ou benefícios médicos.
- Validação automática da resposta: recusar números/termos que não estejam na entrada (ex.: “D33”, “anos”, “ortopédico”).
- O resultado aparece como **sugestão** ao lado do formulário; cada campo só entra no produto se a pessoa aceitar e
  salvar. Nada é publicado automaticamente.
- Variáveis reservadas: `IMAGE_AI_PROVIDER`, `IMAGE_AI_API_KEY`, `THREE_D_MODEL_PROVIDER`, `THREE_D_MODEL_API_KEY`
  (somente servidor).

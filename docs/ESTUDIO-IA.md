# Estúdio de fotos e 3D (painel)

Na página de cada produto, o painel tem o **Estúdio de fotos e 3D**:

1. **Fotos do celular**: o funcionário envia 3 ou 4 fotos (frente, lateral, traseira) com qualquer fundo. O navegador
   reduz fotos grandes antes de enviar (limite de 4 MB por arquivo).
2. **Limpeza de fundo automática**: cada foto vira uma foto de estúdio 4:3 (o formato da galeria da loja), com fundo
   claro e sombra suave. O painel mostra **antes × depois**; a foto limpa já entra na galeria do produto (a primeira vira
   a principal). Se um móvel ao fundo “grudou” na máscara, ele é retirado automaticamente.
3. **Modelo 3D** gerado a partir da foto escolhida, com prévia girando no painel. Fica marcado como **ilustrativo** até
   alguém revisar.
4. **Vídeo (opcional)**: enviado na seção de mídia.

Categorias marcadas com **“Exige modelo 3D para publicar”** (como “Cadeiras e poltronas”) só publicam com 3D. Fotos são
sempre obrigatórias; vídeo é opcional.

## Como funciona

```
Painel (Next.js)  ──cria job──▶  ai_jobs (Supabase)  ◀──pega 1 por vez──  Processador (scripts/ai-worker.mjs)
       ▲                                                                       │ roda ai/*.py (CPU)
       └────────── acompanha a cada 2 s ◀── grava a foto/3D como mídia ◀────────┘
```

- O painel só **cria** e **acompanha** jobs (RLS: equipe, produto editável, arquivo da pasta do produto). Quem muda o
  status e grava o resultado é o processador, com a chave de serviço.
- O processador roda numa máquina da loja ou num servidor (nunca no navegador nem na Vercel). Ele avisa que está ligado
  (tabela `ai_workers`) e o painel mostra quais motores estão disponíveis.
- Arquivos: `products/<id>/originais/` (foto enviada), `products/<id>/recortes/` (recorte com transparência, base do
  3D) e `products/<id>/<uuid>.jpg|.glb` (resultado).

## Instalar e rodar

```bash
npm run ai:setup    # uma vez: ambiente Python (CPU) + modelos (~1,1 GB)
npm run ai:worker   # deixe rodando; lê .env.local (URL do Supabase + chave de serviço)
```

Requisitos: Python 3.11+, ~4 GB de RAM livres e ~3 GB de disco. Não precisa de placa de vídeo.

Tempo medido (4 vCPUs, sem GPU): **35 a 45 s por foto**. As fotos são processadas uma por vez, na ordem de envio.

## Modelos (todos abertos, rodando localmente; nenhuma foto sai da máquina)

| Etapa | Modelo | Licença |
| --- | --- | --- |
| Separar objeto e fundo | [BiRefNet](https://huggingface.co/onnx-community/BiRefNet-ONNX) (ONNX) | MIT |
| Tirar móveis ao fundo | [Depth Anything V2 Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf) | Apache-2.0 |
| 3D (opcional, ver abaixo) | [TripoSR](https://huggingface.co/stabilityai/TripoSR) | MIT |

## Estado do 3D automático

O fluxo, a fila, a gravação do `.glb`, a prévia e a regra de publicação estão prontos e testados. **O motor que gera o
3D ainda não foi ligado**:

- **Local (grátis, TripoSR):** o script `ai/image_to_3d.py` usa o código do TripoSR (GitHub, licença MIT). Neste
  ambiente, a execução de código de terceiros baixado do GitHub foi bloqueada pela política de segurança até o dono do
  projeto autorizar; por isso ele **ainda não foi validado**. Para ligar depois da autorização:
  `git clone https://github.com/VAST-AI-Research/TripoSR ai/vendor/TripoSR` (commit `107cefd`), baixar
  `stabilityai/TripoSR` em `ai/models/triposr/` e rodar o processador com `AI_3D_ENGINE=triposr`.
  Qualidade esperada: média (usa uma foto só; o que a foto não mostra é estimado).
- **Na nuvem (melhor qualidade, usa 3 a 4 fotos):** Tripo multiview pela fal.ai (~US$ 0,30–0,40 por modelo). Precisa
  da chave `FAL_KEY`; ver [`PROXIMA-FASE-IA-3D.md`](PROXIMA-FASE-IA-3D.md).

Enquanto isso, o painel avisa que o gerador 3D não está habilitado e aceita um `.glb` enviado à mão na seção de mídia.

## Fotos de catálogo: a IA recria a cena (padrão da loja)

Problema que resolve: o vendedor fotografa de qualquer jeito — torto, de um ângulo ruim, com uma peça escondida ou um
pouco borrado. A limpeza de fundo só recorta o que está na foto (se o braço da poltrona some num recorte, ele continua
faltando). As **fotos de catálogo** recriam a cena:

- **Sempre os mesmos 4 ângulos** para todos os produtos: frente, ¾ (a foto principal típica de e-commerce), lateral e
  traseira; câmera na altura do meio do objeto, luz de estúdio suave, fundo claro.
- **Referência = todas as fotos reais** do produto (3 a 4 ângulos): o que uma foto esconde, outra mostra.
- **O produto não muda**: mesma forma, proporções, peças, cores, tecido, costuras e acabamento da madeira. Se algo não
  aparece em nenhuma foto, a IA não inventa: a equipe tira outra foto.
- Cada imagem gerada passa pela mesma limpeza e enquadramento das fotos comuns (escala, posição e sombra iguais).
- **Nada vai para a loja sem conferência**: a imagem nasce “aguardando conferência”; alguém compara com as fotos reais
  (lado a lado no painel) e aprova marcando “Conferi: cor, formato, peças e acabamento são iguais”. O banco registra
  quem aprovou e quando (auditoria). Imagem não aprovada não aparece para o público e não pode ser a principal.
- Na loja, essas imagens trazem o aviso discreto “Cena recriada a partir das fotos reais”.

**Estado: funcionando** com a API da OpenAI (`OPENAI_API_KEY` no `.env.local` do processador). Modelo padrão
`gpt-image-2.5-sunburst` (troque com `OPENAI_IMAGE_MODEL`), edição com todas as fotos reais como referência, fundo
transparente, 1536×1024, qualidade alta. Medido com as duas cadeiras reais (28/10/2026): **~40 s por imagem** (2 em
paralelo, ~1,5 min para os 4 ângulos) e **~US$ 0,08 por imagem** (~4,7 mil tokens de entrada + ~1,4 mil de saída) →
**~US$ 0,35 por produto**. Alternativa com a mesma chave da fal.ai do 3D: Nano Banana Pro (~US$ 0,15 por imagem).

Instrução enviada ao modelo (por ângulo; ver `catalogPrompt` em `scripts/ai-worker.mjs`):

> Use the attached photos only as the source of truth for this exact product. Create a professional e-commerce studio
> photograph of the same product: {view}, camera at the product's mid height, 50 mm lens, light grey seamless background,
> soft diffused light, subtle contact shadow, whole product in frame. Preserve exactly its shape, proportions, number and
> position of parts, colors, materials, fabric and stitching pattern, wood grain and finish, wear marks. Do not add,
> remove, repair or redesign anything; no props, text or logos. Straighten the camera and fix blur only.

## Nome e textos da loja com IA

**Funcionando** no painel (seção 5 do estúdio), com a mesma `OPENAI_API_KEY` no servidor do Next.js (modelo padrão
`gpt-5.1`; troque com `OPENAI_TEXT_MODEL`). O ChatGPT recebe as fotos (as aprovadas primeiro) e **só os dados
confirmados** e sugere 3 nomes, descrição curta, descrição completa e textos para o Google. Regras na instrução:
não inventar medidas, materiais, garantia, certificações ou benefícios; o que não foi confirmado é descrito só pela
aparência (ex.: “estrutura em tom de madeira clara”). Se o texto citar um número que não está nos dados confirmados, o
painel avisa antes de aplicar. Nada é salvo sem a pessoa revisar e clicar em “Aplicar ao produto”. Limite: 10 pedidos a
cada 10 minutos por pessoa. Leva ~8 s e custa centavos.

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

## Legendas e descrições com IA

Ainda não ligadas: precisam de uma chave de API (Claude ou OpenAI). Ver [`PROXIMA-FASE-IA-3D.md`](PROXIMA-FASE-IA-3D.md).

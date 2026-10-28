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
- A página do produto mostra a foto principal com o botão **“Carregar visualização 3D”**. Só então são baixados o
  `<model-viewer>` (three.js) e o arquivo (teste E2E garante isso).
- Marque “ilustrativa” se o modelo não for fiel ao produto; a página avisa.
- **Realidade aumentada (“Ver no seu ambiente”)**: no celular, um toque abre a câmera com o produto no chão do
  cliente. Android usa o **Scene Viewer** (app de AR do Google; WebXR como reserva) e iPhone/iPad usa o **AR Quick
  Look** (o `.usdz` é gerado na hora a partir do `.glb`). No computador, a página orienta a abrir no celular. Só
  funciona em HTTPS (Vercel).
- **Tamanho no AR é aproximado**: o Tripo entrega o modelo com 1 m de altura e nenhum produto tem medidas
  confirmadas, então o cliente pode ajustar o tamanho com dois dedos (a página avisa). Para mostrar em tamanho real é
  preciso escalar o `.glb` pelas medidas confirmadas do fabricante.
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

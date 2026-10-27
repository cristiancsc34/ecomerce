#!/usr/bin/env bash
# Prepara o estúdio de IA nesta máquina: ambiente Python (CPU) e modelos abertos.
#
#   npm run ai:setup
#
# Baixa ~1,1 GB (BiRefNet + Depth Anything V2 Small). Nada é enviado para fora:
# os modelos rodam localmente.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -x .venv-ai/bin/python ]; then
  python3 -m venv .venv-ai
fi
.venv-ai/bin/pip install --quiet --upgrade pip
.venv-ai/bin/pip install --quiet torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu
.venv-ai/bin/pip install --quiet -r ai/requirements.txt

.venv-ai/bin/python - <<'PY'
from pathlib import Path
from huggingface_hub import hf_hub_download, snapshot_download

models = Path("ai/models")
# Remoção de fundo — BiRefNet (MIT), exportado para ONNX.
target = models / "birefnet" / "model.onnx"
if not target.exists():
    target.parent.mkdir(parents=True, exist_ok=True)
    path = hf_hub_download("onnx-community/BiRefNet-ONNX", "onnx/model.onnx",
                           revision="534d3c82d3bb8b2f0867db6dfbc3a525b8e42f67", local_dir=models / "birefnet-download")
    Path(path).rename(target)
# Profundidade — Depth Anything V2 Small (Apache-2.0): separa o produto de móveis ao fundo.
snapshot_download("depth-anything/Depth-Anything-V2-Small-hf", revision="5426e4f0f36572d16453bbda7a8389317b1bef99",
                  allow_patterns=["*.json", "*.safetensors"], local_dir=models / "depth-anything-v2-small")
print("Modelos prontos em", models)
PY

echo "Pronto. Rode o processador com: npm run ai:worker"

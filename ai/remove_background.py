"""
Remove o fundo de uma foto de produto e gera duas saídas:

  * recorte PNG com transparência (entrada do gerador 3D);
  * foto "de estúdio" JPEG 4:3 (mesmo formato da galeria da loja), com fundo
    claro e sombra suave, pronta para o catálogo.

Motores (rodam na CPU, nada é enviado para fora):
  * BiRefNet (licença MIT, ONNX) separa objeto e fundo;
  * Depth Anything V2 Small (Apache-2.0) estima a distância de cada pixel. Se a
    máscara pegou também um móvel mais ao fundo (comum em showroom), ele é
    descartado: só fica o objeto mais próximo da câmera.

Uso:
    python ai/remove_background.py <entrada> <recorte.png> <estudio.jpg>

Imprime um JSON com as dimensões e a área ocupada pelo objeto.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent
MODEL_PATH = Path(os.environ.get("BIREFNET_MODEL", ROOT / "models" / "birefnet" / "model.onnx"))
DEPTH_MODEL_PATH = ROOT / "models" / "depth-anything-v2-small"
INPUT_SIZE = 1024
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

STUDIO_SIZE = (1600, 1200)  # 4:3, como a galeria
STUDIO_TOP = (252, 252, 253)
STUDIO_BOTTOM = (236, 239, 243)
MAX_CUTOUT_SIDE = 1024


def load_photo(path: str) -> Image.Image:
    image = Image.open(path)
    image = ImageOps.exif_transpose(image)  # fotos de celular vêm "deitadas" no EXIF
    return image.convert("RGB")


def predict_mask(image: Image.Image) -> Image.Image:
    session = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    x = np.asarray(image.resize((INPUT_SIZE, INPUT_SIZE), Image.BICUBIC), dtype=np.float32) / 255.0
    x = ((x - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)
    logits = session.run(None, {session.get_inputs()[0].name: x})[0][0, 0]
    prob = 1.0 / (1.0 + np.exp(-logits))
    mask = Image.fromarray(np.clip(prob * 255.0, 0, 255).astype(np.uint8))
    return mask.resize(image.size, Image.BICUBIC)


def estimate_depth(image: Image.Image) -> np.ndarray:
    """Profundidade relativa (maior = mais perto da câmera), no tamanho da foto."""
    import torch
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    processor = AutoImageProcessor.from_pretrained(DEPTH_MODEL_PATH)
    model = AutoModelForDepthEstimation.from_pretrained(DEPTH_MODEL_PATH).eval()
    with torch.no_grad():
        predicted = model(**processor(images=image, return_tensors="pt")).predicted_depth
    depth = torch.nn.functional.interpolate(predicted[None], size=image.size[::-1], mode="bicubic", align_corners=False)
    return depth[0, 0].numpy()


def drop_background_objects(image: Image.Image, mask: Image.Image) -> tuple[Image.Image, bool]:
    """
    Se as distâncias dentro da máscara formam dois grupos separados por um vazio
    (o objeto e algo bem atrás dele), descarta o grupo mais distante. Sem vazio
    claro, não mexe em nada: um objeto sozinho tem profundidade contínua.
    """
    if not DEPTH_MODEL_PATH.exists():
        return mask, False
    a = np.asarray(mask)
    solid = a > 127
    depth = estimate_depth(image)
    hist, edges = np.histogram(depth[solid], bins=40)
    empty = hist < hist.max() * 0.02

    best: tuple[int, int] | None = None
    i = 0
    while i < len(hist):
        if empty[i]:
            j = i
            while j + 1 < len(hist) and empty[j + 1]:
                j += 1
            far_share = hist[:i].sum() / hist.sum()
            # vazio de 3+ faixas, com algo antes e o grupo distante sendo minoria
            if j - i + 1 >= 3 and hist[:i].sum() > 0 and far_share < 0.4:
                if best is None or (j - i) > (best[1] - best[0]):
                    best = (i, j)
            i = j + 1
        else:
            i += 1
    if best is None:
        return mask, False

    cut = (edges[best[0]] + edges[best[1] + 1]) / 2
    softness = (edges[1] - edges[0]) * 0.5
    keep = 1.0 / (1.0 + np.exp(-(depth - cut) / softness))
    return Image.fromarray((a * keep).astype(np.uint8)), True


def keep_main_object(mask: Image.Image) -> Image.Image:
    """Descarta manchas soltas longe do objeto principal (restos do cenário)."""
    from scipy import ndimage

    a = np.asarray(mask)
    solid = a > 127
    labels, count = ndimage.label(solid)
    if count == 0:
        return mask
    sizes = ndimage.sum(solid, labels, range(1, count + 1))
    main = int(np.argmax(sizes)) + 1
    keep = sizes >= sizes[main - 1] * 0.08  # partes grandes (ex.: pés separados na imagem) ficam
    keep_mask = np.isin(labels, np.flatnonzero(keep) + 1)
    # Mantém a borda suave (anti-serrilhado) ao redor das partes mantidas.
    grown = ndimage.binary_dilation(keep_mask, iterations=6)
    return Image.fromarray(np.where(grown, a, 0).astype(np.uint8))


def bbox(alpha: np.ndarray, threshold: int = 12) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(alpha > threshold)
    if len(xs) == 0:
        raise SystemExit("Nenhum objeto encontrado na foto.")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def studio(cutout: Image.Image) -> Image.Image:
    w, h = STUDIO_SIZE
    # Fundo: degradê vertical bem suave, do quase branco para um cinza-azulado claro.
    t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    top = np.array(STUDIO_TOP, dtype=np.float32)
    bottom = np.array(STUDIO_BOTTOM, dtype=np.float32)
    bg = np.broadcast_to(top + (bottom - top) * t, (h, w, 3))
    canvas = Image.fromarray(bg.astype(np.uint8)).convert("RGBA")

    # Objeto ocupa até 82% da altura e 86% da largura, apoiado em 90% da altura.
    scale = min(h * 0.82 / cutout.height, w * 0.86 / cutout.width)
    obj = cutout.resize((max(1, round(cutout.width * scale)), max(1, round(cutout.height * scale))), Image.LANCZOS)
    x = (w - obj.width) // 2
    floor = round(h * 0.9)
    y = floor - obj.height

    # Sombra de contato: silhueta achatada e desfocada logo abaixo do objeto.
    alpha = obj.getchannel("A")
    shadow_h = max(8, obj.height // 14)
    contact = alpha.resize((obj.width, shadow_h), Image.BILINEAR)
    shadow = Image.new("L", (w, h), 0)
    shadow.paste(contact, (x, floor - round(shadow_h * 0.8)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(6, obj.height // 45)))
    shadow = shadow.point(lambda v: int(v * 0.42))
    dark = Image.new("RGBA", (w, h), (40, 48, 60, 255))
    canvas = Image.composite(dark, canvas, shadow)

    canvas.alpha_composite(obj, (x, y))
    return canvas.convert("RGB")


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    source, cutout_path, studio_path = sys.argv[1:]

    original = ImageOps.exif_transpose(Image.open(source))
    dropped = False
    if original.mode in ("RGBA", "LA") and original.getchannel("A").getextrema()[0] < 250:
        # Já veio recortada (ex.: foto de catálogo gerada com fundo transparente):
        # só aplica o enquadramento padrão da loja.
        rgba = original.convert("RGBA")
        photo = rgba.convert("RGB")
        mask = rgba.getchannel("A")
    else:
        if not MODEL_PATH.exists():
            raise SystemExit(f"Modelo não encontrado em {MODEL_PATH}. Rode: npm run ai:setup")
        photo = original.convert("RGB")
        mask, dropped = drop_background_objects(photo, predict_mask(photo))
        mask = keep_main_object(mask)
        rgba = photo.copy()
        rgba.putalpha(mask)

    x0, y0, x1, y1 = bbox(np.asarray(mask))
    pad = round(max(x1 - x0, y1 - y0) * 0.02)
    crop = rgba.crop((max(0, x0 - pad), max(0, y0 - pad), min(photo.width, x1 + pad), min(photo.height, y1 + pad)))

    cut = crop.copy()
    cut.thumbnail((MAX_CUTOUT_SIDE, MAX_CUTOUT_SIDE), Image.LANCZOS)
    cut.save(cutout_path, "PNG", optimize=True)

    studio(crop).save(studio_path, "JPEG", quality=90, optimize=True, progressive=True)

    coverage = float((np.asarray(mask) > 127).mean())
    print(json.dumps({
        "width": STUDIO_SIZE[0],
        "height": STUDIO_SIZE[1],
        "coverage": round(coverage, 4),
        "droppedBackgroundObject": dropped,
    }))


if __name__ == "__main__":
    main()

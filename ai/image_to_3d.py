"""
Gera um modelo 3D (.glb) a partir do recorte de uma foto de produto.

ESTADO: ainda não validado — depende do código do TripoSR (GitHub), cuja execução
aguarda autorização do dono do projeto. Ver docs/ESTUDIO-IA.md.

Motor: TripoSR (licença MIT, Stability AI + Tripo AI), rodando na CPU. É um
modelo de "uma foto → 3D": o resultado é uma aproximação (as partes que a foto
não mostra são inferidas). Por isso o painel marca o 3D como ilustrativo até
alguém revisar. Para mais fidelidade, o mesmo passo pode usar um serviço de
várias fotos (ver docs/PROXIMA-FASE-IA-3D.md).

Uso:
    python ai/image_to_3d.py <recorte.png> <saida.glb> [altura_cm]

Se a altura real for informada, o modelo é escalado para ela (em metros, como
o glTF espera); senão, fica com 1 m de altura.
"""

from __future__ import annotations

import json
import sys
import time
import types
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
TRIPOSR_SRC = ROOT / "vendor" / "TripoSR"
TRIPOSR_WEIGHTS = ROOT / "models" / "triposr"
TARGET_FACES = 60_000
MC_RESOLUTION = 256


def install_shims() -> None:
    """
    O código do TripoSR importa pacotes que não usamos aqui (rembg, imageio) e
    o torchmcubes (extensão C++ difícil de instalar). Trocamos este último pelo
    PyMCubes, que faz o mesmo marching cubes na CPU.
    """
    import mcubes
    import torch

    sys.modules.setdefault("rembg", types.ModuleType("rembg"))
    sys.modules.setdefault("imageio", types.ModuleType("imageio"))

    shim = types.ModuleType("torchmcubes")

    def marching_cubes(volume, threshold):
        verts, faces = mcubes.marching_cubes(volume.detach().cpu().numpy(), float(threshold))
        # torchmcubes devolve (x, y, z) na ordem inversa dos eixos do volume.
        verts = np.ascontiguousarray(verts[:, ::-1])
        return torch.from_numpy(verts.astype(np.float32)), torch.from_numpy(faces.astype(np.int64))

    shim.marching_cubes = marching_cubes
    sys.modules["torchmcubes"] = shim
    sys.path.insert(0, str(TRIPOSR_SRC))


def prepare_input(cutout_path: str):
    from PIL import Image
    from tsr.utils import resize_foreground

    image = Image.open(cutout_path).convert("RGBA")
    image = resize_foreground(image, 0.85)
    a = np.asarray(image).astype(np.float32) / 255.0
    rgb = a[:, :, :3] * a[:, :, 3:4] + (1 - a[:, :, 3:4]) * 0.5  # fundo cinza, como no treino
    return Image.fromarray((rgb * 255.0).astype(np.uint8))


def simplify(mesh):
    """Reduz a malha para carregar rápido no celular, mantendo as cores."""
    import fast_simplification
    import trimesh
    from scipy.spatial import cKDTree

    if len(mesh.faces) <= TARGET_FACES:
        return mesh
    ratio = 1.0 - TARGET_FACES / len(mesh.faces)
    points, faces = fast_simplification.simplify(
        np.asarray(mesh.vertices, dtype=np.float32), np.asarray(mesh.faces, dtype=np.int64), target_reduction=ratio
    )
    colors = np.asarray(mesh.visual.vertex_colors)
    _, nearest = cKDTree(mesh.vertices).query(points)
    return trimesh.Trimesh(vertices=points, faces=faces, vertex_colors=colors[nearest], process=True)


def main() -> None:
    if len(sys.argv) not in (3, 4):
        raise SystemExit(__doc__)
    cutout_path, output_path = sys.argv[1], sys.argv[2]
    height_m = float(sys.argv[3]) / 100.0 if len(sys.argv) == 4 and float(sys.argv[3]) > 0 else 1.0
    if not (TRIPOSR_WEIGHTS / "model.ckpt").exists() or not TRIPOSR_SRC.exists():
        raise SystemExit("TripoSR não instalado. Rode: npm run ai:setup")

    started = time.time()
    install_shims()
    import torch
    import trimesh
    from tsr.system import TSR
    from tsr.utils import to_gradio_3d_orientation

    torch.set_num_threads(max(1, torch.get_num_threads()))
    model = TSR.from_pretrained(str(TRIPOSR_WEIGHTS), config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(8192)
    model.to("cpu")

    image = prepare_input(cutout_path)
    with torch.no_grad():
        scene_codes = model([image], device="cpu")
    mesh = model.extract_mesh(scene_codes, True, resolution=MC_RESOLUTION)[0]

    # Só a maior peça (descarta "poeira" solta), normais para fora, eixo Y para cima (glTF).
    parts = mesh.split(only_watertight=False)
    if len(parts) > 1:
        mesh = max(parts, key=lambda m: len(m.faces))
    mesh = to_gradio_3d_orientation(mesh)
    trimesh.repair.fix_normals(mesh)
    mesh = simplify(mesh)

    # Apoia no chão, centraliza e escala para a altura real (ou 1 m).
    bounds = mesh.bounds
    mesh.apply_translation([-(bounds[0][0] + bounds[1][0]) / 2, -bounds[0][1], -(bounds[0][2] + bounds[1][2]) / 2])
    mesh.apply_scale(height_m / (bounds[1][1] - bounds[0][1]))

    mesh.visual.material = trimesh.visual.material.PBRMaterial(
        name="produto", baseColorFactor=[1.0, 1.0, 1.0, 1.0], metallicFactor=0.0, roughnessFactor=0.85
    )
    glb = trimesh.exchange.gltf.export_glb(trimesh.Scene(mesh))
    Path(output_path).write_bytes(glb)

    size = mesh.bounds[1] - mesh.bounds[0]
    print(json.dumps({
        "faces": int(len(mesh.faces)),
        "bytes": len(glb),
        "sizeMeters": [round(float(v), 3) for v in size],
        "seconds": round(time.time() - started, 1),
    }))


if __name__ == "__main__":
    main()

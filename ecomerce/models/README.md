# Modelos 3D — "Ver no seu ambiente"

Os produtos com o campo `model3d` (em `index.html`) ganham o botão **📱 Ver no seu ambiente**.
O cliente gira o produto em 3D e, no celular, abre a câmera para posicionar o produto em tamanho real:

| Aparelho | Tecnologia usada |
| --- | --- |
| Android com Chrome (ARCore) | WebXR (dentro da página, com botão "Adicionar ao carrinho" na câmera) ou Scene Viewer |
| iPhone / iPad | AR Quick Look (o arquivo USDZ é gerado automaticamente a partir do GLB) |
| Computador | Visualização 3D + QR code para abrir no celular |

> O AR só funciona em HTTPS (Vercel, GitHub Pages etc.). Abrindo o arquivo localmente, só o 3D funciona.

## Como adicionar 3D a um produto

1. Coloque o arquivo `.glb` nesta pasta (um arquivo por cor).
2. No produto, adicione:

```js
model3d: {
    placement: "floor",            // "floor" (chão/mesa) ou "wall" (quadros, prateleiras)
    dimensions: { width: 83, height: 69, depth: 57 }, // em cm, só para exibição
    variants: [
        { name: "Azul Pavão", swatch: "#16697a", src: "models/poltrona-sheen-azul.glb" },
        { name: "Mostarda",   swatch: "#d39b1f", src: "models/poltrona-sheen-mostarda.glb" }
    ]
}
```

## Requisitos do arquivo GLB (para ficar fluido)

- **Escala real em metros**: 1 unidade = 1 metro. É o que garante o tamanho real no AR.
- **Até ~3 MB** por arquivo; texturas de até 2048 px, em JPEG quando não houver transparência.
- **Um GLB por cor**, com a cor já aplicada. O AR nativo do Android abre o arquivo direto, então
  a troca de cor precisa estar no próprio arquivo.
- Evite compressão Draco/Meshopt e texturas KTX2/WebP: nem todo app de AR nativo lê esses formatos.

## Créditos

- `poltrona-sheen-*.glb`: "Sheen Chair", do [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair)
  (CC0 1.0, artista Eric Chadwick, © Wayfair LLC). Cada variante de cor foi exportada como um arquivo separado
  com texturas otimizadas (4,1 MB → 1,8 MB).

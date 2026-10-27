import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, sniffMediaType, validateMediaUpload } from "@/lib/media/validate";

/** PNG mínimo válido (cabeçalho IHDR) com as dimensões pedidas. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  const dv = new DataView(bytes.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  return bytes;
}

function withAscii(prefix: number[], ascii: string, at: number, length = 32) {
  const b = new Uint8Array(length);
  b.set(prefix, 0);
  for (let i = 0; i < ascii.length; i++) b[at + i] = ascii.charCodeAt(i);
  return b;
}

describe("identificação pelo conteúdo", () => {
  it("reconhece os formatos permitidos", () => {
    expect(sniffMediaType(png(800, 600))?.mime).toBe("image/png");
    expect(sniffMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(20).fill(0)]))?.mime).toBe("image/jpeg");
    expect(sniffMediaType(withAscii([], "RIFF\0\0\0\0WEBP", 0))?.mime).toBe("image/webp");
    expect(sniffMediaType(withAscii([], "\0\0\0\x1cftypavif", 0))?.mime).toBe("image/avif");
    expect(sniffMediaType(withAscii([], "\0\0\0\x18ftypisom", 0))?.mime).toBe("video/mp4");
    expect(sniffMediaType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new Array(20).fill(0)]))?.mime).toBe("video/webm");
  });

  it("reconhece o GLB de demonstração", () => {
    const glb = new Uint8Array(readFileSync(new URL("../../public/demo/poltrona-azul.glb", import.meta.url)));
    expect(sniffMediaType(glb)).toEqual({ mime: "model/gltf-binary", ext: "glb", kind: "model_3d" });
  });

  it("recusa SVG, HTML, executáveis e PDF", () => {
    expect(sniffMediaType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffMediaType(new TextEncoder().encode("<!doctype html><html><body>oi</body></html>"))).toBeNull();
    expect(sniffMediaType(new Uint8Array([0x4d, 0x5a, ...new Array(30).fill(0)]))).toBeNull();
    expect(sniffMediaType(new TextEncoder().encode("%PDF-1.7 ........................"))).toBeNull();
  });
});

describe("validação de upload", () => {
  it("aceita imagem válida e lê as dimensões", () => {
    const r = validateMediaUpload({ name: "foto.PNG", size: 64, bytes: png(1600, 1200) });
    expect(r).toEqual({ ok: true, media: { mime: "image/png", ext: "png", kind: "image", sizeBytes: 64, width: 1600, height: 1200 } });
  });

  it("recusa extensão que não corresponde ao conteúdo (ex.: script renomeado)", () => {
    const r = validateMediaUpload({ name: "foto.jpg", size: 64, bytes: png(1600, 1200) });
    expect(r.ok).toBe(false);
  });

  it("recusa imagem pequena demais ou grande demais", () => {
    expect(validateMediaUpload({ name: "a.png", size: 64, bytes: png(300, 300) }).ok).toBe(false);
    expect(validateMediaUpload({ name: "a.png", size: 64, bytes: png(9000, 5000) }).ok).toBe(false);
  });

  it("recusa arquivo acima de 4 MB e vazio", () => {
    expect(validateMediaUpload({ name: "a.png", size: MAX_UPLOAD_BYTES + 1, bytes: png(1600, 1200) }).ok).toBe(false);
    expect(validateMediaUpload({ name: "a.png", size: 0, bytes: new Uint8Array() }).ok).toBe(false);
  });

  it("recusa SVG mesmo com extensão de imagem", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>          ');
    expect(validateMediaUpload({ name: "a.svg", size: svg.length, bytes: svg }).ok).toBe(false);
  });
});

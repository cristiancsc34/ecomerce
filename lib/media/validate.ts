import { imageSize } from "image-size";
import type { MediaType } from "@/lib/catalog/types";

/** Limite por arquivo. A Vercel limita o corpo das funções a 4,5 MB. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MIN_IMAGE_SIDE = 400;
export const MAX_IMAGE_SIDE = 8000;

type Detected = { mime: string; ext: string; kind: MediaType };

const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
  "video/mp4": ["mp4"],
  "video/webm": ["webm"],
  "model/gltf-binary": ["glb"],
};

export const ACCEPT_ATTRIBUTE =
  "image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,model/gltf-binary,.glb";

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/**
 * Identifica o tipo pelo conteúdo ("magic bytes"), ignorando o que o navegador
 * declarou. Retorna null para qualquer coisa fora da lista permitida.
 */
export function sniffMediaType(bytes: Uint8Array): Detected | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg", kind: "image" };
  }
  if (
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png", kind: "image" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { mime: "image/webp", ext: "webp", kind: "image" };
  }
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (brand === "avif" || brand === "avis") return { mime: "image/avif", ext: "avif", kind: "image" };
    if (["isom", "iso2", "mp41", "mp42", "avc1", "dash", "M4V "].includes(brand)) {
      return { mime: "video/mp4", ext: "mp4", kind: "video" };
    }
    return null;
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { mime: "video/webm", ext: "webm", kind: "video" };
  }
  if (ascii(bytes, 0, 4) === "glTF") {
    const version = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
    if (version === 2) return { mime: "model/gltf-binary", ext: "glb", kind: "model_3d" };
  }
  return null;
}

export type ValidatedMedia = Detected & {
  sizeBytes: number;
  width: number | null;
  height: number | null;
};

export type MediaValidationResult = { ok: true; media: ValidatedMedia } | { ok: false; error: string };

/**
 * Valida um upload: tamanho, extensão coerente com o conteúdo, tipo permitido
 * e, para imagens, dimensões legíveis e dentro dos limites.
 */
export function validateMediaUpload(file: { name: string; size: number; bytes: Uint8Array }): MediaValidationResult {
  if (file.size <= 0 || file.bytes.length === 0) return { ok: false, error: "O arquivo está vazio." };
  if (file.size > MAX_UPLOAD_BYTES || file.bytes.length > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "O arquivo passa de 4 MB. Comprima a imagem ou o vídeo e tente de novo." };
  }

  const detected = sniffMediaType(file.bytes);
  if (!detected) {
    return { ok: false, error: "Formato não permitido. Use JPG, PNG, WebP, AVIF, MP4, WebM ou GLB." };
  }

  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!ALLOWED_EXTENSIONS[detected.mime].includes(ext)) {
    return { ok: false, error: `A extensão “.${ext}” não corresponde ao conteúdo do arquivo (${detected.ext.toUpperCase()}).` };
  }

  let width: number | null = null;
  let height: number | null = null;
  if (detected.kind === "image") {
    try {
      const size = imageSize(file.bytes);
      width = size.width ?? null;
      height = size.height ?? null;
    } catch {
      return { ok: false, error: "Não foi possível ler a imagem. O arquivo pode estar corrompido." };
    }
    if (!width || !height) return { ok: false, error: "Não foi possível ler as dimensões da imagem." };
    if (Math.min(width, height) < MIN_IMAGE_SIDE) {
      return { ok: false, error: `Imagem pequena demais (${width}×${height}). Use pelo menos ${MIN_IMAGE_SIDE} px no menor lado.` };
    }
    if (Math.max(width, height) > MAX_IMAGE_SIDE) {
      return { ok: false, error: `Imagem grande demais (${width}×${height}). O limite é ${MAX_IMAGE_SIDE} px.` };
    }
  }

  return { ok: true, media: { ...detected, sizeBytes: file.bytes.length, width, height } };
}

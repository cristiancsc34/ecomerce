import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_IMAGE_MODEL, openaiRecolorEngine } from "@/scripts/ai-pipeline.mjs";

/**
 * TEMPORÁRIO — cores de exemplo da Poltrona Azul (dado de demonstração, só aparece no ambiente de desenvolvimento).
 *
 * A chave da OpenAI só existe no servidor da loja (Vercel, produção). Esta rota deixa o script
 * `npm run demo:variantes:gpt` pedir ao GPT, com essa chave, a foto de catálogo da Poltrona Azul numa das 4 cores de
 * exemplo, e devolve a imagem gerada. A chave nunca sai do servidor. O script tira dessa imagem só o tom da cor; a foto
 * que vai para o site continua sendo a original com o tecido repintado.
 *
 * Proteções:
 * - fecha sozinha depois de `CORES_EXEMPLO_ABERTA_ATE`;
 * - só aceita a senha cuja impressão digital (SHA-256) está abaixo; a senha não está no código;
 * - não aceita outra foto, outra cor nem outra instrução: a foto é a de catálogo do site, a instrução é a de troca de
 *   cor (`recolorPrompt`) e a cor sai da lista fixa.
 */
export const CORES_EXEMPLO_ABERTA_ATE = Date.parse("2026-11-08T23:59:59-03:00");
const SENHA_SHA256 = "cb0766f5b83315c0fb53c9ceda0a8ce1afa9d0e187cd0591eae613cba38093eb";

/** As mesmas cores de scripts/gerar-variantes-exemplo.mjs (a azul é a original e não passa pelo GPT). */
export const CORES_EXEMPLO = {
  marrom: { name: "marrom", hex: "#6B4A35" },
  branco: { name: "branco", hex: "#ECE7DE" },
  vermelho: { name: "vermelho", hex: "#9C2A2A" },
  bege: { name: "bege", hex: "#CDB797" },
} as const;
const VISTAS = ["frente", "tres-quartos", "lateral", "traseira"] as const;

type Engine = { recolor(inputFile: string, colorName: string, hex: string, output: string): Promise<unknown> };
type Options = {
  now?: number;
  env?: NodeJS.ProcessEnv;
  senhaSha256?: string;
  /** Busca a foto de catálogo (padrão: o arquivo público do próprio site). */
  fetchPhoto?: (url: URL) => Promise<Response>;
  engine?: Engine;
};

const json = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

function authorized(request: Request, senhaSha256: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const given = createHash("sha256").update(header.slice(7)).digest();
  const expected = Buffer.from(senhaSha256, "hex");
  return expected.length === given.length && timingSafeEqual(given, expected);
}

/** Tipo da imagem pelos primeiros bytes (a OpenAI devolve JPEG; PNG por garantia). */
const imageType = (bytes: Buffer) => (bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : "image/jpeg");

export async function coresExemploResponse(request: Request, options: Options = {}): Promise<Response> {
  const { now = Date.now(), env = process.env, senhaSha256 = SENHA_SHA256, fetchPhoto = (url) => fetch(url) } = options;
  if (now > CORES_EXEMPLO_ABERTA_ATE) return json(404, "Rota encerrada.");
  if (!authorized(request, senhaSha256)) return json(401, "Não autorizado.");

  const body = (await request.json().catch(() => null)) as { cor?: unknown; vista?: unknown } | null;
  const cor = typeof body?.cor === "string" && Object.hasOwn(CORES_EXEMPLO, body.cor) ? CORES_EXEMPLO[body.cor as keyof typeof CORES_EXEMPLO] : null;
  const vista = VISTAS.find((v) => v === body?.vista) ?? null;
  if (!cor || !vista) return json(400, "Cor ou vista inválida.");
  if (!env.OPENAI_API_KEY) return json(503, "OPENAI_API_KEY não está configurada no servidor.");

  const photo = await fetchPhoto(new URL(`/demo/poltrona-azul-${vista}.jpg`, request.url)).catch(() => null);
  if (!photo?.ok) return json(502, "Não foi possível ler a foto de catálogo.");

  const dir = await mkdtemp(path.join(tmpdir(), "cuxoes-cores-"));
  try {
    const input = path.join(dir, `poltrona-azul-${vista}.jpg`);
    const output = path.join(dir, "gerada.jpg");
    await writeFile(input, Buffer.from(await photo.arrayBuffer()));
    const engine = options.engine ?? openaiRecolorEngine(env.OPENAI_API_KEY, env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL);
    await engine.recolor(input, cor.name, cor.hex, output);
    const bytes = await readFile(output);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": imageType(bytes), "Cache-Control": "no-store" },
    });
  } catch (e) {
    // Vai curta para o script registrar no relatório, sem nenhum pedaço de chave (a OpenAI cita a chave mascarada).
    const message = (e instanceof Error ? e.message : String(e)).replace(/sk-[\w*-]+/g, "sk-…");
    return json(502, message.slice(0, 300));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

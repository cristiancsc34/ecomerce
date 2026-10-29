import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloudAiConfig, needsCloudRun } from "@/lib/ai-cloud/config";
import { runCloudQueue } from "@/lib/ai-cloud/runner";
import { BACKGROUNDS, FAL_BIREFNET_URL, composeStudio, falBackgroundEngine } from "../../scripts/ai-background.mjs";
import { openaiCleanupEngine, processJob } from "../../scripts/ai-pipeline.mjs";
import { detectEngines } from "../../scripts/ai-worker.mjs";

vi.mock("@/scripts/ai-pipeline.mjs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/ai-pipeline.mjs")>()),
  processJob: vi.fn(),
}));
const fakeDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => fakeDb.current }));

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const without = (vars: Record<string, string>, key: string) => Object.fromEntries(Object.entries(vars).filter(([k]) => k !== key));

/** Poltrona de mentira: corpo + 2 pés, sobre fundo transparente, com uma mancha solta no canto. */
function fakeCutout({ stray = true } = {}) {
  const width = 600;
  const height = 800;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      data.set([46, 110, 158], p);
      const body = x > 150 && x < 450 && y > 200 && y < 650;
      const legs = (x > 160 && x < 180) || (x > 420 && x < 440) ? y >= 650 && y < 725 : false;
      const spot = stray && x > 20 && x < 35 && y > 20 && y < 35;
      data[p + 3] = body || legs || spot ? 255 : 0;
    }
  }
  return { data, width, height };
}

const pixel = async (jpeg: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const p = (y * info.width + x) * info.channels;
  return [...data.subarray(p, p + 3)];
};

describe("limpeza na nuvem: enquadramento padrão da loja (igual ao Python)", () => {
  it("gera a foto de estúdio 1600×1200 com fundo creme, sombra embaixo e sem as manchas soltas", async () => {
    const out = await composeStudio(fakeCutout());
    const studio = await sharp(out.studio).metadata();
    expect([studio.format, studio.width, studio.height]).toEqual(["jpeg", 1600, 1200]);

    // Recorte: só o objeto (a mancha do canto saiu do enquadramento), no máximo 1024 px.
    const cutout = await sharp(out.cutout).metadata();
    expect(cutout.format).toBe("png");
    expect(cutout.hasAlpha).toBe(true);
    expect(Math.max(cutout.width!, cutout.height!)).toBeLessThanOrEqual(1024);
    expect(cutout.width! / cutout.height!).toBeCloseTo(300 / 525, 1);

    const top = await pixel(out.studio, 5, 5);
    top.forEach((c, i) => expect(Math.abs(c - BACKGROUNDS.creme.top[i])).toBeLessThanOrEqual(3));
    // Entre os pés, logo acima da linha do chão (90% da altura), a sombra escurece o fundo.
    const shadow = await pixel(out.studio, 800, 1060);
    const floor = await pixel(out.studio, 100, 1060);
    expect(shadow[0]).toBeLessThan(floor[0] - 30);
  });

  it("imagem sem nenhum objeto: avisa em vez de gerar foto vazia", async () => {
    const empty = { data: Buffer.alloc(40 * 40 * 4), width: 40, height: 40 };
    await expect(composeStudio(empty)).rejects.toThrow("Nenhum objeto encontrado na foto.");
  });
});

describe("limpeza na nuvem: API da fal.ai", () => {
  const dir = () => mkdtempSync(path.join(tmpdir(), "limpeza-fal-"));

  it("manda a foto para o BiRefNet com a chave e monta a foto de estúdio com o recorte devolvido", async () => {
    const folder = dir();
    const photo = path.join(folder, "celular.jpg");
    writeFileSync(photo, await sharp({ create: { width: 600, height: 800, channels: 3, background: "#8a7f70" } }).jpeg().toBuffer());
    const { data, width, height } = fakeCutout({ stray: false });
    const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const fetchImpl = vi.fn(async () => Response.json({ image: { url: `data:image/png;base64,${png.toString("base64")}` } }));

    const result = await falBackgroundEngine("chave-teste", { fetchImpl }).backgroundRemoval(photo, folder);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(FAL_BIREFNET_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Key chave-teste");
    const body = JSON.parse(String(init.body));
    expect(body.image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(body).toMatchObject({ output_format: "png", sync_mode: true });
    expect(result.meta).toMatchObject({ width: 1600, height: 1200, engine: "fal" });
    expect((await sharp(readFileSync(result.studio)).metadata()).format).toBe("jpeg");
    expect((await sharp(readFileSync(result.cutout)).metadata()).hasAlpha).toBe(true);
  });

  it("foto que já veio recortada (fotos de catálogo): só enquadra, sem gastar a API", async () => {
    const folder = dir();
    const { data, width, height } = fakeCutout();
    const file = path.join(folder, "catalogo-frente.png");
    writeFileSync(file, await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer());
    const fetchImpl = vi.fn();
    const result = await falBackgroundEngine("chave-teste", { fetchImpl }).backgroundRemoval(file, folder, { fundo: "neutro" });
    expect(fetchImpl).not.toHaveBeenCalled();
    const top = await pixel(readFileSync(result.studio), 5, 5);
    top.forEach((c, i) => expect(Math.abs(c - BACKGROUNDS.neutro.top[i])).toBeLessThanOrEqual(3));
  });

  it("sem a chave da fal.ai, uma foto comum não é mandada para fora e o erro explica", async () => {
    const folder = dir();
    const photo = path.join(folder, "celular.jpg");
    writeFileSync(photo, await sharp({ create: { width: 50, height: 50, channels: 3, background: "#888" } }).jpeg().toBuffer());
    const fetchImpl = vi.fn();
    await expect(falBackgroundEngine("", { fetchImpl }).backgroundRemoval(photo, folder)).rejects.toThrow("Falta a chave da fal.ai");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("chave errada: o erro diz o que conferir", async () => {
    const folder = dir();
    const photo = path.join(folder, "celular.jpg");
    writeFileSync(photo, await sharp({ create: { width: 50, height: 50, channels: 3, background: "#888" } }).jpeg().toBuffer());
    const fetchImpl = vi.fn(async () => Response.json({ detail: "Unauthorized" }, { status: 401 }));
    await expect(falBackgroundEngine("errada", { fetchImpl }).backgroundRemoval(photo, folder)).rejects.toThrow(
      "fal.ai: chave inválida. Confira a FAL_KEY.",
    );
  });

  it("o processador local usa a fal.ai quando não tem o BiRefNet instalado", () => {
    const root = mkdtempSync(path.join(tmpdir(), "motores-"));
    expect(detectEngines(root, env({ FAL_KEY: "x" })).background_removal).toBe("fal.ai BiRefNet (API)");
    expect(detectEngines(root, env({})).background_removal).toBeUndefined();
  });
});

describe("limpeza com o ChatGPT", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("manda a foto em pé, em qualidade média, e enquadra o recorte devolvido no padrão da loja", async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "limpeza-chatgpt-"));
    const photo = path.join(folder, "entrada.jpg");
    writeFileSync(photo, await sharp({ create: { width: 900, height: 1600, channels: 3, background: "#8a7f70" } }).jpeg().toBuffer());
    const { data, width, height } = fakeCutout({ stray: false });
    const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const fetch = vi.fn(async () => Response.json({ data: [{ b64_json: png.toString("base64") }] }));
    vi.stubGlobal("fetch", fetch);

    const result = await openaiCleanupEngine("k", "m").backgroundRemoval(photo, folder);

    expect(fetch).toHaveBeenCalledTimes(1);
    const form = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect([form.get("size"), form.get("quality"), form.get("background")]).toEqual(["1024x1536", "medium", "transparent"]);
    expect(String(form.get("prompt"))).toMatch(/Do not add, remove, repair, restyle or redesign anything/);
    expect(result.meta).toMatchObject({ width: 1600, height: 1200, engine: "chatgpt" });
    expect((await sharp(readFileSync(result.studio)).metadata()).format).toBe("jpeg");
  });

  it("foto de catálogo já recortada: só enquadra, sem chamar o ChatGPT", async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "limpeza-chatgpt-"));
    const { data, width, height } = fakeCutout();
    const file = path.join(folder, "catalogo.png");
    writeFileSync(file, await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer());
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await openaiCleanupEngine("k", "m").backgroundRemoval(file, folder);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("IA na nuvem: configuração", () => {
  const all = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "s", FAL_KEY: "f", OPENAI_API_KEY: "o", TRIPO_API_KEY: "t" };

  it("sem chaves: nada liga e o painel mostra o que falta cadastrar", () => {
    expect(cloudAiConfig(env({ NEXT_PUBLIC_SUPABASE_URL: all.NEXT_PUBLIC_SUPABASE_URL }))).toEqual({
      engines: {},
      missing: ["SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "TRIPO_API_KEY"],
    });
  });

  it("sem a chave de serviço do Supabase, as outras chaves sozinhas não ligam nada", () => {
    expect(cloudAiConfig(env(without(all, "SUPABASE_SERVICE_ROLE_KEY")))).toEqual({ engines: {}, missing: ["SUPABASE_SERVICE_ROLE_KEY"] });
  });

  it("só com a chave da OpenAI, a limpeza é feita pelo ChatGPT (a fal.ai é opcional)", () => {
    const config = cloudAiConfig(env(without(without(all, "FAL_KEY"), "TRIPO_API_KEY")));
    expect(config.engines.background_removal).toBe("ChatGPT gpt-image-2.5-sunburst (nuvem)");
    expect(config.missing).toEqual(["TRIPO_API_KEY"]);
    expect(cloudAiConfig(env(all)).engines.background_removal).toBe("fal.ai BiRefNet (nuvem)");
  });

  it("cada chave liga a sua etapa", () => {
    const config = cloudAiConfig(env(without(all, "TRIPO_API_KEY")));
    expect(Object.keys(config.engines)).toEqual(["background_removal", "catalog_photos"]);
    expect(config.missing).toEqual(["TRIPO_API_KEY"]);
    expect(Object.keys(cloudAiConfig(env(all)).engines)).toEqual(["background_removal", "catalog_photos", "model_3d"]);
  });

  it("AI_CLOUD=0 desliga a nuvem (só o processador local)", () => {
    expect(cloudAiConfig(env({ ...all, AI_CLOUD: "0" }))).toEqual({ engines: {}, missing: [] });
  });

  it("só aciona a nuvem com tarefa na fila que ela sabe fazer, ou presa no meio", () => {
    const config = cloudAiConfig(env({ ...all, TRIPO_API_KEY: "" }));
    const now = Date.parse("2026-10-29T12:00:00Z");
    const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();
    expect(needsCloudRun([{ kind: "background_removal", status: "queued", startedAt: null }], config, now)).toBe(true);
    expect(needsCloudRun([{ kind: "model_3d", status: "queued", startedAt: null }], config, now)).toBe(false);
    expect(needsCloudRun([{ kind: "catalog_photos", status: "running", startedAt: minutesAgo(2) }], config, now)).toBe(false);
    expect(needsCloudRun([{ kind: "catalog_photos", status: "running", startedAt: minutesAgo(9) }], config, now)).toBe(true);
    expect(needsCloudRun([{ kind: "background_removal", status: "succeeded", startedAt: minutesAgo(1) }], config, now)).toBe(false);
  });
});

describe("IA na nuvem: fila", () => {
  type Job = { id: string; kind: string };
  let queue: Job[];
  let updates: { values: Record<string, unknown>; filters: unknown[][] }[];
  let claimed: string[][];

  beforeEach(() => {
    vi.stubEnv("AI_CLOUD", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s");
    vi.stubEnv("FAL_KEY", "f");
    vi.stubEnv("OPENAI_API_KEY", "o");
    vi.stubEnv("TRIPO_API_KEY", "t");
    queue = [];
    updates = [];
    claimed = [];
    const query = () => {
      const entry = { values: {} as Record<string, unknown>, filters: [] as unknown[][] };
      const chain = {
        select: () => chain,
        update: (values: Record<string, unknown>) => {
          entry.values = values;
          updates.push(entry);
          return chain;
        },
        eq: (...f: unknown[]) => (entry.filters.push(["eq", ...f]), chain),
        lt: (...f: unknown[]) => (entry.filters.push(["lt", ...f]), chain),
        then: (resolve: (r: unknown) => void) => resolve({ data: [], error: null }),
      };
      return chain;
    };
    fakeDb.current = {
      from: query,
      rpc: async (_fn: string, { p_kinds }: { p_kinds: string[] }) => {
        claimed.push(p_kinds);
        const i = queue.findIndex((j) => p_kinds.includes(j.kind));
        return { data: i < 0 ? [] : queue.splice(i, 1), error: null };
      },
    };
    vi.mocked(processJob).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("processa a fila inteira e marca as tarefas presas no meio como falha (sem gastar de novo)", async () => {
    queue = [
      { id: "1", kind: "background_removal" },
      { id: "2", kind: "background_removal" },
    ];
    vi.mocked(processJob).mockResolvedValue("succeeded");
    const done = await runCloudQueue();
    expect(done.map((d) => [d.id, d.status])).toEqual([
      ["1", "succeeded"],
      ["2", "succeeded"],
    ]);
    const stale = updates.find((u) => u.filters.some((f) => f[0] === "lt"));
    expect(stale?.values).toMatchObject({ status: "failed" });
    expect(stale?.filters).toContainEqual(["eq", "status", "running"]);
  });

  it("com pouco tempo sobrando, não começa o que não dá para terminar", async () => {
    queue = [{ id: "3d", kind: "model_3d" }];
    const done = await runCloudQueue(100_000);
    expect(done).toEqual([]);
    expect(claimed[0]).toEqual(["background_removal"]);
    expect(processJob).not.toHaveBeenCalled();
  });

  it("tarefa que passa do prazo vira falha com aviso antes de a função acabar", async () => {
    vi.useFakeTimers();
    queue = [{ id: "lenta", kind: "catalog_photos" }];
    vi.mocked(processJob).mockReturnValue(new Promise<"succeeded">(() => {}));
    const run = runCloudQueue(200_000);
    await vi.advanceTimersByTimeAsync(200_000);
    const done = await run;
    expect(done).toEqual([{ id: "lenta", kind: "catalog_photos", status: "timeout" }]);
    const timeout = updates.find((u) => u.filters.some((f) => f[1] === "id" && f[2] === "lenta"));
    expect(timeout?.values).toMatchObject({ status: "failed", error: expect.stringContaining("tempo limite") });
  });
});

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { processJob } from "@/scripts/ai-pipeline.mjs";
import { recolor } from "@/scripts/gerar-variantes-exemplo.mjs";

/** Tarefa color_variant no processador (scripts/ai-pipeline.mjs), com banco e Storage em memória. */

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** O pedaço do cliente do Supabase que o processador usa. */
function fakeSupabase(tables: Tables, files: Map<string, Buffer>, { withoutColors = false } = {}) {
  class Query {
    private op: "select" | "insert" | "update" | "delete" = "select";
    private filters: ((r: Row) => boolean)[] = [];
    private payload: unknown;
    private returning = false;
    private mode: "many" | "single" | "maybe" = "many";
    constructor(private table: string) {}
    select() {
      if (this.op !== "select") this.returning = true;
      return this;
    }
    insert(rows: Row | Row[]) {
      this.op = "insert";
      this.payload = Array.isArray(rows) ? rows : [rows];
      return this;
    }
    update(values: Row) {
      this.op = "update";
      this.payload = values;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    eq(c: string, v: unknown) {
      this.filters.push((r) => r[c] === v);
      return this;
    }
    neq(c: string, v: unknown) {
      this.filters.push((r) => r[c] !== v);
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.filters.push((r) => vs.includes(r[c]));
      return this;
    }
    is(c: string, v: unknown) {
      // Banco sem a migração das Cores: a coluna não existe.
      if (withoutColors && c === "color_job_id") this.missingColumn = true;
      this.filters.push((r) => (r[c] ?? null) === v);
      return this;
    }
    private missingColumn = false;
    not() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    single() {
      this.mode = "single";
      return this;
    }
    maybeSingle() {
      this.mode = "maybe";
      return this;
    }
    // O cliente do Supabase é "aguardável": `await supabase.from(...)...` roda a consulta.
    then<A, B>(resolve: (v: { data: unknown; error: unknown }) => A, reject?: (e: unknown) => B) {
      try {
        return Promise.resolve(this.run()).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    }
    private run() {
      if (this.missingColumn) return { data: null, error: { code: "42703", message: "column product_media.color_job_id does not exist" } };
      const rows = (tables[this.table] ??= []);
      const match = (r: Row) => this.filters.every((f) => f(r));
      if (this.op === "insert") {
        const inserted = (this.payload as Row[]).map((r) => ({ id: randomUUID(), approved_at: null, variant_id: null, ...r }));
        rows.push(...inserted);
        return { data: this.returning ? inserted : null, error: null };
      }
      if (this.op === "update") {
        for (const r of rows.filter(match)) Object.assign(r, this.payload);
        return { data: null, error: null };
      }
      if (this.op === "delete") {
        const removed = rows.filter(match);
        tables[this.table] = rows.filter((r) => !match(r));
        return { data: this.returning ? removed : null, error: null };
      }
      const found = rows.filter(match);
      if (this.mode === "many") return { data: found, error: null };
      if (!found.length && this.mode === "single") return { data: null, error: { message: "não encontrado" } };
      return { data: found[0] ?? null, error: null };
    }
  }
  return {
    from: (table: string) => new Query(table),
    storage: {
      from: () => ({
        download: async (p: string) => (files.has(p) ? { data: new Blob([new Uint8Array(files.get(p)!)]), error: null } : { data: null, error: { message: "sem arquivo" } }),
        upload: async (p: string, bytes: Uint8Array) => {
          files.set(p, Buffer.from(bytes));
          return { error: null };
        },
        remove: async (paths: string[]) => {
          for (const p of paths) files.delete(p);
          return { error: null };
        },
      }),
    },
  };
}

const PRODUCT = "00000000-0000-4000-8000-0000000c0001";
const photo = (view: string) => readFileSync(new URL(`../../public/demo/poltrona-azul-${view}.jpg`, import.meta.url));

function setup() {
  const files = new Map<string, Buffer>();
  const media: Row[] = [];
  for (const [i, [view, label]] of [
    ["frente", "vista frontal"],
    ["lateral", "vista lateral"],
  ].entries()) {
    const path = `products/${PRODUCT}/catalogo-${view}.jpg`;
    files.set(path, photo(view));
    media.push({
      id: randomUUID(),
      product_id: PRODUCT,
      storage_path: path,
      media_type: "image",
      alt_text: `Poltrona Azul, ${label} (imagem de catálogo feita a partir das fotos reais)`,
      sort_order: i,
      is_primary: i === 0,
      ai_generated: true,
      approved_at: "2026-11-05T10:00:00Z",
      variant_id: null,
      color_job_id: null,
      width: 1600,
      height: 1200,
    });
  }
  const tables: Tables = { products: [{ id: PRODUCT, name: "Poltrona Azul", dimensions: {} }], product_media: [...media], ai_jobs: [] };
  // `media`: só as fotos de catálogo (a tabela ganha as fotos de cor).
  return { tables, files, media, db: fakeSupabase(tables, files) };
}

function colorJob(tables: Tables, sources: Row[], colorName = "Marrom", colorHex = "#6B4A35") {
  const job = {
    id: randomUUID(),
    product_id: PRODUCT,
    kind: "color_variant",
    status: "running",
    input_path: sources[0].storage_path,
    params: { colorName, colorHex, sourceMediaIds: sources.map((m) => m.id), views: ["frente", "lateral"] },
    details: {},
  };
  tables.ai_jobs.push(job);
  return job;
}

/** "GPT" de mentira: o recolor por computador na cor pedida (uma foto fiel, como o GPT deveria fazer). */
const gpt = (fail?: (input: string) => boolean) => ({
  recolor: vi.fn(async (input: string, _name: string, hex: string, output: string) => {
    if (fail?.(input)) throw Object.assign(new Error("OpenAI: Rate limit reached"), { status: 429 });
    const { image } = await recolor(await readFile(input), hex);
    await writeFile(output, await image.jpeg({ quality: 88 }).toBuffer());
    return { input_tokens: 10, output_tokens: 20 };
  }),
});

const colorPhotos = (tables: Tables, jobId: string) => tables.product_media.filter((m) => m.color_job_id === jobId);

describe("cores no processador", () => {
  it("gera uma foto por foto de catálogo, ilustrativa, sem aprovação e com a cor medida", async () => {
    const { tables, files, media, db } = setup();
    const job = colorJob(tables, media);
    const engines = gpt();
    expect(await processJob(db, job, engines, { color_variant: "OpenAI (teste)" })).toBe("succeeded");

    expect(engines.recolor).toHaveBeenCalledTimes(2);
    expect(engines.recolor.mock.calls.every((c) => c[1] === "Marrom" && c[2] === "#6B4A35")).toBe(true);
    const rows = colorPhotos(tables, job.id as string);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toMatchObject({ ai_generated: true, is_illustrative: true, is_primary: false, approved_at: null, variant_id: null, media_type: "image", width: 1600, height: 1200 });
      expect(files.has(r.storage_path as string)).toBe(true);
      expect((r.sort_order as number) >= 2).toBe(true);
    }
    expect(rows.map((r) => r.alt_text)).toEqual([
      "Poltrona Azul, vista frontal, na cor Marrom (imagem ilustrativa)",
      "Poltrona Azul, vista lateral, na cor Marrom (imagem ilustrativa)",
    ]);
    const meta = await sharp(files.get(rows[0].storage_path as string)!).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1600, 1200]);

    const done = tables.ai_jobs[0] as { status: string; engine: string; output_media_id: string; details: Record<string, unknown> };
    expect(done.status).toBe("succeeded");
    expect(done.engine).toBe("OpenAI (teste)");
    expect(done.output_media_id).toBe(rows[0].id);
    const details = done.details as { mediaIds: string[]; photos: { sourceMediaId: string; view: string; colorDeltaE: number; warnings: string[] }[]; usage: unknown };
    expect(details.mediaIds).toEqual(rows.map((r) => r.id));
    expect(details.photos.map((p) => [p.sourceMediaId, p.view])).toEqual([
      [media[0].id, "frente"],
      [media[1].id, "lateral"],
    ]);
    expect(details.photos.every((p) => p.warnings.length === 0 && p.colorDeltaE < 10)).toBe(true);
    expect(details.usage).toEqual({ inputTokens: 20, outputTokens: 40 });
  }, 60_000);

  it("pedir a mesma cor de novo troca as fotos dela que ninguém publicou (as publicadas ficam)", async () => {
    const { tables, files, media, db } = setup();
    const first = colorJob(tables, media);
    await processJob(db, first, gpt());
    const [published, unpublished] = colorPhotos(tables, first.id as string);
    published.approved_at = "2026-11-05T11:00:00Z";
    published.variant_id = "variacao-marrom";

    const second = colorJob(tables, media, "marrom");
    await processJob(db, second, gpt());
    expect(colorPhotos(tables, first.id as string).map((m) => m.id)).toEqual([published.id]);
    expect(files.has(unpublished.storage_path as string)).toBe(false);
    expect(colorPhotos(tables, second.id as string)).toHaveLength(2);

    // Outra cor não mexe nas fotos desta.
    const third = colorJob(tables, media, "Vermelho", "#9C2A2A");
    await processJob(db, third, gpt());
    expect(colorPhotos(tables, second.id as string)).toHaveLength(2);
  }, 120_000);

  it("falha no meio: nenhuma foto gravada, nenhum arquivo sobrando, e as fotos anteriores ficam", async () => {
    const { tables, files, media, db } = setup();
    const first = colorJob(tables, media);
    await processJob(db, first, gpt());
    const before = new Set(files.keys());

    const retry = colorJob(tables, media);
    expect(await processJob(db, retry, gpt((input) => input.endsWith("catalogo-2.jpg")))).toBe("failed");
    expect(tables.ai_jobs.find((j) => j.id === retry.id)).toMatchObject({ status: "failed", error: "OpenAI: Rate limit reached" });
    expect(colorPhotos(tables, retry.id as string)).toEqual([]);
    expect(colorPhotos(tables, first.id as string)).toHaveLength(2);
    expect(new Set(files.keys())).toEqual(before);
  }, 120_000);

  it("recusa se uma foto de origem deixou de ser uma foto de catálogo aprovada", async () => {
    const { tables, media, db } = setup();
    media[1].approved_at = null;
    const job = colorJob(tables, media);
    const engines = gpt();
    expect(await processJob(db, job, engines)).toBe("failed");
    expect(tables.ai_jobs[0].error).toBe("Alguma foto de catálogo de origem foi apagada ou mudou. Peça a cor de novo.");
    expect(engines.recolor).not.toHaveBeenCalled();
  });

  it("gerar as fotos de catálogo de novo não apaga as fotos de cor ainda não publicadas", async () => {
    const { tables, files, media, db } = setup();
    const job = colorJob(tables, media);
    await processJob(db, job, gpt());
    // Uma foto de catálogo pendente (da rodada anterior) e a referência do celular.
    tables.product_media.push({ id: randomUUID(), product_id: PRODUCT, storage_path: `products/${PRODUCT}/pendente.jpg`, ai_generated: true, approved_at: null, color_job_id: null, sort_order: 50 });
    files.set(`products/${PRODUCT}/pendente.jpg`, photo("frente"));
    files.set(`products/${PRODUCT}/originais/a.jpg`, photo("frente"));
    tables.ai_jobs.push({ id: randomUUID(), product_id: PRODUCT, kind: "background_removal", status: "succeeded", input_path: `products/${PRODUCT}/originais/a.jpg` });
    const catalog = { id: randomUUID(), product_id: PRODUCT, kind: "catalog_photos", status: "running", input_path: `products/${PRODUCT}/originais/a.jpg`, details: {} };
    tables.ai_jobs.push(catalog);
    const jpg = await sharp(photo("frente")).resize(160, 120).jpeg().toBuffer();
    const png = await sharp(photo("frente")).resize(160, 120).png().toBuffer();
    const engines = {
      catalogPhotos: async (_refs: string[], dir: string) => {
        await writeFile(`${dir}/vista.jpg`, jpg);
        return [{ view: "frente", file: `${dir}/vista.jpg` }];
      },
      backgroundRemoval: async (_file: string, dir: string) => {
        await writeFile(`${dir}/recorte.png`, png);
        await writeFile(`${dir}/estudio.jpg`, jpg);
        return { cutout: `${dir}/recorte.png`, studio: `${dir}/estudio.jpg`, meta: { width: 160, height: 120 } };
      },
    };
    expect(await processJob(db, catalog, engines)).toBe("succeeded");
    expect(tables.product_media.some((m) => m.storage_path === `products/${PRODUCT}/pendente.jpg`)).toBe(false);
    expect(colorPhotos(tables, job.id as string)).toHaveLength(2);
  }, 60_000);

  it("banco ainda sem a migração das Cores: gerar o catálogo de novo continua trocando as fotos pendentes", async () => {
    const files = new Map<string, Buffer>();
    const tables: Tables = { products: [{ id: PRODUCT, name: "Poltrona Azul", dimensions: {} }], product_media: [], ai_jobs: [] };
    const db = fakeSupabase(tables, files, { withoutColors: true });
    tables.product_media.push({ id: randomUUID(), product_id: PRODUCT, storage_path: `products/${PRODUCT}/pendente.jpg`, ai_generated: true, approved_at: null, sort_order: 0 });
    files.set(`products/${PRODUCT}/pendente.jpg`, photo("frente"));
    files.set(`products/${PRODUCT}/originais/a.jpg`, photo("frente"));
    tables.ai_jobs.push({ id: randomUUID(), product_id: PRODUCT, kind: "background_removal", status: "succeeded", input_path: `products/${PRODUCT}/originais/a.jpg` });
    const catalog = { id: randomUUID(), product_id: PRODUCT, kind: "catalog_photos", status: "running", input_path: `products/${PRODUCT}/originais/a.jpg`, details: {} };
    tables.ai_jobs.push(catalog);
    const jpg = await sharp(photo("frente")).resize(160, 120).jpeg().toBuffer();
    const png = await sharp(photo("frente")).resize(160, 120).png().toBuffer();
    const engines = {
      catalogPhotos: async (_refs: string[], dir: string) => {
        await writeFile(`${dir}/vista.jpg`, jpg);
        return [{ view: "frente", file: `${dir}/vista.jpg` }];
      },
      backgroundRemoval: async (_file: string, dir: string) => {
        await writeFile(`${dir}/recorte.png`, png);
        await writeFile(`${dir}/estudio.jpg`, jpg);
        return { cutout: `${dir}/recorte.png`, studio: `${dir}/estudio.jpg`, meta: { width: 160, height: 120 } };
      },
    };
    expect(await processJob(db, catalog, engines)).toBe("succeeded");
    expect(tables.product_media.some((m) => m.storage_path === `products/${PRODUCT}/pendente.jpg`)).toBe(false);
    expect(files.has(`products/${PRODUCT}/pendente.jpg`)).toBe(false);
  }, 60_000);
});

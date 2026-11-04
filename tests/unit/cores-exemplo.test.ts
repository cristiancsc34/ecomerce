import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CORES_EXEMPLO_ABERTA_ATE, coresExemploResponse } from "@/lib/ai/cores-exemplo";
import { siteRecolorEngine } from "@/scripts/gerar-variantes-exemplo.mjs";

const SENHA = "senha-de-teste";
const senhaSha256 = createHash("sha256").update(SENHA).digest("hex");
const FRENTE = readFileSync(new URL("../../public/demo/poltrona-azul-frente.jpg", import.meta.url));
const env = { OPENAI_API_KEY: "chave-de-teste" } as unknown as NodeJS.ProcessEnv;
const now = CORES_EXEMPLO_ABERTA_ATE - 60_000;

/** "GPT" de mentira: devolve a própria foto recebida. */
const fakeEngine = () => ({ recolor: vi.fn(async (input: string, _name: string, _hex: string, output: string) => copyFile(input, output)) });
const fetchPhoto = vi.fn(async (url: URL) => {
  const file = path.join(process.cwd(), "public", url.pathname);
  return new Response(new Uint8Array(readFileSync(file)));
});
const request = (body: unknown, auth = `Bearer ${SENHA}`) =>
  new Request("https://cuxoes.vercel.app/api/interno/cores-exemplo", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("rota temporária das cores de exemplo (GPT com a chave do servidor)", () => {
  it("devolve a foto gerada pelo GPT, com a foto de catálogo do site e a cor da lista", async () => {
    const engine = fakeEngine();
    const res = await coresExemploResponse(request({ cor: "vermelho", vista: "lateral" }), { now, env, senhaSha256, fetchPhoto, engine });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fetchPhoto).toHaveBeenLastCalledWith(new URL("https://cuxoes.vercel.app/demo/poltrona-azul-lateral.jpg"));
    expect(engine.recolor).toHaveBeenCalledWith(expect.stringMatching(/poltrona-azul-lateral\.jpg$/), "vermelho", "#9C2A2A", expect.any(String));
    expect(Buffer.from(await res.arrayBuffer()).equals(readFileSync("public/demo/poltrona-azul-lateral.jpg"))).toBe(true);
  });

  it("sem a senha certa, depois do prazo ou fora da lista, não chama o GPT", async () => {
    const engine = fakeEngine();
    const opts = { now, env, senhaSha256, fetchPhoto, engine };
    const ok = { cor: "marrom", vista: "frente" };
    expect((await coresExemploResponse(request(ok, ""), opts)).status).toBe(401);
    expect((await coresExemploResponse(request(ok, "Bearer outra"), opts)).status).toBe(401);
    expect((await coresExemploResponse(request(ok, SENHA), opts)).status).toBe(401);
    expect((await coresExemploResponse(request(ok), { ...opts, now: CORES_EXEMPLO_ABERTA_ATE + 1 })).status).toBe(404);
    // A senha de verdade não é a de teste (a impressão digital do código é outra).
    expect((await coresExemploResponse(request(ok), { now, env, fetchPhoto, engine })).status).toBe(401);
    for (const body of [{ cor: "azul", vista: "frente" }, { cor: "toString", vista: "frente" }, { cor: "marrom", vista: "../../etc/passwd" }, {}, null]) {
      expect((await coresExemploResponse(request(body), opts)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await coresExemploResponse(request(ok), { ...opts, env: {} as NodeJS.ProcessEnv })).status).toBe(503);
    expect(engine.recolor).not.toHaveBeenCalled();
  });

  it("erro do GPT volta curto e sem pedaço da chave; outros erros, com texto fixo", async () => {
    const fail = (e: Error) => ({ recolor: vi.fn(async () => Promise.reject(e)) });
    const call = (engine: ReturnType<typeof fail>) =>
      coresExemploResponse(request({ cor: "bege", vista: "traseira" }), { now, env, senhaSha256, fetchPhoto, engine });
    const openai = await call(fail(new Error("OpenAI: Incorrect API key provided: sk-proj-****abcd. You can find…")));
    expect(openai.status).toBe(502);
    const { error } = await openai.json();
    expect(error).toContain("Incorrect API key provided");
    expect(error).not.toMatch(/sk-proj|abcd/);
    // Erro que não veio da OpenAI pode citar a chave inteira (ex.: cabeçalho inválido): não é repassado.
    const header = await call(fail(new TypeError('Headers.append: "Bearer sk-proj-PARTE1\nPARTE2" is an invalid header value.')));
    expect(await header.json()).toEqual({ error: "Falha ao chamar o GPT." });
    // Limite de pedidos da OpenAI: devolve 429 (quem repete é o script, a rota não tem tempo).
    const limited = Object.assign(new Error("OpenAI: Rate limit reached"), { status: 429 });
    expect((await call(fail(limited))).status).toBe(429);
  });

  it("sem chave no servidor, até a conferência sem custo ({}) avisa", async () => {
    const opts = { now, senhaSha256, fetchPhoto, engine: fakeEngine() };
    expect((await coresExemploResponse(request({}), { ...opts, env: {} as NodeJS.ProcessEnv })).status).toBe(503);
    expect((await coresExemploResponse(request({}), { ...opts, env })).status).toBe(400);
  });

  it("o script pede a foto ao site com a cor e o ângulo certos e grava a resposta", async () => {
    const engine = fakeEngine();
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) =>
      coresExemploResponse(new Request(url, init), { now, env, senhaSha256, fetchPhoto, engine })) as typeof fetch;
    const site = siteRecolorEngine("https://cuxoes.vercel.app/api/interno/cores-exemplo", SENHA, { fetchImpl });
    const dir = mkdtempSync(path.join(tmpdir(), "cores-"));
    const output = path.join(dir, "branco-frente.jpg");
    await site.recolor("/qualquer/pasta/poltrona-azul-frente.jpg", "branco", "#ECE7DE", output);
    expect(engine.recolor).toHaveBeenCalledWith(expect.any(String), "branco", "#ECE7DE", expect.any(String));
    expect(readFileSync(output).equals(FRENTE)).toBe(true);
    // Conferência sem custo antes de começar: passa, e não chama o GPT.
    engine.recolor.mockClear();
    await expect(site.check()).resolves.toBeUndefined();
    expect(engine.recolor).not.toHaveBeenCalled();
    // Senha errada: para com o motivo claro (e status, para o script não insistir nos outros ângulos).
    const wrong = siteRecolorEngine("https://cuxoes.vercel.app/api/interno/cores-exemplo", "errada", { fetchImpl });
    await expect(wrong.check()).rejects.toThrow("Site: Não autorizado. — senha errada (CORES_GPT_SENHA)");
    await expect(wrong.recolor("/x/poltrona-azul-frente.jpg", "branco", "#ECE7DE", output)).rejects.toMatchObject({ status: 401 });
  });

  it("o script reconhece a rota fora do ar, a proteção da Vercel, resposta que não é imagem e repete o 429", async () => {
    const url = "https://cuxoes.vercel.app/api/interno/cores-exemplo";
    const html = (status: number) => new Response("<html>…</html>", { status, headers: { "content-type": "text/html" } });
    const fixed = (res: () => Response) => (async () => res()) as unknown as typeof fetch;
    await expect(siteRecolorEngine(url, SENHA, { fetchImpl: fixed(() => html(404)) }).check()).rejects.toThrow("falta publicar em produção");
    await expect(siteRecolorEngine(url, SENHA, { fetchImpl: fixed(() => html(401)) }).check()).rejects.toThrow("proteção da Vercel");
    const dir = mkdtempSync(path.join(tmpdir(), "cores-"));
    const output = path.join(dir, "x.jpg");
    await expect(
      siteRecolorEngine(url, SENHA, { fetchImpl: fixed(() => html(200)) }).recolor("/x/poltrona-azul-frente.jpg", "", "#ECE7DE", output),
    ).rejects.toThrow("a resposta não é uma imagem (text/html, 200)");
    // 429 e depois a imagem: repete uma vez.
    let calls = 0;
    const flaky = (async () =>
      ++calls === 1
        ? Response.json({ error: "OpenAI: Rate limit reached" }, { status: 429 })
        : new Response(new Uint8Array(FRENTE), { headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch;
    await siteRecolorEngine(url, SENHA, { fetchImpl: flaky, retryWaitMs: 1 }).recolor("/x/poltrona-azul-frente.jpg", "", "#ECE7DE", output);
    expect(calls).toBe(2);
    expect(readFileSync(output).equals(FRENTE)).toBe(true);
  });
});

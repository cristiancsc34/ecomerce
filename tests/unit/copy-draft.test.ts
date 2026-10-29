import { describe, expect, it, vi } from "vitest";
import { parseCopyDraft } from "@/lib/ai/copy-draft";
import { startCopyDraft } from "../../scripts/ai-pipeline.mjs";

const draft = {
  nameSuggestions: ["Cadeira Ergonômica Preta"],
  shortDescription: "Cadeira de escritório preta com encosto em tela e apoio de cabeça.",
  description: "Encosto em tela com apoio lombar e apoio de cabeça. Braços com regulagem e base com rodízios para se mover pelo espaço.",
  seoTitle: "Cadeira de escritório preta com tela",
  seoDescription: "Cadeira de escritório preta com encosto em tela, apoio de cabeça e braços reguláveis.",
  unconfirmedNumbers: [],
  createdAt: "2026-10-29T19:00:00.000Z",
};

/** Supabase de mentira: responde às consultas da tarefa e anota as gravações. */
function fakeSupabase({ existing = false } = {}) {
  const updates: { values: unknown; id: unknown }[] = [];
  const query = () => {
    let values: unknown = null;
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        if (values && column === "id") updates.push({ values, id: value });
        return chain;
      },
      not: () => chain,
      limit: () => chain,
      update: (v: unknown) => ((values = v), chain),
      then: (resolve: (r: unknown) => void) => resolve({ data: existing ? [{ id: "outra" }] : [], error: null }),
    };
    return chain;
  };
  return { supabase: { from: query }, updates };
}

describe("rascunho de nome e descrição (a IA lê as fotos uma vez)", () => {
  const job = { id: "tarefa-catalogo" };
  const product = { id: "produto" };

  it("escreve junto com as fotos de catálogo e já guarda na tarefa", async () => {
    const { supabase, updates } = fakeSupabase();
    const copyDraft = vi.fn(async () => draft);
    const result = await startCopyDraft(supabase, job, product, ["frente.jpg", "lado.jpg", "costas.jpg"], { copyDraft });
    expect(copyDraft).toHaveBeenCalledWith(["frente.jpg", "lado.jpg", "costas.jpg"], product);
    expect(result).toEqual({ copy: draft });
    expect(updates).toEqual([{ values: { details: { copy: draft } }, id: "tarefa-catalogo" }]);
  });

  it("produto que já tem rascunho: não chama a IA de novo", async () => {
    const { supabase, updates } = fakeSupabase({ existing: true });
    const copyDraft = vi.fn();
    expect(await startCopyDraft(supabase, job, product, ["frente.jpg"], { copyDraft })).toEqual({});
    expect(copyDraft).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("sem motor de textos (processador local): não faz nada", async () => {
    const { supabase } = fakeSupabase();
    expect(await startCopyDraft(supabase, job, product, ["frente.jpg"], {})).toEqual({});
  });

  it("se a IA falhar, as fotos de catálogo seguem e o erro fica anotado", async () => {
    const { supabase } = fakeSupabase();
    const result = await startCopyDraft(supabase, job, product, ["frente.jpg"], {
      copyDraft: async () => {
        throw new Error("OpenAI: erro 500");
      },
    });
    expect(result).toEqual({ copyError: "OpenAI: erro 500" });
  });

  it("lê o rascunho guardado e ignora detalhes sem rascunho ou fora do formato", () => {
    expect(parseCopyDraft({ copy: draft })).toEqual(draft);
    expect(parseCopyDraft({ views: ["frente"] })).toBeNull();
    expect(parseCopyDraft({ copy: { shortDescription: "curta" } })).toBeNull();
    expect(parseCopyDraft(null)).toBeNull();
  });
});

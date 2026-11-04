import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  CODIGO,
  emailDaConta,
  enderecoDoLink,
  hashDoCodigo,
  novoCodigo,
  prepararEntradaPeloLink,
  revogarLink,
  situacaoDoLink,
  vencimento,
} from "@/lib/admin/access-links";

/** Links de acesso ao painel (lib/admin/access-links.ts). */

type Linha = Record<string, unknown>;

/** O pedaço do cliente do Supabase (chave de serviço) que o módulo usa, em memória. */
function supabaseFalso(links: Linha[]) {
  const adminUsers = new Map<string, Linha>();
  const users = new Map<string, { id: string; email: string; banned?: string }>();
  const chamadas: string[] = [];
  const tabela = (nome: string) => (nome === "admin_access_links" ? links : [...adminUsers.values()]);
  const from = (nome: string) => {
    const filtros: [string, unknown][] = [];
    let mudanca: Linha | null = null;
    let apagar = false;
    const casa = (l: Linha) => filtros.every(([c, v]) => (v === "__null__" ? l[c] == null : l[c] === v));
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => (filtros.push([c, v]), b),
      is: (c: string) => (filtros.push([c, "__null__"]), b),
      update: (m: Linha) => ((mudanca = m), b),
      delete: () => ((apagar = true), b),
      upsert: async (l: Linha) => {
        adminUsers.set(String(l.user_id), l);
        chamadas.push(`upsert ${nome} ${JSON.stringify(l.areas)}`);
        return { error: null };
      },
      maybeSingle: async () => {
        const achados = tabela(nome).filter(casa);
        if (mudanca) for (const l of achados) Object.assign(l, mudanca);
        return { data: achados[0] ?? null, error: null };
      },
      then: (ok: (r: { error: null }) => void) => {
        if (apagar && nome === "admin_users") for (const [k, l] of adminUsers) if (casa(l)) adminUsers.delete(k);
        if (mudanca) for (const l of tabela(nome).filter(casa)) Object.assign(l, mudanca);
        chamadas.push(`${apagar ? "delete" : "update"} ${nome}`);
        ok({ error: null });
      },
    };
    return b;
  };
  const auth = {
    admin: {
      getUserById: async (id: string) => ({ data: { user: users.get(id) ?? null }, error: users.has(id) ? null : { message: "não achei" } }),
      createUser: async ({ email }: { email: string }) => {
        const u = { id: `u-${users.size + 1}`, email };
        users.set(u.id, u);
        chamadas.push(`createUser ${email}`);
        return { data: { user: u }, error: null };
      },
      generateLink: async ({ email }: { email: string }) => ({ data: { properties: { hashed_token: `hash-de-${email}` } }, error: null }),
      updateUserById: async (id: string, attrs: { ban_duration?: string }) => {
        const u = users.get(id);
        if (u && attrs.ban_duration) u.banned = attrs.ban_duration;
        chamadas.push(`ban ${id}`);
        return { data: { user: u }, error: null };
      },
    },
  };
  return { client: { from, auth } as unknown as SupabaseClient, adminUsers, users, chamadas };
}

const link = (over: Linha = {}): Linha => ({
  id: "11111111-1111-4111-8111-111111111111",
  label: "Depósito do João",
  areas: ["itens", "pedidos"],
  token_hash: "",
  user_id: null,
  expires_at: null,
  revoked_at: null,
  last_used_at: null,
  use_count: 0,
  created_at: "2026-11-04T12:00:00Z",
  ...over,
});

describe("código e endereço do link", () => {
  it("código aleatório de 43 caracteres; o banco guarda só o hash", () => {
    const a = novoCodigo();
    expect(a).toMatch(CODIGO);
    expect(novoCodigo()).not.toBe(a);
    expect(hashDoCodigo(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoCodigo(a)).not.toContain(a);
    expect(enderecoDoLink(a, "https://cuxoes.vercel.app")).toBe(`https://cuxoes.vercel.app/acesso/${a}`);
  });

  it("validade e situação", () => {
    const agora = new Date("2026-11-04T12:00:00Z");
    expect(vencimento("7", agora)).toBe("2026-11-11T12:00:00.000Z");
    expect(vencimento("sem", agora)).toBeNull();
    expect(situacaoDoLink({ revoked_at: null, expires_at: null }, agora)).toBe("ativo");
    expect(situacaoDoLink({ revoked_at: null, expires_at: "2026-11-04T11:59:59Z" }, agora)).toBe("vencido");
    expect(situacaoDoLink({ revoked_at: "2026-11-03T00:00:00Z", expires_at: null }, agora)).toBe("revogado");
  });

  it("a conta do link tem um e-mail próprio, no domínio do site", () => {
    expect(emailDaConta("abc", "https://cuxoes.vercel.app")).toBe("link-abc@cuxoes.vercel.app");
    expect(emailDaConta("abc", "http://localhost:3000")).toBe("link-abc@painel.local");
  });
});

describe("entrar pelo link", () => {
  it("primeiro uso: cria a conta do link só com as áreas dele e devolve o código de entrada", async () => {
    const codigo = novoCodigo();
    const linhas = [link({ token_hash: hashDoCodigo(codigo) })];
    const f = supabaseFalso(linhas);
    const r = await prepararEntradaPeloLink(codigo, f.client);
    expect(r).toEqual({ ok: true, tokenHash: expect.stringMatching(/^hash-de-link-11111111/), areas: ["itens", "pedidos"] });
    expect(f.users.size).toBe(1);
    expect([...f.adminUsers.values()]).toEqual([{ user_id: "u-1", role: "editor", areas: ["itens", "pedidos"] }]);
    expect(linhas[0]).toMatchObject({ user_id: "u-1", use_count: 1 });
    // Segundo uso: a mesma conta, sem criar outra.
    await prepararEntradaPeloLink(codigo, f.client);
    expect(f.users.size).toBe(1);
    expect(linhas[0]).toMatchObject({ use_count: 2 });
  });

  it("link inexistente, revogado ou vencido não entra", async () => {
    const codigo = novoCodigo();
    expect(await prepararEntradaPeloLink(codigo, supabaseFalso([]).client)).toMatchObject({ ok: false, erro: expect.stringMatching(/não existe/) });
    expect(await prepararEntradaPeloLink("curto", supabaseFalso([]).client)).toMatchObject({ ok: false });
    const revogado = supabaseFalso([link({ token_hash: hashDoCodigo(codigo), revoked_at: "2026-11-01T00:00:00Z" })]);
    expect(await prepararEntradaPeloLink(codigo, revogado.client)).toMatchObject({ ok: false, erro: expect.stringMatching(/revogado/) });
    expect(revogado.users.size).toBe(0);
    const vencido = supabaseFalso([link({ token_hash: hashDoCodigo(codigo), expires_at: "2020-01-01T00:00:00Z" })]);
    expect(await prepararEntradaPeloLink(codigo, vencido.client)).toMatchObject({ ok: false, erro: expect.stringMatching(/venceu/) });
  });
});

describe("revogar", () => {
  it("o link para de abrir, a conta sai da equipe e fica bloqueada (sem apagar, para o histórico)", async () => {
    const codigo = novoCodigo();
    const linhas = [link({ token_hash: hashDoCodigo(codigo) })];
    const f = supabaseFalso(linhas);
    await prepararEntradaPeloLink(codigo, f.client);
    expect(f.adminUsers.size).toBe(1);

    expect(await revogarLink(String(linhas[0]!.id), f.client)).toEqual({ ok: true });
    expect(linhas[0]!.revoked_at).toBeTruthy();
    expect(f.adminUsers.size).toBe(0);
    expect(f.users.get("u-1")).toMatchObject({ banned: "876000h" });
    expect(await prepararEntradaPeloLink(codigo, f.client)).toMatchObject({ ok: false, erro: expect.stringMatching(/revogado/) });
  });

  it("sem a chave de serviço, avisa em vez de fingir que revogou", async () => {
    expect(await revogarLink("x", null)).toMatchObject({ ok: false, erro: expect.stringMatching(/SUPABASE_SERVICE_ROLE_KEY/) });
  });
});

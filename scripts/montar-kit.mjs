#!/usr/bin/env node
/**
 * Monta o kit para levar esta loja para outra marca: um .zip com o código (só o
 * que está commitado no Git, sem .env.local, node_modules nem histórico), as
 * instruções de kit/ e regras genéricas para a IA (Codex ou Claude).
 *
 *   npm run kit:montar                     # gera loja-ia-kit-AAAA-MM-DD.zip
 *   npm run kit:montar -- /caminho/kit.zip
 *
 * Tira os dados das contas desta loja (CLAUDE.md, a especificação da Cuxões e os
 * trechos do README marcados com <!-- kit:remover -->) e para com erro se achar
 * alguma chave secreta ou dado pessoal no que vai para o zip.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAME = "loja-ia-kit";
const out = path.resolve(process.argv[2] ?? `${NAME}-${new Date().toISOString().slice(0, 10)}.zip`);

/** Arquivos desta loja que não vão para o kit. */
const REMOVE = ["CLAUDE.md", "SPEC-MVP-CUXOES.md", "kit/COMECE-AQUI.md", "kit/PROMPT-INICIAL.md", "kit/REGRAS-DA-IA.md"];

/** O que não pode aparecer no kit: chaves secretas e dados das contas desta loja. */
const FORBIDDEN = [
  [/sk-proj-[A-Za-z0-9_-]{20,}/, "chave da OpenAI"],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "chave da Anthropic"],
  [/\bvcp_[A-Za-z0-9]{20,}/, "token da Vercel"],
  [/\bsbp_[a-f0-9]{20,}/, "token do Supabase"],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, "chave secreta do Supabase"],
  [/cristian|atlas-solucoes|pcrxojzztizrpjwxwvhz|cristians-projects|cuxoes\.vercel\.app/i, "dado das contas desta loja"],
];

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

if (git("status", "--porcelain").trim()) {
  console.warn("Aviso: há mudanças não commitadas; o kit usa só o último commit.\n");
}

const work = mkdtempSync(path.join(tmpdir(), "kit-"));
const dir = path.join(work, NAME);
mkdirSync(dir);
try {
  // 1. Código do último commit (sem histórico, sem arquivos ignorados).
  execFileSync("sh", ["-c", `git archive --format=tar HEAD | tar -x -C "${dir}"`], { cwd: ROOT });

  // 2. Instruções para quem recebe: na raiz, para serem as primeiras a aparecer.
  for (const file of ["COMECE-AQUI.md", "PROMPT-INICIAL.md"]) renameSync(path.join(dir, "kit", file), path.join(dir, file));

  // 3. Regras genéricas para a IA: CLAUDE.md (Claude) e AGENTS.md (Codex), no lugar das regras desta loja.
  const rules = readFileSync(path.join(dir, "kit", "REGRAS-DA-IA.md"), "utf8").trim();
  const agents = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
  for (const file of REMOVE) rmSync(path.join(dir, file), { force: true });
  writeFileSync(path.join(dir, "CLAUDE.md"), `${rules}\n\nVer também [\`AGENTS.md\`](AGENTS.md) (regras do Next.js deste projeto).\n`);
  writeFileSync(path.join(dir, "AGENTS.md"), `${rules}\n\n${agents}`);

  // 4. README sem os trechos desta loja e com o caminho do kit no topo.
  const readme = readFileSync(path.join(dir, "README.md"), "utf8").replace(/<!-- kit:remover -->[\s\S]*?<!-- \/kit:remover -->\n?/g, "");
  const banner =
    "> **Kit de loja online com IA.** Comece por [`COMECE-AQUI.md`](COMECE-AQUI.md). Para a IA: " +
    "[`kit/PLAYBOOK.md`](kit/PLAYBOOK.md).\n\n";
  writeFileSync(path.join(dir, "README.md"), readme.replace(/^(# .*\n\n)/, `$1${banner}`));

  // 5. Conferência: nada secreto nem pessoal no que vai para o zip.
  const problems = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder)) {
      const full = path.join(folder, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (statSync(full).size < 5_000_000) {
        const text = readFileSync(full, "latin1");
        for (const [pattern, label] of FORBIDDEN) {
          if (pattern.test(text)) problems.push(`${path.relative(dir, full)}: ${label}`);
        }
      }
    }
  };
  walk(dir);
  if (problems.length) {
    console.error(`O kit não foi gerado: há dados que não podem sair daqui.\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }

  // 6. Compacta.
  if (existsSync(out)) rmSync(out);
  execFileSync("zip", ["-r", "-q", "-X", out, NAME], { cwd: work });
  const files = execFileSync("sh", ["-c", `find "${dir}" -type f | wc -l`], { encoding: "utf8" }).trim();
  console.log(`Kit gerado: ${out} (${files} arquivos, ${(statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

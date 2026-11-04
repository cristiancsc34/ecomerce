#!/usr/bin/env node
/**
 * Confere a configuração da loja: cada chave existe, funciona e está no lugar
 * certo. Só faz leituras (não cria nada, não gasta créditos de IA).
 *
 *   npm run config:verificar                 # lê .env.local
 *   node scripts/verificar-config.mjs outro.env
 *
 * ✓ ok · ⚠ funciona, mas vale ajustar · ✗ falta ou está errado (sai com código 1).
 * Onde pegar cada chave: kit/GUIA-DE-CHAVES.md.
 */
import { existsSync } from "node:fs";
import { DEFAULT_IMAGE_MODEL } from "./ai-pipeline.mjs";

// Variáveis já definidas no ambiente (ex.: na Vercel ou no terminal) têm prioridade sobre o arquivo.
const envFile = process.argv[2] ?? ".env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);
else if (process.argv[2]) {
  console.error(`Arquivo ${envFile} não encontrado.`);
  process.exit(1);
} else {
  console.log("Sem .env.local: copie o .env.example para .env.local e preencha (veja kit/GUIA-DE-CHAVES.md).");
}

const env = process.env;
const results = [];
const add = (status, area, message, hint = "") => results.push({ status, area, message, hint });
const ok = (area, message) => add("ok", area, message);
const warn = (area, message, hint) => add("warn", area, message, hint);
const fail = (area, message, hint) => add("fail", area, message, hint);
const guide = (section) => `kit/GUIA-DE-CHAVES.md#${section}`;

async function get(url, headers = {}) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    let body = null;
    try {
      body = await res.json();
    } catch {
      // resposta sem JSON
    }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: { message: e instanceof Error ? e.message : String(e) } };
  }
}

/** Papel gravado numa chave JWT do Supabase (anon/service_role), sem validar a assinatura. */
function jwtRole(token) {
  const part = String(token ?? "").split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

const looksSecret = (value) => /^(sk-|sbp_|vcp_|sb_secret_)/.test(value) || jwtRole(value) === "service_role";

// --- Site e marca -----------------------------------------------------------
function checkSite() {
  const url = env.NEXT_PUBLIC_SITE_URL;
  if (!url) fail("Site", "NEXT_PUBLIC_SITE_URL vazio.", "Use o endereço final da loja (ex.: https://minhaloja.com.br).");
  else {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "localhost") warn("Site", `NEXT_PUBLIC_SITE_URL = ${url}`, "Na Vercel, use o endereço final da loja.");
      else ok("Site", `Endereço: ${url}`);
    } catch {
      fail("Site", `NEXT_PUBLIC_SITE_URL inválido: ${url}`, "Precisa começar com https://");
    }
  }
  const name = env.NEXT_PUBLIC_BRAND_NAME?.trim();
  if (!name) warn("Marca", "NEXT_PUBLIC_BRAND_NAME vazio: a loja usa o nome padrão de config/brand.ts.", "kit/MAPA-DO-CODIGO.md");
  else if (/cux(õ|o)es/i.test(name)) warn("Marca", `Nome ainda é o do exemplo (${name}).`, "Troque pelo nome da sua loja.");
  else ok("Marca", `Nome: ${name}`);
  const source = env.CATALOG_SOURCE;
  if (source && !["demo", "supabase"].includes(source)) fail("Catálogo", `CATALOG_SOURCE inválido: ${source}`, "Use demo, supabase ou deixe vazio.");
  else if (source === "demo") warn("Catálogo", "CATALOG_SOURCE=demo: a vitrine mostra os produtos de demonstração.", "Troque para supabase quando os produtos reais estiverem publicados.");
}

// --- Segredos no lugar errado ----------------------------------------------
function checkPublicVars() {
  const leaked = Object.entries(env).filter(([key, value]) => key.startsWith("NEXT_PUBLIC_") && value && looksSecret(value));
  if (leaked.length) {
    fail("Segurança", `Chave secreta em variável pública: ${leaked.map(([k]) => k).join(", ")}.`, "NEXT_PUBLIC_ vai para o navegador. Mova para uma variável sem esse prefixo e troque a chave (ela vazou).");
  } else ok("Segurança", "Nenhuma chave secreta em variável NEXT_PUBLIC_.");
  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY && jwtRole(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) === "service_role") {
    fail("Segurança", "NEXT_PUBLIC_SUPABASE_ANON_KEY contém a chave service_role.", "Use a chave anon/publishable.");
  }
}

// --- Supabase ---------------------------------------------------------------
async function checkSupabase() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    warn("Supabase", "URL ou chave anon vazias: a loja roda em MODO DEMONSTRAÇÃO (sem painel).", guide("2-supabase-banco-login-e-fotos"));
    return;
  }
  const headers = { apikey: anon, Authorization: `Bearer ${anon}` };
  const categories = await get(`${url}/rest/v1/categories?select=id&limit=1`, headers);
  if (categories.status === 200) ok("Supabase", "Banco responde e as migrações estão aplicadas.");
  else if (categories.status === 401) return fail("Supabase", "Chave anon recusada.", guide("2-supabase-banco-login-e-fotos"));
  else if (categories.status === 404 || categories.body?.code === "PGRST205" || categories.body?.code === "42P01") {
    fail("Supabase", "O banco responde, mas as tabelas não existem: faltam as migrações.", "npx supabase db push (kit/PLAYBOOK.md, fase 5)");
  } else return fail("Supabase", `Não foi possível falar com ${url} (${categories.status || categories.body?.message}).`, "Confira NEXT_PUBLIC_SUPABASE_URL.");

  const settings = await get(`${url}/auth/v1/settings`, { apikey: anon });
  if (settings.status === 200 && settings.body?.disable_signup === true) ok("Supabase", "Cadastro público desligado (só a equipe entra).");
  else if (settings.status === 200) {
    warn("Supabase", "Cadastro público LIGADO: qualquer pessoa cria conta.", "Authentication → Sign In / Providers → desligue “Allow new users to sign up”.");
  }

  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) {
    fail("Supabase", "SUPABASE_SERVICE_ROLE_KEY vazio: o estúdio de IA não processa nada.", guide("2-supabase-banco-login-e-fotos"));
    return;
  }
  const serviceHeaders = { apikey: service, Authorization: `Bearer ${service}` };
  const queue = await get(`${url}/rest/v1/ai_jobs?select=id&limit=1`, serviceHeaders);
  if (queue.status !== 200) return fail("Supabase", `Chave service_role recusada (${queue.status}).`, guide("2-supabase-banco-login-e-fotos"));
  ok("Supabase", "Chave service_role funciona (fila do estúdio de IA).");
  const bucket = await get(`${url}/storage/v1/bucket/product-media`, serviceHeaders);
  if (bucket.status === 200) ok("Supabase", "Bucket de fotos product-media existe.");
  else fail("Supabase", "Bucket product-media não existe.", "Ele é criado pelas migrações: rode npx supabase db push.");
  const team = await get(`${url}/rest/v1/admin_users?select=role`, serviceHeaders);
  const roles = Array.isArray(team.body) ? team.body.map((r) => r.role) : [];
  if (roles.includes("admin")) ok("Supabase", `Equipe cadastrada: ${roles.filter((r) => r === "admin").length} admin(s), ${roles.filter((r) => r === "editor").length} editor(es).`);
  else fail("Supabase", "Nenhum administrador cadastrado.", "npm run admin:create -- email@daloja.com admin");
}

// --- OpenAI -----------------------------------------------------------------
async function checkOpenAI() {
  const key = env.OPENAI_API_KEY;
  if (!key) {
    fail("OpenAI", "OPENAI_API_KEY vazio: sem limpeza de fundo, fotos de catálogo e textos com IA.", guide("3-openai-limpeza-fotos-de-catálogo-e-textos"));
    return;
  }
  const res = await get("https://api.openai.com/v1/models", { Authorization: `Bearer ${key}` });
  if (res.status === 401) return fail("OpenAI", "Chave recusada (401).", guide("3-openai-limpeza-fotos-de-catálogo-e-textos"));
  if (res.status !== 200) return fail("OpenAI", `Erro ao consultar a OpenAI (${res.status || res.body?.message}).`, "Tente de novo em instantes.");
  const ids = new Set((res.body?.data ?? []).map((m) => m.id));
  ok("OpenAI", "Chave funciona.");
  const imageModel = env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const textModel = env.OPENAI_TEXT_MODEL || "gpt-5.1";
  for (const [label, model, variable] of [["imagem", imageModel, "OPENAI_IMAGE_MODEL"], ["texto", textModel, "OPENAI_TEXT_MODEL"]]) {
    if (ids.has(model)) ok("OpenAI", `Modelo de ${label} liberado: ${model}.`);
    else {
      const options = [...ids].filter((id) => (label === "imagem" ? id.includes("image") : /^gpt-\d/.test(id))).sort().slice(-5);
      warn("OpenAI", `Modelo de ${label} ${model} não aparece nesta conta.`, `Defina ${variable} com um destes: ${options.join(", ") || "(nenhum)"}; ou verifique a organização na OpenAI.`);
    }
  }
}

// --- Opcionais ----------------------------------------------------------------
async function checkOptional() {
  if (env.ANTHROPIC_API_KEY) {
    const res = await get("https://api.anthropic.com/v1/models?limit=100", { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" });
    if (res.status === 200) {
      const model = env.ASSISTANT_MODEL?.trim() || "claude-haiku-5-5";
      const ids = (res.body?.data ?? []).map((m) => m.id);
      if (ids.includes(model)) ok("Assistente", `Chave da Anthropic funciona; modelo ${model} liberado.`);
      else warn("Assistente", `Chave funciona, mas o modelo ${model} não aparece.`, `Defina ASSISTANT_MODEL com um destes: ${ids.slice(0, 5).join(", ")}`);
    } else fail("Assistente", `Chave da Anthropic recusada (${res.status}).`, guide("6-anthropic-assistente-de-vendas-opcional"));
  } else warn("Assistente", "Sem ANTHROPIC_API_KEY: o botão “Ajuda” fica escondido (opcional).", guide("6-anthropic-assistente-de-vendas-opcional"));

  if (env.TRIPO_API_KEY) ok("3D", "TRIPO_API_KEY preenchida (a validade só aparece ao gerar o primeiro 3D).");
  else warn("3D", "Sem TRIPO_API_KEY: o 3D automático fica desligado (opcional; dá para enviar .glb à mão).", guide("4-tripo-modelo-3d-opcional"));

  if (env.FAL_KEY) ok("Limpeza", "FAL_KEY preenchida: a limpeza usa a fal.ai (recorte exato).");

  const pin = [env.ADMIN_PIN, env.ADMIN_PIN_EMAIL, env.ADMIN_PIN_PASSWORD];
  if (pin.every(Boolean)) {
    if (env.ADMIN_PIN === "1234" || env.ADMIN_PIN.length < 6) warn("Painel", "PIN do painel curto ou de exemplo.", "Use um PIN com 6 dígitos ou mais.");
    else ok("Painel", "Entrada por PIN configurada.");
  } else if (pin.some(Boolean)) fail("Painel", "PIN do painel incompleto: precisa de ADMIN_PIN, ADMIN_PIN_EMAIL e ADMIN_PIN_PASSWORD.", "docs/PAINEL.md");
  else ok("Painel", "Entrada só por e-mail e senha (PIN desligado).");

  // Senhas por área (docs/PAINEL.md): cada uma diferente das outras; as contas das áreas precisam da chave de serviço.
  const areas = { ADMIN_SENHA_ITENS: "itens", ADMIN_SENHA_PEDIDOS: "pedidos", ADMIN_SENHA_ENTREGA: "entrega" };
  const usadas = Object.keys(areas).filter((k) => env[k]);
  if (usadas.length) {
    const todas = [env.ADMIN_PIN, ...usadas.map((k) => env[k])].filter(Boolean);
    if (new Set(todas).size !== todas.length) fail("Painel", "Há senhas repetidas entre as áreas: a repetida não abre nenhuma.", "docs/PAINEL.md");
    else if (!env.ADMIN_PIN_EMAIL || !env.ADMIN_PIN_PASSWORD) fail("Painel", "Senhas por área precisam de ADMIN_PIN_EMAIL e ADMIN_PIN_PASSWORD.", "docs/PAINEL.md");
    else if (!env.SUPABASE_SERVICE_ROLE_KEY) warn("Painel", "Sem SUPABASE_SERVICE_ROLE_KEY: as contas das áreas não são criadas sozinhas.", "docs/PAINEL.md");
    else ok("Painel", `Senhas por área: ${usadas.map((k) => areas[k]).join(", ")}.`);
  }
}

checkSite();
checkPublicVars();
await checkSupabase();
await checkOpenAI();
await checkOptional();

const icon = { ok: "✓", warn: "⚠", fail: "✗" };
console.log("\nConfiguração da loja\n");
for (const r of results) {
  console.log(`${icon[r.status]} ${r.area.padEnd(11)} ${r.message}`);
  if (r.hint && r.status !== "ok") console.log(`  ${" ".repeat(11)} → ${r.hint}`);
}
const fails = results.filter((r) => r.status === "fail").length;
const warns = results.filter((r) => r.status === "warn").length;
console.log(`\n${fails ? `✗ ${fails} item(ns) para resolver` : "✓ Tudo o que é obrigatório está certo"}${warns ? ` · ⚠ ${warns} aviso(s)` : ""}.\n`);
process.exit(fails ? 1 : 0);

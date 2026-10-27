#!/usr/bin/env node
/**
 * Cria (ou atualiza) um usuário da equipe do painel.
 *
 *   npm run admin:create -- email@empresa.com admin
 *   npm run admin:create -- editor@empresa.com editor
 *
 * Requer em .env.local: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 * A senha vem de ADMIN_PASSWORD (se definida) ou é gerada e exibida UMA vez.
 * A chave de serviço só é usada aqui, localmente — nunca na aplicação web.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [email, roleArg = "admin"] = process.argv.slice(2);
const role = roleArg === "editor" ? "editor" : roleArg === "admin" ? "admin" : null;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role) {
  console.error("Uso: npm run admin:create -- <email> [admin|editor]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const providedPassword = process.env.ADMIN_PASSWORD;
const password = providedPassword || randomBytes(18).toString("base64url");

async function findUserByEmail(target) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

let user = await findUserByEmail(email);
let created = false;
if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    console.error("Falha ao criar usuário:", error.message);
    process.exit(1);
  }
  user = data.user;
  created = true;
} else if (providedPassword) {
  const { error } = await supabase.auth.admin.updateUserById(user.id, { password: providedPassword });
  if (error) {
    console.error("Falha ao atualizar a senha:", error.message);
    process.exit(1);
  }
}

const { error: roleError } = await supabase.from("admin_users").upsert({ user_id: user.id, role }, { onConflict: "user_id" });
if (roleError) {
  console.error("Falha ao registrar o papel:", roleError.message);
  process.exit(1);
}

console.log(`✔ ${email} agora é ${role === "admin" ? "administrador" : "editor"} do painel.`);
if (created && !providedPassword) {
  console.log(`Senha gerada (anote agora, ela não será exibida de novo): ${password}`);
  console.log("Troque a senha no primeiro acesso pelo Supabase (Authentication → Users) ou rode de novo com ADMIN_PASSWORD.");
}

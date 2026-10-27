/** Contas de teste criadas no Supabase LOCAL pelo global setup. */
export const ACCOUNTS = {
  admin: { email: "e2e-admin@cuxoes.test", password: "E2e-Admin-Senha-123!" },
  editor: { email: "e2e-editor@cuxoes.test", password: "E2e-Editor-Senha-123!" },
  outsider: { email: "e2e-cliente@cuxoes.test", password: "E2e-Cliente-Senha-123!" },
} as const;

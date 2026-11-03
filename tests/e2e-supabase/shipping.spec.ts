import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ACCOUNTS } from "./accounts";

/** Entrega e avisos: o dono cadastra a região de entrega; o CEP passa a ter frete e prazo. */

const unique = Date.now().toString(36);
const shippingName = `Entrega E2E ${unique}`;

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

test.afterAll(async () => {
  await service().from("shipping_options").delete().like("name", "Entrega E2E%");
});

test("o dono cadastra a região de entrega; o CEP da região passa a ter frete e prazo", async ({ page }) => {
  await page.goto("/admin/login?modo=email");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
  await page.getByLabel("E-mail").fill(ACCOUNTS.admin.email);
  await page.getByLabel("Senha").fill(ACCOUNTS.admin.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();

  await page.goto("/admin/entrega");
  await expect(page.getByRole("heading", { level: 1, name: "Entrega e avisos" })).toBeVisible();

  const form = page.getByRole("form", { name: "Nova forma de entrega" });
  if (!(await form.isVisible())) await page.getByRole("button", { name: "Nova forma de entrega" }).click();
  // Faixa inválida é recusada com a linha do problema.
  await form.getByLabel("Nome que o cliente vê").fill(shippingName);
  await form.getByLabel("CEPs atendidos").fill("88139-999 a 88000-000");
  await form.getByRole("button", { name: "Adicionar forma de entrega" }).click();
  await expect(form.getByText(/Linha 1: o primeiro CEP precisa ser menor/)).toBeVisible();

  await form.getByLabel("CEPs atendidos").fill("88000-000 a 88139-999");
  await form.getByLabel(/Valor do frete/).fill("50,00");
  await form.getByLabel(/Prazo mínimo/).fill("2");
  await form.getByLabel(/Prazo máximo/).fill("5");
  await form.getByRole("button", { name: "Adicionar forma de entrega" }).click();
  const row = page.getByRole("listitem").filter({ hasText: shippingName });
  await expect(row).toContainText("R$ 50,00");
  await expect(row).toContainText("de 2 a 5 dias úteis");

  // O que o checkout consulta: o CEP da região tem a entrega; outro CEP, não.
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const inside = await anon.rpc("shipping_options_for", { p_cep: "88015200" });
  expect((inside.data as { name: string; priceCents: number }[]).find((o) => o.name === shippingName)?.priceCents).toBe(5000);
  const outside = await anon.rpc("shipping_options_for", { p_cep: "01310100" });
  expect((outside.data as { name: string }[]).some((o) => o.name === shippingName)).toBe(false);

  // Sem provedor configurado, os avisos automáticos não ligam.
  const notices = page.getByRole("form", { name: "Avisos automáticos" });
  await expect(notices.getByText("falta configurar").first()).toBeVisible();
  await expect(notices.getByRole("checkbox").first()).toBeDisabled();

  await row.getByRole("button", { name: /Remover/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remover" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: shippingName })).toHaveCount(0);
});

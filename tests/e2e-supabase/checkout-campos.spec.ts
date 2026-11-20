import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ACCOUNTS } from "./accounts";

/**
 * Checkout: validação ao sair do campo, CEP automático (ViaCEP falso) e lista "Revise N campos" (issue #10).
 * Nenhum pedido é enviado: os testes param na validação do navegador.
 */

const VIACEP_LOG = path.join(tmpdir(), "viacep-falso.log");
const unique = Date.now().toString(36);
let item: { productId: string; variantId: string | null };

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

test.beforeAll(async ({ browser }) => {
  // Produto real (não demonstração) publicado, para o botão "Enviar pedido" ficar ativo.
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await admin.auth.signInWithPassword(ACCOUNTS.admin);
  if (login.error) throw login.error;
  const db = service();
  // Categoria própria do teste (sem exigência de 3D, que outros testes podem ligar nas categorias do seed).
  const category = await db
    .from("categories")
    .insert({ slug: `checkout-e2e-${unique}`, name: `Checkout E2E ${unique}`, sort_order: 999 })
    .select("id")
    .single();
  if (category.error) throw category.error;
  const saved = await admin.rpc("save_product", {
    p_product_id: null,
    p_data: {
      name: `Checkout E2E ${unique}`,
      slug: `checkout-e2e-${unique}`,
      shortDescription: "Produto de teste",
      description: "Produto de teste do checkout.",
      categoryId: category.data.id,
      priceCents: null,
      compareAtPriceCents: null,
      sku: null,
      stockQuantity: null,
      dimensions: {},
      attributes: {},
      faq: [],
      seoTitle: null,
      seoDescription: null,
      variants: [{ name: "Único", sku: null, priceCents: 100000, stockQuantity: null, size: null, widthCm: null, lengthCm: null }],
    },
  });
  if (saved.error) throw saved.error;
  const productId = saved.data as string;
  const media = await db.from("product_media").insert({
    product_id: productId,
    storage_path: `products/${productId}/foto.jpg`,
    media_type: "image",
    alt_text: "Foto do produto de teste",
    is_primary: true,
    width: 1200,
    height: 900,
  });
  if (media.error) throw media.error;
  const published = await db.from("products").update({ status: "published" }).eq("id", productId);
  if (published.error) throw published.error;
  const variant = await db.from("product_variants").select("id").eq("product_id", productId).single();
  if (variant.error) throw variant.error;
  item = { productId, variantId: variant.data.id as string };

  // O catálogo público fica em cache desde o build: salvar uma categoria no painel (sem mudar nada) renova o cache.
  const page = await browser.newPage();
  await page.goto("/admin/login?modo=email");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
  await page.getByLabel("E-mail").fill(ACCOUNTS.admin.email);
  await page.getByLabel("Senha").fill(ACCOUNTS.admin.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
  await page.goto("/admin/categorias");
  const existing = page.locator("section[aria-labelledby=lista-categorias]");
  await existing.getByRole("button", { name: "Salvar", exact: true }).first().click();
  await expect(existing.getByText("Salvo.").first()).toBeVisible();
  await page.close();
});

test.afterAll(async () => {
  await service().from("products").delete().like("slug", "checkout-e2e-%");
  await service().from("categories").delete().like("slug", "checkout-e2e-%");
});

async function openCheckout(page: Page) {
  await page.addInitScript((line) => {
    window.localStorage.setItem("cuxoes:cart:v1", JSON.stringify([{ ...line, quantity: 1 }]));
  }, item);
  await page.goto("/finalizar");
  await expect(page.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
}

const viacepCalls = () => readFileSync(VIACEP_LOG, "utf8").split("\n").filter(Boolean);

for (const { width, height, label } of [
  { width: 390, height: 844, label: "celular (390)" },
  { width: 1440, height: 900, label: "computador (1440)" },
]) {
  test.describe(label, () => {
    test.use({ viewport: { width, height } });

    test("valida ao sair do campo e limpa o erro ao digitar; teclado conforme a spec", async ({ page }) => {
      await openCheckout(page);
      const name = page.getByLabel("Nome completo");
      const phone = page.getByLabel("Celular com WhatsApp");
      const email = page.getByLabel("E-mail");

      await expect(name).toHaveAttribute("autocapitalize", "words");
      await expect(email).toHaveAttribute("autocapitalize", "none");
      await expect(email).toHaveAttribute("autocorrect", "off");
      await expect(email).toHaveAttribute("spellcheck", "false");
      await expect(page.getByLabel("UF")).toHaveAttribute("autocapitalize", "characters");
      await expect(page.getByLabel("CEP")).toHaveAttribute("inputmode", "numeric");
      await expect(page.getByLabel("Número")).toHaveAttribute("inputmode", "text");
      await expect(page.getByText("Sem número? Escreva S/N.")).toBeVisible();

      // Celular com 9 dígitos (sem DDD): erro ao sair do campo (Tab no computador, toque fora no celular).
      await phone.fill("98765-4321");
      if (width >= 1024) await phone.press("Tab");
      else await phone.blur();
      const phoneError = page.getByText("Informe o celular com DDD, ex.: (11) 98765-4321.");
      await expect(phoneError).toBeVisible();
      await expect(phone).toHaveAttribute("aria-invalid", "true");
      await phone.press("End");
      await phone.pressSequentially("1");
      await expect(phoneError).toHaveCount(0);

      await name.focus();
      await name.blur();
      await expect(page.getByText("Informe seu nome.")).toBeVisible();
      await name.pressSequentially("Ana");
      await expect(page.getByText("Informe seu nome.")).toHaveCount(0);

      await email.fill("ana@");
      await email.blur();
      await expect(page.getByText("E-mail inválido. Confira ou deixe em branco.")).toBeVisible();
      await email.fill("");
      await email.blur();
      await expect(page.getByText("E-mail inválido. Confira ou deixe em branco.")).toHaveCount(0);

      const cep = page.getByLabel("CEP");
      await cep.fill("8801");
      await cep.blur();
      await expect(page.getByText("CEP com 8 números.")).toBeVisible();
    });

    test("CEP com 8 números preenche o endereço sem tocar em Buscar (uma chamada só)", async ({ page }) => {
      writeFileSync(VIACEP_LOG, "");
      await openCheckout(page);
      const cep = page.getByLabel("CEP");
      await cep.click();
      await cep.pressSequentially("88015200");
      // Enter logo em seguida não repete a busca em andamento.
      await cep.press("Enter");
      await expect(page.getByLabel("Rua")).toHaveValue("Rua do Teste");
      await expect(page.getByLabel("Bairro")).toHaveValue("Bairro do Teste");
      await expect(page.getByLabel("Cidade")).toHaveValue("Cidade do Teste");
      await expect(page.getByLabel("UF")).toHaveValue("SC");
      await expect(page.getByLabel("Número")).toBeFocused();
      // Buscar depois da busca automática também não consulta de novo o mesmo CEP.
      await page.getByRole("button", { name: "Buscar endereço pelo CEP" }).click();
      await expect(page.getByText("Endereço encontrado. Confira e informe o número.")).toBeVisible();
      expect(viacepCalls()).toEqual(["88015200"]);
      // Outro CEP busca de novo.
      await cep.fill("");
      await cep.pressSequentially("88015201");
      await expect(page.getByText("Endereço encontrado. Confira e informe o número.")).toBeVisible();
      expect(viacepCalls()).toEqual(["88015200", "88015201"]);
    });

    test("enviar vazio: lista 'Revise N campos' no topo, com links que focam o campo", async ({ page }) => {
      await openCheckout(page);
      await page.getByRole("button", { name: "Enviar pedido" }).click();

      const summary = page.locator("#checkout-erros");
      await expect(summary).toBeFocused();
      await expect(summary).toBeInViewport();
      await expect(summary).toHaveAttribute("role", "alert");
      await expect(summary.getByRole("heading")).toHaveText(/^Revise \d+ campos$/);
      const links = summary.getByRole("link");
      const total = await links.count();
      expect(total).toBeGreaterThanOrEqual(2);
      await expect(summary.getByRole("heading")).toHaveText(`Revise ${total} campos`);
      // O aviso do resumo (aside) fica só para erro de rede ou do servidor.
      await expect(page.getByText("Pedido não enviado")).toHaveCount(0);

      for (const [text, field] of [
        ["Informe seu nome.", "Nome completo"],
        ["Informe o celular com DDD, ex.: (11) 98765-4321.", "Celular com WhatsApp"],
        ["CEP com 8 números.", "CEP"],
      ] as const) {
        const link = summary.getByRole("link", { name: text });
        await expect(link).toBeVisible();
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await link.click();
        await expect(page.getByLabel(field, { exact: true })).toBeFocused();
        await expect(page.getByLabel(field, { exact: true })).toBeInViewport();
      }
    });

    test("com 1 erro: sem lista, foco direto no campo", async ({ page }) => {
      writeFileSync(VIACEP_LOG, "");
      await openCheckout(page);
      await page.getByLabel("Celular com WhatsApp").fill("(48) 98765-4321");
      await page.getByLabel("CEP").pressSequentially("88015200");
      await expect(page.getByLabel("Rua")).toHaveValue("Rua do Teste");
      await page.getByLabel("Número").fill("S/N");
      await page.getByLabel("Pix").check();
      await page.getByLabel(/Aceito que a loja fale comigo/).check();
      await page.getByLabel(/Li as políticas/).check();
      await page.getByRole("button", { name: "Enviar pedido" }).click();

      await expect(page.getByLabel("Nome completo")).toBeFocused();
      await expect(page.getByText("Informe seu nome.")).toBeVisible();
      await expect(page.locator("#checkout-erros")).toHaveCount(0);
      await expect(page.getByText("Pedido não enviado")).toHaveCount(0);
    });
  });
}

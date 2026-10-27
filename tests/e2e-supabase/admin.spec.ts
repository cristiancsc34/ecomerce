import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ACCOUNTS } from "./accounts";

const unique = Date.now().toString(36);
const productName = `Colchão E2E ${unique}`;
const productSlug = `colchao-e2e-${unique}`;

async function login(page: Page, who: keyof typeof ACCOUNTS) {
  await page.goto("/admin/login");
  // O botão só habilita depois da hidratação.
  await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
  await page.getByLabel("E-mail").fill(ACCOUNTS[who].email);
  await page.getByLabel("Senha").fill(ACCOUNTS[who].password);
  await page.getByRole("button", { name: "Entrar" }).click();
  if (who !== "outsider") await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
}

/**
 * Gera uma foto PNG real (1200×900) desenhando numa página. Arquivos vão como
 * buffer: setInputFiles por caminho falha quando a pasta tem acentos.
 */
async function photo(page: Page): Promise<Buffer> {
  const p = await page.context().newPage();
  await p.setViewportSize({ width: 1200, height: 900 });
  await p.setContent('<body style="margin:0;background:linear-gradient(135deg,#C4E0F5,#132940)"><div style="margin:200px;height:400px;background:#fff;border-radius:40px"></div></body>');
  const png = await p.screenshot();
  await p.close();
  return png;
}

test.describe.configure({ mode: "serial" });

test("rotas do painel exigem login", async ({ page }) => {
  for (const path of ["/admin", "/admin/produtos", "/admin/produtos/novo", "/admin/categorias"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
  }
});

test("senha errada mostra erro genérico", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
  await page.getByLabel("E-mail").fill(ACCOUNTS.admin.email);
  await page.getByLabel("Senha").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
});

test("usuário fora da equipe não entra no painel", async ({ page }) => {
  await login(page, "outsider");
  await expect(page.getByText("Esta conta não tem acesso ao painel")).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("editor cria rascunho com foto e envia para revisão, mas não publica", async ({ page }) => {
  await login(page, "editor");

  await page.goto("/admin/produtos/novo");
  await expect(page.getByRole("button", { name: "Criar rascunho" })).toBeEnabled();
  await page.getByLabel("Nome do produto").fill(productName);
  await expect(page.getByLabel("Endereço na loja (slug)")).toHaveValue(productSlug);
  await page.getByLabel(/^Categoria/).selectOption({ label: "Colchões" });
  await page.getByLabel("Descrição completa").fill("Descrição revisada.\n\nSegundo parágrafo.");
  await page.getByRole("button", { name: "Adicionar tamanho" }).click();
  await page.getByLabel(/Tamanho-padrão/).selectOption("casal");
  await expect(page.getByLabel("Nome exibido")).toHaveValue("Casal (138 × 188 cm)");
  await page.getByLabel(/^Preço$/).last().fill("1.799,00");
  await page.getByLabel(/^Firmeza/).selectOption("medio-firme");
  await page.getByRole("button", { name: "Criar rascunho" }).click();
  await expect(page.getByText("Rascunho criado")).toBeVisible();
  // Espera o formulário de mídia ficar interativo (hidratado).
  await expect(page.locator("form[data-ready=true]")).toBeAttached();

  // Rascunho não aparece na loja.
  const res = await page.request.get(`/produtos/${productSlug}`);
  expect(await res.text()).toContain("Página não encontrada");

  // Upload inválido é recusado com mensagem clara.
  await page.locator("#upload-file").setInputFiles({
    name: "falsa.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"),
  });
  await page.locator("#upload-alt").fill("Arquivo que não é imagem");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.locator("#upload-file-error")).toContainText("Formato não permitido");
  // O texto alternativo digitado não se perde no erro.
  await expect(page.locator("#upload-alt")).toHaveValue("Arquivo que não é imagem");

  await page.locator("#upload-file").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: await photo(page) });
  await page.locator("#upload-alt").fill("Colchão E2E visto de frente sobre fundo azul");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Arquivo enviado.")).toBeVisible();
  await expect(page.getByText("Principal", { exact: true })).toBeVisible();

  await expect(page.getByText("Somente administradores publicam.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar" })).toHaveCount(0);
  await page.getByRole("button", { name: "Enviar para revisão" }).click();
  await expect(page.getByRole("region", { name: "Status" }).getByText("Em revisão")).toBeVisible();
});

test("admin publica; o produto aparece na loja; despublicar remove", async ({ page }) => {
  await login(page, "admin");
  await page.goto(`/admin/produtos?q=${encodeURIComponent(unique)}`);
  await page.getByRole("link", { name: productName }).click();
  await expect(page.getByText("Tudo pronto para publicar.")).toBeVisible();

  await page.getByRole("button", { name: "Publicar" }).click();
  const dialog = page.getByRole("dialog", { name: "Publicar na loja?" });
  await expect(dialog.getByRole("button", { name: "Publicar agora" })).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Publicar agora" }).click();
  await expect(page.getByRole("region", { name: "Status" }).getByText("Publicado")).toBeVisible();

  const store = await page.context().newPage();
  await store.goto("/produtos");
  await expect(store.getByRole("link", { name: productName })).toBeVisible();
  await store.goto(`/produtos/${productSlug}`);
  await expect(store.getByRole("heading", { level: 1, name: productName })).toBeVisible();
  await expect(store.getByTestId("preco-atual")).toContainText("R$ 1.799,00");
  await expect(store.locator('script[type="application/ld+json"]').first()).toBeAttached();
  await store.goto("/categorias/colchoes");
  await expect(store.getByRole("link", { name: productName })).toBeVisible();

  await page.getByRole("button", { name: "Despublicar (voltar para rascunho)" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Despublicar" }).click();
  await expect(page.getByRole("region", { name: "Status" }).getByText("Rascunho")).toBeVisible();

  await store.goto("/produtos");
  await expect(store.getByRole("link", { name: productName })).toHaveCount(0);
});

test("editor não altera produto publicado", async ({ page }) => {
  // Publica de novo como admin…
  await login(page, "admin");
  await page.goto(`/admin/produtos?q=${encodeURIComponent(unique)}`);
  await page.getByRole("link", { name: productName }).click();
  await page.getByRole("button", { name: "Publicar" }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("dialog").getByRole("button", { name: "Publicar agora" }).click();
  await expect(page.getByRole("region", { name: "Status" }).getByText("Publicado")).toBeVisible();
  const url = page.url();
  await page.getByRole("button", { name: "Sair" }).first().click();
  await expect(page).toHaveURL(/\/admin\/login/);

  // …e o editor vê em modo somente leitura.
  await login(page, "editor");
  await page.goto(url);
  await expect(page.getByText("Somente leitura")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
});

test("produto de demonstração não pode ser publicado", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/produtos?q=nuvem");
  await page.getByRole("link", { name: "Nuvem Essencial" }).click();
  await expect(page.getByText("Produto de demonstração não pode ser publicado")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar" })).toBeDisabled();
});

test("salvar de novo não recria os tamanhos (sacolas continuam válidas)", async ({ page }) => {
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const variants = async () => {
    const { data: product } = await service.from("products").select("id").eq("slug", productSlug).single();
    const { data } = await service
      .from("product_variants")
      .select("id, price_cents")
      .eq("product_id", product!.id)
      .order("sort_order");
    return data ?? [];
  };

  await login(page, "admin");
  await page.goto(`/admin/produtos?q=${encodeURIComponent(unique)}`);
  await page.getByRole("link", { name: productName }).click();
  const save = page.getByRole("button", { name: "Salvar alterações" });
  await expect(save).toBeEnabled();

  await page.getByRole("button", { name: "Adicionar tamanho" }).click();
  await page.getByLabel(/Tamanho-padrão/).last().selectOption("queen");
  await page.getByLabel(/^Preço$/).last().fill("2.199,00");
  await save.click();
  await expect.poll(async () => (await variants()).length).toBe(2);
  const first = await variants();
  // A página recarrega o produto salvo e o formulário passa a conhecer o id do tamanho novo.
  await expect(page.locator(`li[data-variant-id="${first[1].id}"]`)).toBeAttached();

  await page.getByLabel(/^Preço$/).last().fill("2.299,00");
  await save.click();
  await expect.poll(async () => (await variants()).map((v) => v.price_cents)).toEqual([179900, 229900]);
  expect((await variants()).map((v) => v.id)).toEqual(first.map((v) => v.id));
});

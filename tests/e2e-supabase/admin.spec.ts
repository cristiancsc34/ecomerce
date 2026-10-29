import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ACCOUNTS } from "./accounts";

const unique = Date.now().toString(36);
const productName = `Colchão E2E ${unique}`;
const productSlug = `colchao-e2e-${unique}`;
const demoSlug = `demo-e2e-${unique}`;

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function login(page: Page, who: keyof typeof ACCOUNTS) {
  await page.goto("/admin/login?modo=email");
  // O botão só habilita depois da hidratação.
  await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
  await page.getByLabel("E-mail").fill(ACCOUNTS[who].email);
  await page.getByLabel("Senha").fill(ACCOUNTS[who].password);
  await page.getByRole("button", { name: "Entrar" }).click();
  if (who !== "outsider") await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
}

async function openTestProduct(page: Page) {
  await page.goto(`/admin/produtos?q=${encodeURIComponent(unique)}`);
  await page.getByRole("link", { name: new RegExp(productName) }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: productName })).toBeVisible();
}

/** Painel "Pronto para vender" (status, checklist e ações). */
const panel = (page: Page) => page.locator("section[aria-labelledby=pronto-titulo]");
const tab = (page: Page, name: string) => page.getByRole("tab", { name: new RegExp(`^${name}`) });

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

/** Lista os arquivos de uma pasta do Storage, entrando nas subpastas. */
async function filesIn(folder: string): Promise<string[]> {
  const { data } = await service().storage.from("product-media").list(folder, { limit: 1000 });
  const nested = await Promise.all(
    (data ?? []).map((f) => (f.id ? Promise.resolve([`${folder}/${f.name}`]) : filesIn(`${folder}/${f.name}`))),
  );
  return nested.flat();
}

// Os testes não deixam rastro no banco local: apagam os produtos e arquivos que criaram.
test.afterAll(async () => {
  const db = service();
  const { data } = await db.from("products").select("id").in("slug", [productSlug, demoSlug]);
  for (const { id } of data ?? []) {
    const paths = await filesIn(`products/${id}`);
    if (paths.length) await db.storage.from("product-media").remove(paths);
    await db.from("products").delete().eq("id", id);
  }
});

test("rotas do painel exigem login", async ({ page }) => {
  for (const path of ["/admin", "/admin/produtos", "/admin/produtos/novo", "/admin/categorias"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
  }
});

test("PIN: errado mostra erro; 1234 entra no painel", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  const pin = page.getByLabel("PIN de acesso");
  const enter = page.getByRole("button", { name: "Entrar" });
  await pin.fill("12");
  await expect(enter).toBeDisabled();
  await pin.fill("9999");
  await enter.click();
  await expect(page.getByText("PIN incorreto.")).toBeVisible();
  await pin.fill("1234");
  await enter.click();
  await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
});

test("senha errada mostra erro genérico", async ({ page }) => {
  await page.goto("/admin/login?modo=email");
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

test("editor cria rascunho em um passo, preenche pelas abas e envia para revisão, mas não publica", async ({ page }) => {
  await login(page, "editor");

  await page.goto("/admin/produtos/novo");
  const create = page.getByRole("button", { name: "Criar e enviar fotos" });
  await expect(create).toBeDisabled();
  await page.getByLabel("Nome do produto").fill(productName);
  await page.getByLabel(/^Categoria/).selectOption({ label: "Colchões" });
  await create.click();
  await expect(page.getByText("Produto criado como rascunho")).toBeVisible();
  await expect(tab(page, "Fotos e 3D")).toHaveAttribute("aria-selected", "true");
  // O que falta aparece no painel e marca as abas.
  await expect(panel(page).getByRole("button", { name: /Descrição \(falta\)/ })).toBeVisible();
  await expect(tab(page, "Informações")).toHaveAccessibleName(/falta algo/);

  // Rascunho não aparece na loja.
  const res = await page.request.get(`/produtos/${productSlug}`);
  expect(await res.text()).toContain("Página não encontrada");

  // Espera o formulário de mídia ficar interativo (hidratado).
  await expect(page.locator("form[data-ready=true]")).toBeAttached();
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
  await expect(panel(page).getByRole("button", { name: /Fotos \(pronto\)/ })).toBeVisible();

  // Estúdio de IA: a foto do celular entra na fila de limpeza; sem IA configurada, espera.
  await page.locator("#estudio-fotos").setInputFiles({ name: "celular.png", mimeType: "image/png", buffer: await photo(page) });
  await expect(page.getByText("Foto na fila de limpeza.")).toBeVisible();
  const studioPhoto = page.getByTestId("foto-estudio").first();
  await expect(studioPhoto).toHaveAttribute("data-status", "queued");
  await expect(page.getByTestId("estado-processador")).toContainText("IA ainda não configurada");
  await expect(page.getByRole("button", { name: "Gerar modelo 3D" })).toBeDisabled();
  await studioPhoto.getByRole("button", { name: "Descartar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByTestId("foto-estudio")).toHaveCount(0);

  // Clicar no que falta leva à aba certa.
  await panel(page).getByRole("button", { name: /Descrição \(falta\)/ }).click();
  await expect(tab(page, "Informações")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/aba=informacoes/);
  await page.getByLabel("Descrição completa").fill("Descrição revisada.\n\nSegundo parágrafo.");
  await expect(page.getByText("Alterações não salvas")).toBeVisible();
  // Trocar de aba não perde o que foi digitado.
  await tab(page, "Preço").click();
  await page.getByRole("button", { name: "Adicionar tamanho" }).click();
  await page.getByLabel(/Tamanho-padrão/).selectOption("casal");
  await expect(page.getByLabel("Nome exibido")).toHaveValue("Casal (138 × 188 cm)");
  await page.getByLabel(/^Preço$/).last().fill("1.799,00");
  await tab(page, "Detalhes").click();
  await page.getByLabel(/^Firmeza/).selectOption("medio-firme");
  await tab(page, "Link e Google").click();
  await expect(page.locator("#f-slug")).toHaveValue(productSlug);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText(/Salvo às/)).toBeVisible();
  await tab(page, "Informações").click();
  await expect(page.getByLabel("Descrição completa")).toHaveValue("Descrição revisada.\n\nSegundo parágrafo.");

  await expect(panel(page).getByRole("button", { name: /\(falta\)/ })).toHaveCount(0);
  await expect(page.getByText("Somente administradores publicam.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar" })).toHaveCount(0);
  await page.getByRole("button", { name: "Enviar para revisão" }).click();
  await expect(panel(page).getByText("Em revisão", { exact: true })).toBeVisible();
});

test("admin publica; o produto aparece na loja; despublicar remove", async ({ page }) => {
  await login(page, "admin");
  await openTestProduct(page);
  await expect(panel(page).getByRole("button", { name: /\(falta\)/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Publicar" }).click();
  const dialog = page.getByRole("dialog", { name: "Publicar na loja?" });
  await expect(dialog.getByRole("button", { name: "Publicar agora" })).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Publicar agora" }).click();
  await expect(panel(page).getByText("Publicado", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ver na loja/ })).toBeVisible();

  const store = await page.context().newPage();
  await store.goto("/produtos");
  await expect(store.getByRole("link", { name: productName })).toBeVisible();
  await store.goto(`/produtos/${productSlug}`);
  await expect(store.getByRole("heading", { level: 1, name: productName })).toBeVisible();
  await expect(store.getByTestId("preco-atual")).toContainText("R$ 1.799,00");
  await expect(store.locator('script[type="application/ld+json"]').first()).toBeAttached();
  // Um único tamanho já vem escolhido: "Comprar agora" põe na sacola e abre a sacola.
  await store.getByRole("button", { name: "Comprar agora" }).click();
  await expect(store).toHaveURL(/\/carrinho$/);
  await expect(store.getByRole("link", { name: productName })).toBeVisible();
  await expect(store.getByRole("complementary", { name: "Resumo" })).toContainText("R$ 1.799,00");
  await store.goto("/categorias/colchoes");
  await expect(store.getByRole("link", { name: productName })).toBeVisible();

  await page.getByRole("button", { name: "Despublicar (voltar para rascunho)" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Despublicar" }).click();
  await expect(panel(page).getByText("Rascunho", { exact: true })).toBeVisible();

  await store.goto("/produtos");
  await expect(store.getByRole("link", { name: productName })).toHaveCount(0);
});

test("editor não altera produto publicado", async ({ page }) => {
  // Publica de novo como admin…
  await login(page, "admin");
  await openTestProduct(page);
  await page.getByRole("button", { name: "Publicar" }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("dialog").getByRole("button", { name: "Publicar agora" }).click();
  await expect(panel(page).getByText("Publicado", { exact: true })).toBeVisible();
  const url = page.url();
  await page.getByRole("button", { name: "Sair" }).first().click();
  await expect(page).toHaveURL(/\/admin\/login/);

  // …e o editor vê em modo somente leitura, em qualquer aba.
  await login(page, "editor");
  await page.goto(url);
  await expect(page.getByText("Somente leitura")).toBeVisible();
  await expect(page.locator("#upload-file")).toHaveCount(0);
  await tab(page, "Informações").click();
  await expect(page.getByLabel("Nome do produto")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
});

test("produto de demonstração não pode ser publicado", async ({ page }) => {
  const db = service();
  const { data: category } = await db.from("categories").select("id").eq("slug", "colchoes").single();
  const { error } = await db.from("products").insert({
    name: `Demonstração E2E ${unique}`,
    slug: demoSlug,
    status: "draft",
    is_demo: true,
    category_id: category!.id,
    description: "Texto ilustrativo.",
    price_cents: 100000,
  });
  expect(error).toBeNull();

  await login(page, "admin");
  await page.goto(`/admin/produtos?q=${encodeURIComponent(demoSlug)}`);
  await page.getByRole("link", { name: /Demonstração E2E/ }).first().click();
  await expect(page.getByText("Produto de demonstração", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar" })).toBeDisabled();
});

test("salvar de novo não recria os tamanhos (sacolas continuam válidas)", async ({ page }) => {
  const db = service();
  const variants = async () => {
    const { data: product } = await db.from("products").select("id").eq("slug", productSlug).single();
    const { data } = await db.from("product_variants").select("id, price_cents").eq("product_id", product!.id).order("sort_order");
    return data ?? [];
  };

  await login(page, "admin");
  await openTestProduct(page);
  await tab(page, "Preço").click();
  const save = page.getByRole("button", { name: "Salvar alterações" });

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

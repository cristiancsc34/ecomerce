#!/usr/bin/env node
/**
 * Gera o arquivo do iPhone (.usdz) em TAMANHO REAL para modelos 3D que já existem.
 * Mesma conferência do estúdio: escala pelas medidas do catálogo, tolerância de 2 cm.
 * Sem medidas no catálogo, ou fora da tolerância, não gera nada (e diz por quê).
 *
 * 1) Um arquivo solto (não mexe em banco nenhum):
 *
 *      npm run ar:usdz -- --glb public/demo/poltrona-azul.glb --medidas 78x90x100 [--saida pasta]
 *
 *    --medidas é largura × profundidade × altura, em cm. Grava <nome>.usdz e
 *    <nome>-escala-real.glb na pasta de saída (padrão: a pasta do .glb).
 *
 * 2) Os produtos do Supabase (requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 *    em .env.local, e a migração 20261103000300_ar_real_scale aplicada):
 *
 *      npm run ar:usdz -- --supabase            # só mostra o que faria
 *      npm run ar:usdz -- --supabase --aplicar  # grava os arquivos e marca "tamanho real"
 *
 * No painel, o mesmo vale pelo botão "Conferir medidas e gerar o arquivo do iPhone"
 * (Estúdio → Modelo 3D).
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { formatBox, prepareArFiles, USDZ_MIME } from "./ar-files.mjs";

const BUCKET = "product-media";

const { values } = parseArgs({
  options: {
    glb: { type: "string" },
    medidas: { type: "string" },
    saida: { type: "string" },
    supabase: { type: "boolean", default: false },
    aplicar: { type: "boolean", default: false },
  },
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function fromFile() {
  const match = /^(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)$/i.exec(values.medidas ?? "");
  const [widthCm, lengthCm, heightCm] = match ? match.slice(1).map((v) => Number(v.replace(",", "."))) : [];
  const result = await prepareArFiles(await readFile(values.glb), match ? { widthCm, lengthCm, heightCm } : {});
  if (result.status !== "ok") fail(result.message);
  const dir = values.saida ?? path.dirname(values.glb);
  const name = path.basename(values.glb, path.extname(values.glb));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${name}.usdz`), result.usdz);
  await writeFile(path.join(dir, `${name}-escala-real.glb`), result.glb);
  console.log(`${result.message}\nGravados: ${path.join(dir, `${name}.usdz`)} e ${path.join(dir, `${name}-escala-real.glb`)}`);
}

async function fromSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: rows, error } = await supabase
    .from("product_media")
    .select("id,storage_path,usdz_storage_path,real_scale,product:products(id,name,dimensions)")
    .eq("media_type", "model_3d")
    .order("created_at");
  if (error) fail(`Falha ao ler os modelos 3D: ${error.message}`);
  if (!rows.length) return console.log("Nenhum produto com modelo 3D.");
  if (!values.aplicar) console.log("Simulação (nada é gravado). Use --aplicar para gravar.\n");

  for (const media of rows) {
    const product = media.product;
    const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(media.storage_path);
    if (downloadError || !blob) {
      console.log(`✗ ${product.name}: não foi possível baixar o modelo (${media.storage_path}).`);
      continue;
    }
    const result = await prepareArFiles(Buffer.from(await blob.arrayBuffer()), product.dimensions);
    if (result.status !== "ok") {
      console.log(`– ${product.name}: ${result.message}`);
      continue;
    }
    if (!values.aplicar) {
      console.log(`✓ ${product.name}: geraria o .usdz (${formatBox(result.boundsCm)}).`);
      continue;
    }
    const base = `products/${product.id}/${randomUUID()}`;
    const options = { cacheControl: "31536000", upsert: false };
    const up1 = await supabase.storage.from(BUCKET).upload(`${base}.glb`, result.glb, { ...options, contentType: "model/gltf-binary" });
    const up2 = up1.error ? up1 : await supabase.storage.from(BUCKET).upload(`${base}.usdz`, result.usdz, { ...options, contentType: USDZ_MIME });
    if (up1.error || up2.error) {
      await supabase.storage.from(BUCKET).remove([`${base}.glb`, `${base}.usdz`]);
      console.log(`✗ ${product.name}: falha ao gravar os arquivos (${(up1.error ?? up2.error).message}).`);
      continue;
    }
    const { error: updateError } = await supabase
      .from("product_media")
      .update({ storage_path: `${base}.glb`, size_bytes: result.glb.length, usdz_storage_path: `${base}.usdz`, real_scale: true, bounds_cm: result.boundsCm })
      .eq("id", media.id);
    if (updateError) {
      await supabase.storage.from(BUCKET).remove([`${base}.glb`, `${base}.usdz`]);
      console.log(`✗ ${product.name}: falha ao atualizar o banco (${updateError.message}).`);
      continue;
    }
    // Os arquivos antigos ficam só se outra mídia (ex.: produto duplicado) ainda os usa.
    const old = [media.storage_path, media.usdz_storage_path].filter(Boolean);
    const { data: stillUsed } = await supabase.from("product_media").select("storage_path").in("storage_path", old);
    const used = new Set((stillUsed ?? []).map((r) => r.storage_path));
    const orphans = old.filter((p) => !used.has(p));
    if (orphans.length) await supabase.storage.from(BUCKET).remove(orphans);
    console.log(`✓ ${product.name}: ${result.message}`);
  }
  if (values.aplicar) console.log("\nPronto. A vitrine atualiza na próxima leitura do catálogo (ou ao salvar o produto no painel).");
}

if (values.supabase) await fromSupabase();
else if (values.glb) await fromFile();
else fail("Uso: npm run ar:usdz -- --glb <arquivo.glb> --medidas <L>x<P>x<A>  |  npm run ar:usdz -- --supabase [--aplicar]");

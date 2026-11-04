import { brand, whatsappHref } from "@/config/brand";
import { arFiles, model3d } from "@/lib/catalog/product-helpers";
import { colorOptions } from "@/lib/catalog/variants";
import type { Product, ProductMedia } from "@/lib/catalog/types";
import { ChevronDownIcon, CubeIcon } from "@/components/ui/icons";
import { ArchitectsInterestLink } from "./architects-interest-link";

const cm = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const NOT_INFORMED = "Ainda não informado pela loja";

/** Nome legível do arquivo baixado: cuxoes-poltrona-azul.glb (ou -marrom.glb para uma cor). */
export function downloadName(slug: string, ext: "glb" | "usdz", color?: string) {
  return `cuxoes-${slug}${color ? `-${color}` : ""}.${ext}`;
}

/**
 * Link de download com o nome legível. O atributo `download` só vale para a
 * mesma origem (arquivos em /public); no Storage do Supabase o nome vai pelo
 * parâmetro `?download=` (o Storage responde com Content-Disposition).
 */
export function downloadHref(url: string, name: string) {
  if (url.startsWith("/")) return url;
  const u = new URL(url);
  u.searchParams.set("download", name);
  return u.toString();
}

function FileLink({ url, name, label, detail }: { url: string; name: string; label: string; detail: string }) {
  return (
    <li>
      <a
        href={downloadHref(url, name)}
        download={name}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-deep-fjord/25 bg-white px-4 text-sm font-semibold text-deep-fjord hover:bg-pale-blue focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-air-blue"
      >
        <CubeIcon className="h-4 w-4" /> {label}
      </a>
      <span className="ml-2 text-xs text-muted">
        {name} · {detail}
      </span>
    </li>
  );
}

/**
 * Contato para o pedido do arquivo: WhatsApp com a mensagem pronta (se a loja
 * tiver WhatsApp), senão a página de atendimento.
 */
export function architectsContactHref(productName: string, whatsapp = brand.contact.whatsapp): string {
  const wa = whatsapp ? whatsappHref(whatsapp) : null;
  if (!wa) return "/atendimento";
  const text = `Olá! Sou arquiteto(a) ou designer de interiores e quero o arquivo 3D e a ficha técnica de ${productName}.`;
  return `${wa}?text=${encodeURIComponent(text)}`;
}

/**
 * Área de arquitetos e designers, em duas fases:
 *
 * - Enquanto as medidas do produto não forem conferidas com o modelo 3D, só uma
 *   linha discreta: "É arquiteto ou designer? Peça o arquivo 3D". O pedido vai ao
 *   atendimento e o clique é medido (evento arquitetos_interesse). Assim a loja
 *   não entrega um arquivo com escala errada e descobre se há interesse.
 * - Com o tamanho real conferido: seção recolhida com o download do .glb e do
 *   .usdz (nome legível) e a ficha técnica só com dados do catálogo.
 *
 * Mais à frente pode virar um programa de indicação (ver docs/PROGRAMA-INDICACAO.md).
 * Aparece só em produto com modelo 3D.
 */
export function ArchitectsSection({ product }: { product: Product }) {
  const model = model3d(product);
  if (!model) return null;
  const base = product.media.find((m) => m.type === "model_3d" && m.variantId === null) ?? model;
  const ar = arFiles(product, base);

  if (!ar.realScale) {
    return (
      <p className="px-4 py-2 text-sm text-muted sm:px-6" data-testid="arquitetos">
        É arquiteto ou designer de interiores?{" "}
        <ArchitectsInterestLink href={architectsContactHref(product.name)} productId={product.id} />.
      </p>
    );
  }
  const d = product.dimensions;
  const a = product.attributes;
  const ownModels = colorOptions(product).filter((c) => c.model.own && c.model.model) as (ReturnType<typeof colorOptions>[number] & {
    model: { model: ProductMedia };
  })[];

  const rows: { label: string; value: string }[] = [
    {
      label: "Medidas (L × P × A)",
      value: d.widthCm && d.lengthCm && d.heightCm ? `${cm(d.widthCm)} × ${cm(d.lengthCm)} × ${cm(d.heightCm)} cm` : NOT_INFORMED,
    },
    { label: "Peso", value: d.weightKg ? `${cm(d.weightKg)} kg` : NOT_INFORMED },
    { label: "Materiais", value: a.materials?.length ? a.materials.join(", ") : NOT_INFORMED },
    ...(a.fabric ? [{ label: "Tecido", value: a.fabric }] : []),
    ...(product.variants.some((v) => v.colorHex) ? [{ label: "Cores", value: product.variants.filter((v) => v.colorHex).map((v) => v.name).join(", ") }] : []),
  ];

  return (
    <section aria-labelledby="arquitetos-titulo" className="bg-white px-4 py-2 sm:rounded-lg sm:px-6" data-testid="arquitetos">
      {/*
        Captura de contatos: o projeto ainda não tem (newsletter ou leads). Quando tiver,
        peça nome e e-mail antes de liberar os links abaixo e salve como lead do tipo
        "arquiteto" (ex.: um formulário com Server Action que grava numa tabela `leads`
        e só então mostra os arquivos). Por enquanto, o download é livre.
      */}
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden">
          <h2 id="arquitetos-titulo" className="text-base font-bold uppercase tracking-wide text-deep-fjord">
            Para arquitetos e designers
          </h2>
          <ChevronDownIcon aria-hidden="true" className="h-5 w-5 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 pb-4">
          <p className="text-sm text-muted">
            Baixe o modelo 3D para usar no seu projeto, em tamanho real, conferido com as medidas do catálogo (tolerância
            de 2 cm). O .glb abre no Blender, no SketchUp para computador (2024 ou mais recente, planos Pro e Studio),
            no Lumion, no D5 Render, no Twinmotion e no Rhino; o Revit não abre .glb. O .usdz abre no iPhone e no iPad,
            inclusive em realidade aumentada, e no Mac em 3D.
            {base.isIllustrative ? " Modelo gerado por IA a partir das fotos: proporções e cores aproximadas." : null}
          </p>
          <ul className="space-y-2">
            <FileLink url={base.url} name={downloadName(product.slug, "glb")} label="Baixar .glb" detail="modelo 3D" />
            {ar.usdzUrl ? (
              <FileLink url={ar.usdzUrl} name={downloadName(product.slug, "usdz")} label="Baixar .usdz" detail="iPhone, iPad e Mac" />
            ) : null}
            {ownModels.map((c) => (
              <FileLink
                key={c.id}
                url={c.model.model.url}
                name={downloadName(product.slug, "glb", c.slug)}
                label={`Baixar .glb (${c.name})`}
                detail={`modelo 3D na cor ${c.name.toLowerCase()}`}
              />
            ))}
          </ul>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Ficha técnica</h3>
            <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line text-sm">
              {rows.map((r) => (
                <div key={r.label} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
                  <dt className="font-medium text-muted">{r.label}</dt>
                  <dd className={r.value === NOT_INFORMED ? "text-muted" : "text-ink"}>{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </details>
    </section>
  );
}

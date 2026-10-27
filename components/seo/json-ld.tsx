/**
 * Dados estruturados (schema.org). Escapa "<" para impedir que um texto vindo
 * do banco feche a tag <script>.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

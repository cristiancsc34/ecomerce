import { SubpageRoute, subpageMetadata, subpageStaticParams } from "@/components/catalog/section-routes";

export function generateStaticParams() {
  return subpageStaticParams("estofados");
}

export async function generateMetadata({ params }: PageProps<"/estofados/[sub]">) {
  return subpageMetadata("estofados", (await params).sub);
}

export default function Page({ params }: PageProps<"/estofados/[sub]">) {
  return <SubpageRoute section="estofados" params={params} />;
}

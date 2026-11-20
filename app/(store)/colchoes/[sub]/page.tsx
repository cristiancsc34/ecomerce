import { SubpageRoute, subpageMetadata, subpageStaticParams } from "@/components/catalog/section-routes";

export function generateStaticParams() {
  return subpageStaticParams("colchoes");
}

export async function generateMetadata({ params }: PageProps<"/colchoes/[sub]">) {
  return subpageMetadata("colchoes", (await params).sub);
}

export default function Page({ params }: PageProps<"/colchoes/[sub]">) {
  return <SubpageRoute section="colchoes" params={params} />;
}

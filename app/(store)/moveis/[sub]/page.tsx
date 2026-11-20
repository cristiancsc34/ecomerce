import { SubpageRoute, subpageMetadata, subpageStaticParams } from "@/components/catalog/section-routes";

export function generateStaticParams() {
  return subpageStaticParams("moveis");
}

export async function generateMetadata({ params }: PageProps<"/moveis/[sub]">) {
  return subpageMetadata("moveis", (await params).sub);
}

export default function Page({ params }: PageProps<"/moveis/[sub]">) {
  return <SubpageRoute section="moveis" params={params} />;
}

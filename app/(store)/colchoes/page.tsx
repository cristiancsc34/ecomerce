import { SectionRoute, sectionMetadata } from "@/components/catalog/section-routes";

export function generateMetadata() {
  return sectionMetadata("colchoes");
}

export default function Page() {
  return <SectionRoute section="colchoes" />;
}

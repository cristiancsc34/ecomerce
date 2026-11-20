import { SectionRoute, sectionMetadata } from "@/components/catalog/section-routes";

export function generateMetadata() {
  return sectionMetadata("estofados");
}

export default function Page() {
  return <SectionRoute section="estofados" />;
}

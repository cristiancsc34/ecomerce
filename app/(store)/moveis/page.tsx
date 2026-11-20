import { SectionRoute, sectionMetadata } from "@/components/catalog/section-routes";

export function generateMetadata() {
  return sectionMetadata("moveis");
}

export default function Page() {
  return <SectionRoute section="moveis" />;
}

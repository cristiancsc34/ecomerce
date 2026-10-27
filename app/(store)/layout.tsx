import { AnnouncementBar, DemoBanner, SkipLink } from "@/components/layout/banners";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SkipLink />
      <DemoBanner />
      <AnnouncementBar />
      <Header />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <Footer />
    </>
  );
}

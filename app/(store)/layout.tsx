import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { AnnouncementBar, SkipLink } from "@/components/layout/banners";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { assistantEnabled } from "@/lib/assistant/config";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const comAssistente = assistantEnabled();
  return (
    <div className="flex min-h-svh flex-col">
      <SkipLink />
      <AnnouncementBar />
      <Header />
      <main
        id="conteudo"
        tabIndex={-1}
        // Espaço no fim da página para o botão Ajuda (fixo) não cobrir o último conteúdo no celular.
        className={`min-h-svh flex-1 outline-none ${comAssistente ? "pb-20 lg:pb-0" : ""}`}
      >
        {children}
      </main>
      <Footer />
      {comAssistente ? <AssistantWidget /> : null}
    </div>
  );
}

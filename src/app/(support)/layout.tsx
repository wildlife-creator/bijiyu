import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";

interface SupportLayoutProps {
  children: React.ReactNode;
}

export default function SupportLayout({ children }: SupportLayoutProps) {
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader isAuthenticated={false} />

      {/* 戻る導線は各ページ下部の <BackButton />（もどる）に一本化。
          layout の左上「＜」は撤去（ログイン後アプリと表示を揃える）。 */}
      <main className="px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
        {children}
      </main>
      <Toaster position="top-center" />
    </div>
  );
}

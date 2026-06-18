import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader isAuthenticated={false} />

      {/* 戻る導線は layout では持たない。入口フォーム3画面のみ各ページで
          <BackChevron /> を配置する（CLAUDE.md 戻るボタン方針）。 */}
      <main className="px-4 py-6 md:mx-auto md:max-w-lg">{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}

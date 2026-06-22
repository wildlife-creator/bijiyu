import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";

interface SupportLayoutProps {
  children: React.ReactNode;
}

/**
 * (support) ルートグループ共通レイアウト。
 * /contact, /faq, /legal, /privacy, /terms はログイン中・未ログインどちらからも開けるため、
 * ヘッダーの SiteHeader は現在の認証状態に追従させる（=ログイン中はログイン後ハンバーガー）。
 */
export default async function SupportLayout({ children }: SupportLayoutProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasActiveSubscription = false;
  if (user) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .maybeSingle();
    hasActiveSubscription = !!subscription;
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader
        isAuthenticated={!!user}
        hasActiveSubscription={hasActiveSubscription}
      />

      {/* 戻る導線は各ページ下部の <BackButton />（もどる）に一本化。
          layout の左上「＜」は撤去（ログイン後アプリと表示を揃える）。 */}
      <main className="px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
        {children}
      </main>
      <Toaster position="top-center" />
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";

interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * (auth) ルートグループ共通レイアウト。
 * 通常は未認証ユーザー専用だが、middleware の例外で /reset-password はログイン済
 * ユーザーも踏める（ハンバーガー「パスワード再設定」導線）。
 * その場合はログイン後ハンバーガーを出すため、SiteHeader は実際の認証状態に追従させる。
 */
export default async function AuthLayout({ children }: AuthLayoutProps) {
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

      {/* 戻る導線は layout では持たない。入口フォーム3画面のみ各ページで
          <BackChevron /> を配置する（CLAUDE.md 戻るボタン方針）。 */}
      <main className="px-4 py-6 md:mx-auto md:max-w-lg">{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}

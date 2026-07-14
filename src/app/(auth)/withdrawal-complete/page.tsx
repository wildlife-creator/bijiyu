import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * COM-006 退会完了ページ（AUTH-007 登録完了と対になる着地画面）。
 *
 * 退会処理（withdrawAction）はセッションを signOut() で破棄するため、
 * このページはログアウト済みの状態で表示される。middleware の PUBLIC_PAGES に
 * 登録して未認証アクセスを許可している。
 *
 * 退会フォームからは window.location.href（ハード遷移）で着地させる。
 * router.push（ソフト遷移）だと Router Cache / 再レンダリング競合で
 * Next.js 標準の 404 に落ちるため（CLAUDE.md「Router Cache とリダイレクト」）。
 */
export default function WithdrawalCompletePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
        <h1 className="text-center text-heading-xl font-bold text-secondary">
          退会完了
        </h1>
        <div className="space-y-3">
          <p className="text-body-base text-foreground">
            退会手続きが完了しました。
          </p>
          <p className="text-body-base text-foreground">
            ビジ友をご利用いただきありがとうございました。
          </p>
          <p className="text-body-sm text-muted-foreground">
            退会完了のご案内をメールでお送りしました。
          </p>
        </div>
        <Button variant="outline" className="h-12 w-full rounded-[47px]" asChild>
          <Link href="/">トップページへ</Link>
        </Button>
      </div>
    </div>
  );
}

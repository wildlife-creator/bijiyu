import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * COM-006 退会完了ページ（AUTH-007 登録完了と対になる着地画面）。
 *
 * 退会直後はユーザーが deleted_at セット済み・ban 済みで、signOut() の Cookie
 * 反映が window.location.href のナビゲーションに間に合わないことがある。その状態で
 * (authenticated) / (auth) 配下に置くと、middleware の deleted_at ガードで /login に
 * 飛ばされて完了画面が出ない（staging で実際に発生）。そのため:
 *   - ページはアプリ最上位（ルート）に置き、認証ヘッダー等に依存しない自己完結構成にする
 *   - middleware で /withdrawal-complete を早期に通し、同時に sb- Cookie を掃除する
 * 詳細は src/middleware.ts の該当分岐コメント参照。
 */
export default function WithdrawalCompletePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-10">
      <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
        <img
          src="/images/logo-horizontal.png"
          alt="ビジ友"
          className="h-9 w-auto"
        />
        <h1 className="text-heading-xl font-bold text-secondary">退会完了</h1>
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
        <Button
          variant="outline"
          className="h-12 w-full max-w-xs rounded-[47px]"
          asChild
        >
          <Link href="/">トップページへ</Link>
        </Button>
      </div>
    </main>
  );
}

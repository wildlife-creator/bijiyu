import Image from "next/image";

interface EmailLandingCardProps {
  children: React.ReactNode;
  /** ロゴ表示 (default: true)。SiteHeader と重複させたくない時(/contact 等)は false。 */
  showLogo?: boolean;
}

/**
 * メールから飛ぶ着地ページ用の共通カード。
 * `src/lib/email/components/` の M-09 共通レイアウトと視覚的にそろえる:
 *   - 白カード + border-radius + 軽い影
 *   - ヘッダー: ロゴ画像 + 紫太線 3px (showLogo=true 時)
 *   - 紫太線 のみ (showLogo=false 時、SiteHeader と二重にしないため)
 *   - 本文: padding 多めで余裕のあるレイアウト
 *
 * 対象ページ: /accept-invite/confirm, /reset-password/confirm, /register/verify, /contact
 * 設計詳細は `.kiro/specs/notifications/email-decisions-wip.md` の M-09 を参照。
 */
export function EmailLandingCard({
  children,
  showLogo = true,
}: EmailLandingCardProps) {
  return (
    <div className="mx-auto my-6 max-w-[600px] overflow-hidden rounded-2xl bg-white shadow-[0_6px_16px_rgba(85,30,99,0.08)]">
      {showLogo ? (
        <div className="flex justify-center border-b-[3px] border-primary bg-white px-6 pb-6 pt-8">
          <Image
            src="/images/logo-horizontal.png"
            alt="ビジ友"
            width={150}
            height={42}
            priority
            className="block h-auto"
          />
        </div>
      ) : (
        <div className="border-t-[3px] border-primary" />
      )}
      <div className="px-6 py-10 md:px-9">{children}</div>
    </div>
  );
}

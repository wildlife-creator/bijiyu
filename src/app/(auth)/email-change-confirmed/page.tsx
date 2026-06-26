"use client";

import { useEffect, useState } from "react";

import { EmailLandingCard } from "@/components/auth-landing/email-landing-card";
import { LinkExpiredCard } from "@/components/auth/link-expired-card";

/**
 * §5.5.D メール変更確認後ランディング画面。
 *
 * セルフメール変更フロー(profile/edit / CLI-022 の updateMemberAction パターン A)で
 * Supabase Auth が新メール宛 §5.5.A / 旧メール宛 §5.5.B の確認リンクをそれぞれ送る。
 * リンクがクリックされた時、Supabase が verify 完了後にここへリダイレクトする。
 *
 * `double_confirm_changes = true` のため、両方のリンククリック後に変更が確定する。
 * ヘッダに「完了しました」と書かず「受け付けました」とする(片方完了 / もう片方待ち を正確に表現)。
 *
 * 期限切れ / 使用済み時は URL フラグメント `#error=...&error_description=...` が
 * 付くため、Client Component で window.location.hash を見て分岐する。
 */
export default function EmailChangeConfirmedPage() {
  const [isExpired, setIsExpired] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.location.hash) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      if (params.get("error_description") || params.get("error")) {
        setIsExpired(true);
      }
      // フラグメントを URL から除去(リロード時の再処理防止)
      window.history.replaceState(null, "", window.location.pathname);
    }
    setIsReady(true);
  }, []);

  if (!isReady) {
    return null;
  }

  if (isExpired) {
    return (
      <EmailLandingCard>
        <LinkExpiredCard actionText="お手数ですが、もう一度メールアドレス変更をお申し込みください。" />
      </EmailLandingCard>
    );
  }

  return (
    <EmailLandingCard>
      <div className="space-y-6">
        <h1 className="text-heading-lg font-bold text-secondary text-center">
          ご本人確認のリンクを受け付けました
        </h1>
        <p className="text-body-base leading-relaxed">
          新しいメールアドレスと現在のメールアドレス、両方に届いた確認リンクをクリックしていただくと、メールアドレスの変更が完了します。
        </p>
        <p className="text-body-base leading-relaxed">
          パスワードはこれまでのものをそのままご利用いただけます。
        </p>
      </div>
    </EmailLandingCard>
  );
}

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
 * 1 通目のあと（Supabase が `message=Confirmation link accepted...` を付ける）と
 * 変更完了時（PKCE の `?code=` / implicit の `#access_token=...&type=email_change`）で文言を出し分ける。
 *
 * 期限切れ / 使用済み時は `error=...&error_description=...` が付くため、
 * Client Component で window.location の query / hash を見て分岐する。
 */
type LandingState = "expired" | "completed" | "firstLinkAccepted";

const SINGLE_CONFIRMATION_MESSAGE_PREFIX = "Confirmation link accepted";

/**
 * Supabase のリダイレクト URL（query / hash）から表示状態を判定する。
 * - error / error_description → 期限切れ・使用済み
 * - message = "Confirmation link accepted..." → 1 通目のリンクだけ開いた状態
 * - code（PKCE）/ access_token・type=email_change（implicit）→ 両方開いて変更完了
 * - 判定材料が無い（リロード等）→ 1 通目扱い（「完了」と誤って断定しない）
 */
function resolveLandingState(search: string, hash: string): LandingState {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const get = (key: string) => query.get(key) ?? fragment.get(key);

  if (get("error") || get("error_description")) return "expired";
  if (get("message")?.startsWith(SINGLE_CONFIRMATION_MESSAGE_PREFIX)) {
    return "firstLinkAccepted";
  }
  if (get("code") || get("access_token") || get("type") === "email_change") {
    return "completed";
  }
  return "firstLinkAccepted";
}

export default function EmailChangeConfirmedPage() {
  const [state, setState] = useState<LandingState | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const { search, hash, pathname } = window.location;
    // URL の読み取りは useEffect でしか書けないため rule を意図的に無効化
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(resolveLandingState(search, hash));
    if (search || hash) {
      // トークン・メッセージを URL から除去(リロード時の再処理防止)
      window.history.replaceState(null, "", pathname);
    }
  }, []);

  if (state === null) {
    return null;
  }

  if (state === "expired") {
    return (
      <EmailLandingCard>
        <LinkExpiredCard actionText="お手数ですが、もう一度メールアドレス変更をお申し込みください。" />
      </EmailLandingCard>
    );
  }

  if (state === "completed") {
    return (
      <EmailLandingCard>
        <div className="space-y-6">
          <h1 className="text-heading-lg font-bold text-secondary text-center">
            メールアドレスの変更が完了しました
          </h1>
          <p className="text-body-base leading-relaxed">
            次回から新しいメールアドレスでログインしてください。
          </p>
          <p className="text-body-base leading-relaxed">
            パスワードはこれまでのものをそのままご利用いただけます。
          </p>
        </div>
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
          もう一方のメールアドレスに届いた確認リンクも開くと、変更が完了します。
        </p>
        <p className="text-body-base leading-relaxed">
          パスワードはこれまでのものをそのままご利用いただけます。
        </p>
      </div>
    </EmailLandingCard>
  );
}

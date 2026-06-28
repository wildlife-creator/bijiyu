import { describe, expect, it } from "vitest";

import { passwordResetCompletedEmail } from "@/lib/email/templates/password-reset-completed";

/**
 * §5.8.A パスワードリセット完了通知（Resend）。
 * §5.8 申請メール（Supabase Auth recovery）と対になり、PW 設定成功後に発火。
 * セキュリティ強化目的: hijack 検知のため、本人のメアドへ「変更されました」通知 + お問い合わせ窓口リンク。
 */

describe("passwordResetCompletedEmail", () => {
  it("件名は「【ビジ友】パスワードの変更が完了しました」固定", () => {
    const { subject } = passwordResetCompletedEmail({
      recipientName: "山田太郎",
      changedAt: "2026/06/28 10:30",
    });
    expect(subject).toBe("【ビジ友】パスワードの変更が完了しました");
  });

  it("html に宛名・変更日時・お問い合わせ窓口リンクを含む", () => {
    const { html } = passwordResetCompletedEmail({
      recipientName: "山田太郎",
      changedAt: "2026/06/28 10:30",
    });
    expect(html).toContain("山田太郎 様");
    expect(html).toContain("パスワードの変更が完了しました");
    expect(html).toContain("【変更日時】");
    expect(html).toContain("2026/06/28 10:30");
    expect(html).toContain("身に覚えがない場合は");
    expect(html).toContain("/contact");
  });

  it("マーケ調 opening / CTA リンク / 新旧パスワードを含まない（M-04 厳密適用 + セキュリティ）", () => {
    const { html } = passwordResetCompletedEmail({
      recipientName: "山田太郎",
      changedAt: "2026/06/28 10:30",
    });
    expect(html).not.toContain("いつもビジ友をご利用いただきありがとうございます");
    expect(html).not.toContain("ログイン画面へ");
    expect(html).not.toContain("マイページから");
    expect(html).not.toContain("新しいパスワード:");
    expect(html).not.toContain("旧パスワード");
    // 「リンクを開かなければ」表現は申請メール側の文言（§5.8）。完了通知では使わない
    expect(html).not.toContain("リンクを開かなければ");
  });
});

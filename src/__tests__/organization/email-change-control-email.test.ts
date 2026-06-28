import { describe, expect, it } from "vitest";

import { emailChangedByAdminControlEmail } from "@/lib/email/templates/email-changed-by-admin-control";

/**
 * §5.4.B 管理者メール強制変更の組織管理層宛 control mail。
 * §5.2.A 招待 control と並列構造、closing なし、組織名は含めない。
 */

describe("emailChangedByAdminControlEmail (§5.4.B)", () => {
  const baseProps = {
    recipientName: "発注者一郎",
    targetName: "田中太郎",
    oldEmail: "tanaka.old@example.com",
    newEmail: "tanaka.new@example.com",
    actorName: "山田一郎",
    changedAt: "2026/06/28 14:30",
  };

  it("件名「【ビジ友】{targetName}さんのメールアドレスを変更しました」", () => {
    const { subject } = emailChangedByAdminControlEmail(baseProps);
    expect(subject).toBe(
      "【ビジ友】田中太郎さんのメールアドレスを変更しました",
    );
  });

  it("本文に受信者名 + 5 項目 (対象担当者 / 旧メアド / 新メアド / 操作者 / 変更日時)", () => {
    const { html } = emailChangedByAdminControlEmail(baseProps);
    expect(html).toContain("発注者一郎 様");
    expect(html).toContain("下記のメールアドレス変更が行われました");
    expect(html).toContain("【対象担当者】 田中太郎");
    expect(html).toContain("【旧メールアドレス】 tanaka.old@example.com");
    expect(html).toContain("【新メールアドレス】 tanaka.new@example.com");
    expect(html).toContain("【操作者】 山田一郎");
    expect(html).toContain("【変更日時】 2026/06/28 14:30");
  });

  it("組織名・パスワード継続案内・CTA・deep link を含まない (§5.4.A 本人宛と区別)", () => {
    const { html } = emailChangedByAdminControlEmail(baseProps);
    // 組織名は受信者にとって自明 → 含めない
    expect(html).not.toContain("組織");
    expect(html).not.toContain("ビジ友組織");
    // §5.4.A 本人宛の文言は出さない
    expect(html).not.toContain("パスワードはこれまでのもの");
    expect(html).not.toContain("身に覚えがない");
    // CTA / deep link
    expect(html).not.toContain("/contact");
    expect(html).not.toContain("マイページ");
    // closing なし
    expect(html).not.toContain("ご検討ください");
    expect(html).not.toContain("いつもビジ友");
  });
});

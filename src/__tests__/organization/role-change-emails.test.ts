import { describe, expect, it } from "vitest";

import { memberRoleChangedEmail } from "@/lib/email/templates/member-role-changed";
import { memberRoleChangedControlEmail } from "@/lib/email/templates/member-role-changed-control";

/**
 * §5.6.A / §5.6.B 権限変更通知メールの単体検証。
 * 本人宛 = closing にお問い合わせ窓口リンクあり、組織側 = closing なし。
 */

describe("memberRoleChangedEmail (§5.6.A 本人宛)", () => {
  const baseProps = {
    recipientName: "田中太郎",
    oldRoleLabel: "担当者",
    newRoleLabel: "管理者",
    actorName: "山田一郎",
    changedAt: "2026/06/28 14:30",
  };

  it("件名は固定「【ビジ友】あなたの権限が変更されました」", () => {
    const { subject } = memberRoleChangedEmail(baseProps);
    expect(subject).toBe("【ビジ友】あなたの権限が変更されました");
  });

  it("本文に宛名 + 4 項目 + closing 「身に覚えがない場合は…/contact」テキストリンク", () => {
    const { html } = memberRoleChangedEmail(baseProps);
    expect(html).toContain("田中太郎 様");
    expect(html).toContain("あなたの組織内での権限が変更されました");
    expect(html).toContain("【変更前の権限】 担当者");
    expect(html).toContain("【変更後の権限】 管理者");
    expect(html).toContain("【変更操作者】 山田一郎");
    expect(html).toContain("【変更日時】 2026/06/28 14:30");
    expect(html).toContain("身に覚えがない場合は");
    expect(html).toContain("/contact");
  });

  it("マーケ調 opening / アプリ内 UI deep link / CTA ピル型を含まない", () => {
    const { html } = memberRoleChangedEmail(baseProps);
    expect(html).not.toContain("いつもビジ友をご利用");
    expect(html).not.toContain("マイページ");
    // closing の /contact は <a> タグだが「下記の」を含むテキストリンクで CTA ボタンではない
    expect(html).not.toContain("プラン状況を確認");
  });
});

describe("memberRoleChangedControlEmail (§5.6.B 組織管理層宛)", () => {
  const baseProps = {
    recipientName: "発注者一郎",
    targetName: "田中太郎",
    oldRoleLabel: "担当者",
    newRoleLabel: "管理者",
    actorName: "山田一郎",
    changedAt: "2026/06/28 14:30",
  };

  it("件名「【ビジ友】{targetName}さんの権限を変更しました」", () => {
    const { subject } = memberRoleChangedControlEmail(baseProps);
    expect(subject).toBe("【ビジ友】田中太郎さんの権限を変更しました");
  });

  it("本文に宛名 + 5 項目 (対象担当者・変更前/後・操作者・変更日時)、closing なし", () => {
    const { html } = memberRoleChangedControlEmail(baseProps);
    expect(html).toContain("発注者一郎 様");
    expect(html).toContain("下記の権限変更が行われました");
    expect(html).toContain("【対象担当者】 田中太郎");
    expect(html).toContain("【変更前の権限】 担当者");
    expect(html).toContain("【変更後の権限】 管理者");
    expect(html).toContain("【操作者】 山田一郎");
    expect(html).toContain("【変更日時】 2026/06/28 14:30");
    // closing なし
    expect(html).not.toContain("身に覚えがない");
    expect(html).not.toContain("/contact");
  });

  it("組織名・パスワード継続案内・CTA・deep link を含まない", () => {
    const { html } = memberRoleChangedControlEmail(baseProps);
    expect(html).not.toContain("組織");
    expect(html).not.toContain("マイページ");
    expect(html).not.toContain("いつもビジ友");
  });
});

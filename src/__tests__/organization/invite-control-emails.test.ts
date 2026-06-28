import { describe, expect, it } from "vitest";

import { adminClientInviteCompletedEmail } from "@/lib/email/templates/admin-client-invite-completed";
import { adminClientInvitedControlEmail } from "@/lib/email/templates/admin-client-invited-control";
import { memberInvitedControlEmail } from "@/lib/email/templates/member-invited-control";

/**
 * §5.2.A / §5.2.B / §5.3.B 招待関連控えメールの単体検証。
 * 表示文言・件名・closing 有無・CTA 欠如 (M-04 厳密) のリグレッション防止。
 */

describe("memberInvitedControlEmail (§5.2.A)", () => {
  const baseProps = {
    recipientName: "発注者一郎",
    memberName: "山田太郎",
    memberEmail: "yamada@test.local",
    roleLabel: "担当者",
    isProxyLabel: "いいえ",
    actorName: "佐藤花子",
    invitedAt: "2026/06/28 14:30",
  };

  it("件名「【ビジ友】{memberName}さんを担当者として招待しました」", () => {
    const { subject } = memberInvitedControlEmail(baseProps);
    expect(subject).toBe("【ビジ友】山田太郎さんを担当者として招待しました");
  });

  it("本文に受信者名・全 6 項目 (担当者氏名 / メアド / 権限 / 代理アカウント / 招待操作者 / 招待日時)", () => {
    const { html } = memberInvitedControlEmail(baseProps);
    expect(html).toContain("発注者一郎 様");
    expect(html).toContain("下記の担当者を招待しました");
    expect(html).toContain("【担当者氏名】 山田太郎");
    expect(html).toContain("【メールアドレス】 yamada@test.local");
    expect(html).toContain("【権限】 担当者");
    expect(html).toContain("【代理アカウント】 いいえ");
    expect(html).toContain("【招待操作者】 佐藤花子");
    expect(html).toContain("【招待日時】 2026/06/28 14:30");
  });

  it("admin 招待時は roleLabel = 管理者", () => {
    const { html } = memberInvitedControlEmail({ ...baseProps, roleLabel: "管理者" });
    expect(html).toContain("【権限】 管理者");
  });

  it("CTA / 招待リンク URL / 「マイページ」UI 名指し / closing を含まない (M-04 厳密 + spec 入れないもの)", () => {
    const { html } = memberInvitedControlEmail(baseProps);
    expect(html).not.toContain("招待を承諾する");
    expect(html).not.toContain("マイページ");
    expect(html).not.toContain("いつもビジ友をご利用");
    expect(html).not.toContain("ご検討ください");
    expect(html).not.toContain("お問い合わせ");
    // 招待リンク URL (受信者は招待された本人ではない、フィッシング誤クリック防止)
    expect(html).not.toContain("/accept-invite");
    expect(html).not.toContain("ConfirmationURL");
  });
});

describe("adminClientInvitedControlEmail (§5.2.B)", () => {
  const baseProps = {
    recipientName: "ビジ友管理者",
    memberName: "田中一郎",
    companyName: "株式会社□□工務店",
    memberEmail: "tanaka@example.com",
    invitedAt: "2026/06/28 14:30",
  };

  it("件名「【ビジ友 運営】{memberName} 様（{companyName}）を発注者として招待しました」", () => {
    const { subject } = adminClientInvitedControlEmail(baseProps);
    expect(subject).toBe(
      "【ビジ友 運営】田中一郎 様（株式会社□□工務店）を発注者として招待しました",
    );
  });

  it("本文に受信者名・全 4 項目 (担当者氏名 / 会社名 / メアド / 招待日時)", () => {
    const { html } = adminClientInvitedControlEmail(baseProps);
    expect(html).toContain("ビジ友管理者 様");
    expect(html).toContain("下記の発注者を招待しました");
    expect(html).toContain("【担当者氏名】 田中一郎");
    expect(html).toContain("【会社名】 株式会社□□工務店");
    expect(html).toContain("【メールアドレス】 tanaka@example.com");
    expect(html).toContain("【招待日時】 2026/06/28 14:30");
  });

  it("§5.2.A 固有の権限 / 代理アカウント / 招待操作者は出ない (Client 招待では概念なし)", () => {
    const { html } = adminClientInvitedControlEmail(baseProps);
    expect(html).not.toContain("【権限】");
    expect(html).not.toContain("【代理アカウント】");
    expect(html).not.toContain("【招待操作者】");
  });

  it("CTA / deep link / 招待リンク URL / closing を含まない", () => {
    const { html } = adminClientInvitedControlEmail(baseProps);
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/accept-invite");
    expect(html).not.toContain("いつもビジ友をご利用");
    expect(html).not.toContain("ご検討ください");
    expect(html).not.toContain("お問い合わせ");
  });
});

describe("adminClientInviteCompletedEmail (§5.3.B)", () => {
  const baseProps = {
    recipientName: "ビジ友管理者",
    memberName: "山田一郎",
    companyName: "株式会社□□工務店",
    memberEmail: "yamada@example.com",
    acceptedAt: "2026/06/24 09:15",
  };

  it("件名「【ビジ友 運営】{memberName} 様（{companyName}）がアカウント設定を完了しました」", () => {
    const { subject } = adminClientInviteCompletedEmail(baseProps);
    expect(subject).toBe(
      "【ビジ友 運営】山田一郎 様（株式会社□□工務店）がアカウント設定を完了しました",
    );
  });

  it("本文に受信者名・全 4 項目 + 状態説明 closing「ご契約のお申し込みにお進み」", () => {
    const { html } = adminClientInviteCompletedEmail(baseProps);
    expect(html).toContain("ビジ友管理者 様");
    expect(html).toContain("下記の発注者がアカウント設定を完了しました");
    expect(html).toContain("【担当者氏名】 山田一郎");
    expect(html).toContain("【会社名】 株式会社□□工務店");
    expect(html).toContain("【メールアドレス】 yamada@example.com");
    expect(html).toContain("【承諾日時】 2026/06/24 09:15");
    expect(html).toContain("現在、ご契約のお申し込みにお進みいただいています");
  });

  it("CTA / UI 名指し (/billing / マイページ) / 招待リンク URL を含まない", () => {
    const { html } = adminClientInviteCompletedEmail(baseProps);
    expect(html).not.toContain("/billing");
    expect(html).not.toContain("マイページ");
    expect(html).not.toContain("プラン申し込み画面");
    expect(html).not.toContain("/accept-invite");
    expect(html).not.toContain("いつもビジ友をご利用");
  });

  it("「招待を承諾しました」抽象表現は使わず「アカウント設定を完了」具体表現を使う", () => {
    const { subject, html } = adminClientInviteCompletedEmail(baseProps);
    expect(subject).not.toContain("招待を承諾");
    expect(html).not.toContain("招待を承諾");
  });
});

import { describe, expect, it } from "vitest";

import { accountCascadeFrozenProxyEmail } from "@/lib/email/templates/account-cascade-frozen-proxy";
import { accountCascadeFrozenStaffEmail } from "@/lib/email/templates/account-cascade-frozen-staff";
import { accountSuspendedByAdminEmail } from "@/lib/email/templates/account-suspended-by-admin";
import { adminPasswordChangedEmail } from "@/lib/email/templates/admin-password-changed";
import { registrationCompletedEmail } from "@/lib/email/templates/registration-completed";
import { orphanAuthUserAlertEmail } from "@/lib/email/templates/orphan-auth-user-alert";
import { emailRecycleFailureAlertEmail } from "@/lib/email/templates/email-recycle-failure-alert";

// ----------------------------------------------------------------------------
// §8.5.A-1 / §8.5.A-2 法人 Owner 退会カスケード - 代理 staff 向け
// ----------------------------------------------------------------------------

describe("accountCascadeFrozenProxyEmail — §8.5.A-1 / §8.5.A-2", () => {
  const BASE = {
    recipientName: "鈴木花子",
    organizationName: "株式会社○○建設",
    ownerName: "山田一郎",
    withdrawnAt: "2026/06/25 10:30",
  };

  it("§8.5.A-1 残存あり: 末尾「他の法人組織での代理業務は引き続き継続します。」", () => {
    const out = accountCascadeFrozenProxyEmail({
      ...BASE,
      hasRemainingMembership: true,
    });
    expect(out.subject).toBe(
      "【ビジ友 運営】「株式会社○○建設」の管理責任者の退会により、代理アカウント設定が解除されました",
    );
    expect(out.html).toContain("鈴木花子 様");
    expect(out.html).toContain("下記の組織の代理アカウントから、管理責任者の退会に伴い解除されました。");
    expect(out.html).toContain("【法人名】 株式会社○○建設");
    expect(out.html).toContain("【退会した管理責任者】 山田一郎");
    expect(out.html).toContain("【退会日時】 2026/06/25 10:30");
    expect(out.html).toContain("他の法人組織での代理業務は引き続き継続します。");
    expect(out.html).toContain("ご不明な点がある場合は、お手数ですが下記のお問い合わせ窓口までご連絡ください。");
    expect(out.html).toContain("/contact");
    expect(out.html).not.toContain("すべての法人組織での代理アカウント設定が解除されました");
  });

  it("§8.5.A-2 残存なし: 末尾「すべての法人組織での代理アカウント設定が解除されました。」", () => {
    const out = accountCascadeFrozenProxyEmail({
      ...BASE,
      hasRemainingMembership: false,
    });
    expect(out.html).toContain("すべての法人組織での代理アカウント設定が解除されました。");
    expect(out.html).not.toContain("他の法人組織での代理業務は引き続き継続します");
  });

  it("件名・本文ともに【ビジ友 運営】プレフィックス採用 (M-07、受信者はビジ友運営スタッフ)", () => {
    const out = accountCascadeFrozenProxyEmail({
      ...BASE,
      hasRemainingMembership: true,
    });
    expect(out.subject.startsWith("【ビジ友 運営】")).toBe(true);
  });

  it("「身に覚えがない」表現は使わず「ご不明な点」を採用 (Owner 退会は本人が知り得ない事象)", () => {
    const out = accountCascadeFrozenProxyEmail({
      ...BASE,
      hasRemainingMembership: true,
    });
    expect(out.html).not.toContain("身に覚えがない");
    expect(out.html).toContain("ご不明な点");
  });

  it("入れない要素 (再登録誘導 / 署名 / マーケ調 / Owner 問い合わせ誘導)", () => {
    const out = accountCascadeFrozenProxyEmail({
      ...BASE,
      hasRemainingMembership: false,
    });
    expect(out.html).not.toContain("再度ご利用");
    expect(out.html).not.toContain("運営事務局");
    expect(out.html).not.toContain("いつもご利用");
    expect(out.html).not.toContain("Owner にお問い合わせ");
  });
});

// ----------------------------------------------------------------------------
// §8.5.5 法人 Owner 退会カスケード - 通常 staff / admin 向け
// ----------------------------------------------------------------------------

describe("accountCascadeFrozenStaffEmail — §8.5.5", () => {
  const BASE = {
    recipientName: "佐藤次郎",
    organizationName: "株式会社○○建設",
    ownerName: "山田一郎",
    withdrawnAt: "2026/06/25 10:30",
  };

  it("件名「【ビジ友】」プレフィックス (法人内スタッフ向け、§5.7.5.A と統一)", () => {
    const out = accountCascadeFrozenStaffEmail(BASE);
    expect(out.subject).toBe(
      "【ビジ友】「株式会社○○建設」の管理責任者の退会により、ご利用を終了しました",
    );
    expect(out.subject).not.toContain("【ビジ友 運営】");
  });

  it("本文に「ご所属の〇〇の管理責任者が退会されたため」+ 表ブロック + closing", () => {
    const out = accountCascadeFrozenStaffEmail(BASE);
    expect(out.html).toContain("佐藤次郎 様");
    expect(out.html).toContain(
      "ご所属の「株式会社○○建設」の管理責任者が退会されたため、ビジ友のご利用は終了いたしました。",
    );
    expect(out.html).toContain("【法人名】 株式会社○○建設");
    expect(out.html).toContain("【退会した管理責任者】 山田一郎");
    expect(out.html).toContain("【退会日時】 2026/06/25 10:30");
    expect(out.html).toContain("ご不明な点");
    expect(out.html).toContain("/contact");
  });

  it("§5.7.5.A との分離: 件名・opening が完全に異なる", () => {
    const out = accountCascadeFrozenStaffEmail(BASE);
    expect(out.subject).not.toContain("組織から削除されました");
    expect(out.html).not.toContain("組織の担当者から削除されました");
    // 削除操作者は概念的に不在 (cascade は連鎖反応)
    expect(out.html).not.toContain("【削除操作者】");
  });

  it("「身に覚えがない」表現は使わず「ご不明な点」を採用", () => {
    const out = accountCascadeFrozenStaffEmail(BASE);
    expect(out.html).not.toContain("身に覚えがない");
  });
});

// ----------------------------------------------------------------------------
// §8.4 admin 強制削除本人通知
// ----------------------------------------------------------------------------

describe("accountSuspendedByAdminEmail — §8.4", () => {
  it("件名「【ビジ友】アカウントを停止しました」(§8.3 と分離)", () => {
    const out = accountSuspendedByAdminEmail({ recipientName: "田中太郎" });
    expect(out.subject).toBe("【ビジ友】アカウントを停止しました");
    expect(out.subject).not.toContain("退会手続き");
  });

  it("opening で「ビジ友運営により」と本人が即座に判別可能、closing は「ご不明な点」", () => {
    const out = accountSuspendedByAdminEmail({ recipientName: "田中太郎" });
    expect(out.html).toContain("田中太郎 様");
    expect(out.html).toContain("ビジ友運営により、お客様のアカウントを停止しました。");
    expect(out.html).toContain("これに伴い、ビジ友のご利用は終了いたしました。");
    expect(out.html).toContain(
      "ご利用中の有料プラン・オプションがあった場合は、合わせて解約処理が完了しています。",
    );
    expect(out.html).toContain("ご不明な点がある場合は、下記のお問い合わせ窓口までご連絡ください。");
    expect(out.html).toContain("/contact");
  });

  it("入れない要素 (削除理由 / 「身に覚えがない」/ 再登録誘導 / 署名)", () => {
    const out = accountSuspendedByAdminEmail({ recipientName: "田中太郎" });
    expect(out.html).not.toContain("身に覚えがない");
    expect(out.html).not.toContain("規約違反");
    expect(out.html).not.toContain("再度ご登録");
    expect(out.html).not.toContain("運営事務局");
  });
});

// ----------------------------------------------------------------------------
// §8.6 admin PW 変更完了通知
// ----------------------------------------------------------------------------

describe("adminPasswordChangedEmail — §8.6", () => {
  it("件名「【ビジ友 運営】」プレフィックス (M-07、受信者はビジ友運営社員)", () => {
    const out = adminPasswordChangedEmail({
      recipientName: "管理者一郎",
      changedAt: "2026/06/25 18:00",
    });
    expect(out.subject).toBe("【ビジ友 運営】管理者アカウントのパスワードを変更しました");
  });

  it("本文に宛名 + 状態説明 + 変更日時のみ、closing なし", () => {
    const out = adminPasswordChangedEmail({
      recipientName: "管理者一郎",
      changedAt: "2026/06/25 18:00",
    });
    expect(out.html).toContain("管理者一郎 様");
    expect(out.html).toContain("管理者アカウントのパスワードを変更しました。");
    expect(out.html).toContain("【変更日時】 2026/06/25 18:00");
  });

  it("入れない要素 (新/旧パスワード / 外部 /contact / 擬制役職名 / マーケ調 / 署名 / CTA)", () => {
    const out = adminPasswordChangedEmail({
      recipientName: "管理者一郎",
      changedAt: "2026/06/25 18:00",
    });
    expect(out.html).not.toContain("/contact");
    expect(out.html).not.toContain("セキュリティ管理者");
    expect(out.html).not.toContain("他の管理者");
    expect(out.html).not.toContain("運営事務局");
    expect(out.html).not.toContain("いつも");
  });

  it("fallback「ビジ友 管理者 様」(admin の last/first 未設定ケース)", () => {
    const out = adminPasswordChangedEmail({
      recipientName: "ビジ友 管理者",
      changedAt: "2026/06/25 18:00",
    });
    expect(out.html).toContain("ビジ友 管理者 様");
  });
});

// ----------------------------------------------------------------------------
// §8.2 会員登録完了 welcome
// ----------------------------------------------------------------------------

describe("registrationCompletedEmail — §8.2", () => {
  it("件名「【ビジ友】会員登録が完了しました」(プレフィックス統一)", () => {
    const out = registrationCompletedEmail({ recipientName: "山田太郎" });
    expect(out.subject).toBe("【ビジ友】会員登録が完了しました");
    expect(out.subject).not.toContain("ようこそ");
  });

  it("本文: 宛名 + 完了通知 + 節目メール優しめ closing", () => {
    const out = registrationCompletedEmail({ recipientName: "山田太郎" });
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("ビジ友への会員登録が完了しました。");
    // 節目メールとして「ぜひサービスをご活用ください。」は §6 マーケ調削除原則の限定例外
    expect(out.html).toContain("ぜひサービスをご活用ください。");
  });

  it("入れない要素 (署名 / アプリ内 UI 名 / マイページ誘導 / CTA)", () => {
    const out = registrationCompletedEmail({ recipientName: "山田太郎" });
    expect(out.html).not.toContain("ビジ友運営チーム");
    expect(out.html).not.toContain("マイページ");
    expect(out.html).not.toContain("ログインして");
  });
});

// ----------------------------------------------------------------------------
// §9.1 担当者追加失敗アラート (既存 E-13 改修)
// ----------------------------------------------------------------------------

describe("orphanAuthUserAlertEmail — §9.1", () => {
  const BASE = {
    occurredAt: "2026/06/28 12:34",
    organizationName: "株式会社○○建設",
    invitedEmail: "new-staff@example.com",
  };

  it("件名「【ビジ友 運営】担当者追加が途中で失敗しました」に統一 (旧「【要対応】」廃止)", () => {
    const out = orphanAuthUserAlertEmail(BASE);
    expect(out.subject).toBe("【ビジ友 運営】担当者追加が途中で失敗しました");
    expect(out.subject).not.toContain("【要対応】");
    expect(out.subject).not.toContain("クリーンアップ");
  });

  it("本文構造: opening 2 行 (事象 + 影響) + 影響情報ブロック 3 行 + closing 1 行", () => {
    const out = orphanAuthUserAlertEmail(BASE);
    expect(out.html).toContain("担当者の追加処理が途中で失敗しました。");
    expect(out.html).toContain("同じメールアドレスでの再招待ができなくなる可能性があります。");
    expect(out.html).toContain("【発生日時】 2026/06/28 12:34");
    expect(out.html).toContain("【対象組織】 株式会社○○建設");
    expect(out.html).toContain("【招待先メールアドレス】 new-staff@example.com");
    expect(out.html).toContain("お手数ですが、開発担当者にご連絡ください。");
  });

  it("入れない要素 (技術用語ゼロ: auth.user.id / RPC / cleanup / docs/operations 参照)", () => {
    const out = orphanAuthUserAlertEmail(BASE);
    expect(out.html).not.toContain("auth_user_id");
    expect(out.html).not.toContain("rpc_error");
    expect(out.html).not.toContain("cleanup_error");
    expect(out.html).not.toContain("docs/operations");
    expect(out.html).not.toContain("playbook");
  });
});

// ----------------------------------------------------------------------------
// §9.2 使用済みメールアドレスの片付けが失敗した時のアラート
// ----------------------------------------------------------------------------

describe("emailRecycleFailureAlertEmail — §9.2", () => {
  const BASE = {
    occurredAt: "2026/06/28 12:34",
    triggerLabel: "退会",
    targetEmail: "tanaka@example.com",
    targetDisplayName: "田中太郎",
  };

  it("件名「【ビジ友 運営】使用済みメールアドレスの片付けが失敗しました」", () => {
    const out = emailRecycleFailureAlertEmail({
      ...BASE,
      organizationName: null,
    });
    expect(out.subject).toBe(
      "【ビジ友 運営】使用済みメールアドレスの片付けが失敗しました",
    );
  });

  it("opening 2 行 + 影響情報ブロック (組織あり) + closing 1 行", () => {
    const out = emailRecycleFailureAlertEmail({
      ...BASE,
      organizationName: "株式会社○○建設",
    });
    expect(out.html).toContain("ユーザーが使っていたメールアドレスの片付け処理が失敗しました。");
    expect(out.html).toContain("同じメールアドレスでの再登録や再招待ができなくなる可能性があります。");
    expect(out.html).toContain("【発生日時】 2026/06/28 12:34");
    expect(out.html).toContain("【発生のきっかけ】 退会");
    expect(out.html).toContain("【対象ユーザー】 tanaka@example.com(田中太郎 様)");
    expect(out.html).toContain("【対象組織】 株式会社○○建設");
    expect(out.html).toContain("お手数ですが、開発担当者にご連絡ください。");
  });

  it("organizationName が null なら【対象組織】行を省略する", () => {
    const out = emailRecycleFailureAlertEmail({
      ...BASE,
      organizationName: null,
    });
    expect(out.html).not.toContain("【対象組織】");
  });

  it("triggerLabel 3 系統: 退会 / 担当者の削除 / 管理者による強制削除", () => {
    const outWithdrawal = emailRecycleFailureAlertEmail({
      ...BASE,
      triggerLabel: "退会",
      organizationName: null,
    });
    const outMemberDelete = emailRecycleFailureAlertEmail({
      ...BASE,
      triggerLabel: "担当者の削除",
      organizationName: null,
    });
    const outAdminForce = emailRecycleFailureAlertEmail({
      ...BASE,
      triggerLabel: "管理者による強制削除",
      organizationName: null,
    });
    expect(outWithdrawal.html).toContain("【発生のきっかけ】 退会");
    expect(outMemberDelete.html).toContain("【発生のきっかけ】 担当者の削除");
    expect(outAdminForce.html).toContain("【発生のきっかけ】 管理者による強制削除");
  });

  it("入れない要素 (技術用語ゼロ: auth.user.id / 失敗理由コード)", () => {
    const out = emailRecycleFailureAlertEmail({
      ...BASE,
      organizationName: null,
    });
    expect(out.html).not.toContain("api_error");
    expect(out.html).not.toContain("unique_violation");
    expect(out.html).not.toContain("user_not_found");
    expect(out.html).not.toContain("auth.users");
  });

  it("ターゲット email 取得不可時 (user_not_found) のフォールバック表記", () => {
    const out = emailRecycleFailureAlertEmail({
      ...BASE,
      targetEmail: "(取得不可)",
      targetDisplayName: "(氏名未設定)",
      organizationName: null,
    });
    expect(out.html).toContain("【対象ユーザー】 (取得不可)((氏名未設定) 様)");
  });
});

import { describe, expect, it } from "vitest";

import { optionPaymentFailedEmail } from "@/lib/email/templates/option-payment-failed";
import { optionSubscriptionActivatedEmail } from "@/lib/email/templates/option-subscription-activated";
import { optionSubscriptionCancelledEmail } from "@/lib/email/templates/option-subscription-cancelled";
import { paymentFailedEmail } from "@/lib/email/templates/payment-failed";
import { planActivatedEmail } from "@/lib/email/templates/plan-activated";
import { subscriptionCancelledEmail } from "@/lib/email/templates/subscription-cancelled";
import { subscriptionChangedEmail } from "@/lib/email/templates/subscription-changed";
import { urgentOptionActivatedEmail } from "@/lib/email/templates/urgent-option-activated";
import { videoOptionActivatedEmail } from "@/lib/email/templates/video-option-activated";
import { videoOptionAppliedOpsEmail } from "@/lib/email/templates/video-option-applied-ops";
import { videoPublishedEmail } from "@/lib/email/templates/video-published";
import { videoPublishedOpsEmail } from "@/lib/email/templates/video-published-ops";

describe("paymentFailedEmail", () => {
  it("件名で「有料プラン」を明記し過去形で締める（§6.3 disambiguation）", () => {
    const out = paymentFailedEmail({
      recipientName: "山田太郎",
      planName: "個人発注者様向けプラン",
      nextRetryDate: "2026/04/15",
    });
    expect(out.subject).toBe("【ビジ友】有料プランのお支払いが確認できませんでした");
  });

  it("html に宛名・プラン名・次回お支払い予定日・forward fact 警告・closing を含む", () => {
    const out = paymentFailedEmail({
      recipientName: "山田太郎",
      planName: "個人発注者様向けプラン",
      nextRetryDate: "2026/04/15",
    });
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("個人発注者様向けプラン");
    expect(out.html).toContain("2026/04/15");
    expect(out.html).toContain("ご利用中のプラン");
    expect(out.html).toContain("次回お支払い予定日");
    expect(out.html).toContain("無料プランに切り替わります");
    expect(out.html).toContain("お支払い方法のご確認をお願いします");
  });

  it("マーケ調 opening・CTA・「リトライ」用語・退会フレーミングを含まない（§6.3 改修）", () => {
    const out = paymentFailedEmail({
      recipientName: "山田太郎",
      planName: "個人発注者様向けプラン",
      nextRetryDate: "2026/04/15",
    });
    expect(out.html).not.toContain("いつもビジ友をご利用いただきありがとうございます");
    expect(out.html).not.toContain("お支払い方法を更新する");
    expect(out.html).not.toContain("リトライ");
    expect(out.html).not.toContain("有料機能がご利用いただけなくなります");
  });
});

describe("subscriptionChangedEmail §6.1-A-1 即時アップグレード", () => {
  it("件名は「プラン変更を承りました」、本文に「ただ今より適用」を含む", () => {
    const out = subscriptionChangedEmail({
      recipientName: "山田太郎",
      eventType: "upgrade-immediate",
      oldPlanName: "個人発注者様向けプラン",
      newPlanName: "小規模事業主様向けプラン",
    });
    expect(out.subject).toBe("【ビジ友】プラン変更を承りました");
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("変更前のプラン");
    expect(out.html).toContain("変更後のプラン");
    expect(out.html).toContain("個人発注者様向けプラン");
    expect(out.html).toContain("小規模事業主様向けプラン");
    expect(out.html).toContain("適用開始日");
    expect(out.html).toContain("ただ今より適用");
  });

  it("マーケ調 opening・CTA を含まない（§6 全体方針）", () => {
    const out = subscriptionChangedEmail({
      recipientName: "山田太郎",
      eventType: "upgrade-immediate",
      oldPlanName: "個人発注者様向けプラン",
      newPlanName: "小規模事業主様向けプラン",
    });
    expect(out.html).not.toContain("いつもビジ友をご利用いただきありがとうございます");
    expect(out.html).not.toContain("プラン状況を確認する");
  });
});

describe("subscriptionChangedEmail §6.1-A-2 ダウングレード予約", () => {
  it("件名は「プラン変更を承りました」、本文に YYYY/MM/DD 形式の適用開始日を含む", () => {
    const out = subscriptionChangedEmail({
      recipientName: "山田太郎",
      eventType: "downgrade-reserved",
      oldPlanName: "法人向けプラン",
      newPlanName: "個人発注者様向けプラン",
      scheduledDate: "2026/07/15",
    });
    expect(out.subject).toBe("【ビジ友】プラン変更を承りました");
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("法人向けプラン");
    expect(out.html).toContain("個人発注者様向けプラン");
    expect(out.html).toContain("2026/07/15");
    // 「ただ今より適用」は A-1 専用、A-2 では含めない
    expect(out.html).not.toContain("ただ今より適用");
  });
});

describe("subscriptionChangedEmail §6.1-B 解約予約", () => {
  it("件名は「解約をご予約いただきました」、本文に endDate を含む", () => {
    const out = subscriptionChangedEmail({
      recipientName: "山田太郎",
      eventType: "cancel-reserved",
      endDate: "2026/08/31",
    });
    expect(out.subject).toBe("【ビジ友】解約をご予約いただきました");
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("ビジ友の解約をご予約いただきました");
    expect(out.html).toContain("2026/08/31");
    expect(out.html).toContain("有料プランでのご利用が終了します");
  });

  it("「無料プラン」表現や「ご利用が終了します」(単独) は使わない", () => {
    const out = subscriptionChangedEmail({
      recipientName: "山田太郎",
      eventType: "cancel-reserved",
      endDate: "2026/08/31",
    });
    // 「無料プランに切り替わります」「変更後 = 無料プラン」等のフレーミングは入れない
    expect(out.html).not.toContain("無料プラン");
    expect(out.html).not.toContain("変更前のプラン");
    expect(out.html).not.toContain("変更後のプラン");
    expect(out.html).not.toContain("適用開始日");
  });
});

describe("subscriptionChangedEmail §6.1-C-1 ダウングレード予約取消", () => {
  it("件名は「ご予約を取り消しました」、本文に「プラン変更を取り消しました」と現プラン名を含む", () => {
    const out = subscriptionChangedEmail({
      recipientName: "山田太郎",
      eventType: "reservation-removed-downgrade",
      planName: "法人向けプラン",
    });
    expect(out.subject).toBe("【ビジ友】ご予約を取り消しました");
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("先日ご予約いただいたプラン変更を取り消しました");
    expect(out.html).toContain("法人向けプラン");
    expect(out.html).toContain("継続");
  });
});

describe("subscriptionChangedEmail §6.1-C-2 解約予約取消", () => {
  it("件名は「ご予約を取り消しました」、本文に「解約を取り消しました」と現プラン名を含む", () => {
    const out = subscriptionChangedEmail({
      recipientName: "山田太郎",
      eventType: "reservation-removed-cancel",
      planName: "個人発注者様向けプラン",
    });
    expect(out.subject).toBe("【ビジ友】ご予約を取り消しました");
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("先日ご予約いただいた解約を取り消しました");
    expect(out.html).toContain("個人発注者様向けプラン");
    expect(out.html).toContain("今後も引き続き");
  });
});

describe("subscriptionCancelledEmail", () => {
  it("件名で「有料プラン」を明記して退会通知との誤読を防ぐ（§6.2 改修）", () => {
    const out = subscriptionCancelledEmail({
      recipientName: "山田太郎",
      planName: "法人向けプラン",
      cancelledAt: "2026/04/12",
    });
    expect(out.subject).toBe("【ビジ友】有料プランのご解約が完了しました");
  });

  it("html に宛名・プラン名・解約日・forward fact closing を含む", () => {
    const out = subscriptionCancelledEmail({
      recipientName: "山田太郎",
      planName: "法人向けプラン",
      cancelledAt: "2026/04/12",
    });
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("法人向けプラン");
    expect(out.html).toContain("2026/04/12");
    expect(out.html).toContain("引き続き、無料プランでビジ友をご利用いただけます");
  });

  it("退会フレーミング・マーケ調 opening・CTA を含まない（§6.2 改修）", () => {
    const out = subscriptionCancelledEmail({
      recipientName: "山田太郎",
      planName: "法人向けプラン",
      cancelledAt: "2026/04/12",
    });
    expect(out.html).not.toContain("いつもビジ友をご利用いただきありがとうございます");
    expect(out.html).not.toContain("長らくのご利用");
    expect(out.html).not.toContain("再度ご登録");
    expect(out.html).not.toContain("プラン案内へ");
  });
});

describe("optionSubscriptionActivatedEmail §6.5.A 補償オプション申込完了", () => {
  it("件名は「補償オプションのお申し込みを承りました」、本文に optionLabel と activatedAt を含む", () => {
    const out = optionSubscriptionActivatedEmail({
      recipientName: "山田太郎",
      optionLabel: "補償（5,000円/月、最大200万円）",
      activatedAt: "2026/06/01",
    });
    expect(out.subject).toBe(
      "【ビジ友】補償オプションのお申し込みを承りました",
    );
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("補償オプションのお申し込みを承りました");
    expect(out.html).toContain("お申し込みオプション");
    expect(out.html).toContain("補償（5,000円/月、最大200万円）");
    expect(out.html).toContain("ご利用開始日");
    expect(out.html).toContain("2026/06/01");
    expect(out.html).toContain("給与未払いトラブル発生時の補償をご利用いただけます");
  });

  it("マーケ調 opening・CTA を含まない（§6 全体方針）", () => {
    const out = optionSubscriptionActivatedEmail({
      recipientName: "山田太郎",
      optionLabel: "補償（9,800円/月、最大500万円）",
      activatedAt: "2026/06/01",
    });
    expect(out.html).not.toContain("いつもビジ友をご利用いただきありがとうございます");
    expect(out.html).not.toContain("プラン案内へ");
  });
});

describe("optionPaymentFailedEmail §6.5.B 補償オプション支払い失敗", () => {
  it("件名は「補償オプションのお支払いが確認できませんでした」、本文に柔らかい警告 + closing", () => {
    const out = optionPaymentFailedEmail({
      recipientName: "山田太郎",
      optionLabel: "補償（5,000円/月、最大200万円）",
      nextRetryDate: "2026/06/07",
    });
    expect(out.subject).toBe(
      "【ビジ友】補償オプションのお支払いが確認できませんでした",
    );
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain(
      "ご登録のお支払い方法で、補償オプションの決済が確認できませんでした",
    );
    expect(out.html).toContain("ご利用中のオプション");
    expect(out.html).toContain("補償（5,000円/月、最大200万円）");
    expect(out.html).toContain("次回お支払い予定日");
    expect(out.html).toContain("2026/06/07");
    expect(out.html).toContain(
      "お支払いの確認が取れないまま日数が経過すると、補償オプションが自動的に解約されます",
    );
    expect(out.html).toContain("お支払い方法のご確認をお願いします");
  });

  it("「7 日以内に」 / 「リトライ」 / マーケ調 opening を含まない（§6.5.B 仕様）", () => {
    const out = optionPaymentFailedEmail({
      recipientName: "山田太郎",
      optionLabel: "補償（9,800円/月、最大500万円）",
      nextRetryDate: "2026/06/07",
    });
    expect(out.html).not.toContain("7 日以内");
    expect(out.html).not.toContain("リトライ");
    expect(out.html).not.toContain("いつもビジ友をご利用いただきありがとうございます");
  });
});

describe("optionSubscriptionCancelledEmail §6.5.C 補償オプション解約完了", () => {
  it("manual パターン: 件名は「補償オプションのご解約が完了しました」、opening は通常版", () => {
    const out = optionSubscriptionCancelledEmail({
      recipientName: "山田太郎",
      optionLabel: "補償（5,000円/月、最大200万円）",
      cancelledAt: "2026/07/01",
      reason: "manual",
    });
    expect(out.subject).toBe(
      "【ビジ友】補償オプションのご解約が完了しました",
    );
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("以下の内容で補償オプションの解約が完了しました");
    expect(out.html).toContain("解約したオプション");
    expect(out.html).toContain("補償（5,000円/月、最大200万円）");
    expect(out.html).toContain("解約日");
    expect(out.html).toContain("2026/07/01");
    expect(out.html).toContain(
      "今後発生する給与未払いトラブルは、補償の対象外となります",
    );
    // stripe-dunning 専用の冒頭文は含まない
    expect(out.html).not.toContain("お支払い方法での決済が確認できないまま");
  });

  it("stripe-dunning パターン: 件名は manual と同じ、opening に「決済が確認できないまま日数が経過したため」が冠される", () => {
    const out = optionSubscriptionCancelledEmail({
      recipientName: "山田太郎",
      optionLabel: "補償（9,800円/月、最大500万円）",
      cancelledAt: "2026/07/01",
      reason: "stripe-dunning",
    });
    expect(out.subject).toBe(
      "【ビジ友】補償オプションのご解約が完了しました",
    );
    expect(out.html).toContain(
      "お支払い方法での決済が確認できないまま日数が経過したため、以下の内容で補償オプションの解約が完了しました",
    );
    expect(out.html).toContain("補償（9,800円/月、最大500万円）");
    expect(out.html).toContain("2026/07/01");
  });

  it("「無料プランに切り替わります」「再度ご利用される際は」 等の §6.2 用 closing を含まない", () => {
    const out = optionSubscriptionCancelledEmail({
      recipientName: "山田太郎",
      optionLabel: "補償（5,000円/月、最大200万円）",
      cancelledAt: "2026/07/01",
      reason: "manual",
    });
    expect(out.html).not.toContain("無料プランに切り替わります");
    expect(out.html).not.toContain("無料プランでビジ友をご利用いただけます");
    expect(out.html).not.toContain("再度ご利用");
    expect(out.html).not.toContain("再度ご登録");
  });
});

describe("urgentOptionActivatedEmail §6.6.A 急募オプション申込完了", () => {
  it("件名に「【ビジ友】「<案件名>」の急募オプションお申し込みを承りました」、本文に jobTitle + endDate + 7 日間 表記", () => {
    const out = urgentOptionActivatedEmail({
      recipientName: "山田太郎",
      jobTitle: "渋谷区マンション新築 鉄筋工",
      endDate: "2026/07/05",
    });
    expect(out.subject).toBe(
      "【ビジ友】「渋谷区マンション新築 鉄筋工」の急募オプションお申し込みを承りました",
    );
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("急募オプションのお申し込みを承りました");
    expect(out.html).toContain("案件名");
    expect(out.html).toContain("渋谷区マンション新築 鉄筋工");
    expect(out.html).toContain("急募期間");
    expect(out.html).toContain("7 日間");
    expect(out.html).toContain("掲載期限");
    expect(out.html).toContain("2026/07/05");
    expect(out.html).toContain("掲載は即時開始されています");
  });
});

describe("videoOptionActivatedEmail §6.6.B-User 動画オプション申込完了 (申込者向け)", () => {
  it("件名は「動画オプションのお申し込みを承りました」、本文に optionLabel と activatedAt", () => {
    const out = videoOptionActivatedEmail({
      recipientName: "山田太郎",
      optionLabel: "受注者PR動画",
      activatedAt: "2026/07/01",
    });
    expect(out.subject).toBe(
      "【ビジ友】動画オプションのお申し込みを承りました",
    );
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("お申し込みオプション");
    expect(out.html).toContain("受注者PR動画");
    expect(out.html).toContain("ご利用開始日");
    expect(out.html).toContain("2026/07/01");
    expect(out.html).toContain(
      "運営より動画制作・撮影手配についてご連絡いたします",
    );
  });

  it("職場紹介動画 でも同一件名・本文 (optionLabel のみ切替)", () => {
    const out = videoOptionActivatedEmail({
      recipientName: "山田太郎",
      optionLabel: "職場紹介動画",
      activatedAt: "2026/07/01",
    });
    expect(out.subject).toBe(
      "【ビジ友】動画オプションのお申し込みを承りました",
    );
    expect(out.html).toContain("職場紹介動画");
  });
});

describe("videoOptionAppliedOpsEmail §6.6.B-Ops 動画オプション新規申込 (運営向け)", () => {
  it("件名は「【ビジ友 運営】動画オプションの新規お申し込みがありました」、deep link + 警告文 + 動画種別を含む", () => {
    const out = videoOptionAppliedOpsEmail({
      applicantName: "佐藤花子",
      companyName: "テスト建設株式会社",
      appliedAt: "2026/07/01 14:30",
      optionLabel: "職場紹介動画",
      userId: "user-applicant-001",
      siteUrl: "https://bijiyu.example.com",
    });
    expect(out.subject).toBe(
      "【ビジ友 運営】動画オプションの新規お申し込みがありました",
    );
    expect(out.html).toContain("動画オプションのお申し込みが新規にありました");
    expect(out.html).toContain("動画制作・撮影手配を進めてください");
    expect(out.html).toContain("申込者");
    expect(out.html).toContain("佐藤花子");
    expect(out.html).toContain("会社名");
    expect(out.html).toContain("テスト建設株式会社");
    expect(out.html).toContain("申込日時");
    expect(out.html).toContain("2026/07/01 14:30");
    expect(out.html).toContain("動画種別");
    expect(out.html).toContain("職場紹介動画");
    expect(out.html).toContain(
      "https://bijiyu.example.com/admin/users/user-applicant-001",
    );
    expect(out.html).toContain("ログインした状態でクリックしてください");
    // userId 単体は本文列挙しない
    expect(out.html).not.toContain("【ID】");
  });

  it("companyName が null なら【会社名】行を省略", () => {
    const out = videoOptionAppliedOpsEmail({
      applicantName: "個人 太郎",
      companyName: null,
      appliedAt: "2026/07/01 14:30",
      optionLabel: "受注者PR動画",
      userId: "user-002",
      siteUrl: "https://bijiyu.example.com",
    });
    expect(out.html).not.toContain("会社名");
    expect(out.html).toContain("個人 太郎");
  });
});

describe("videoPublishedEmail §6.6.C-User 動画掲載完了 (申込者向け)", () => {
  it("件名は「動画の掲載が完了しました」、本文は optionLabel + publishedAt のみ", () => {
    const out = videoPublishedEmail({
      recipientName: "山田太郎",
      optionLabel: "受注者PR動画",
      publishedAt: "2026/07/10",
    });
    expect(out.subject).toBe("【ビジ友】動画の掲載が完了しました");
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain(
      "お申し込みいただいた動画オプションについて、動画の掲載が完了しました",
    );
    expect(out.html).toContain("動画種別");
    expect(out.html).toContain("受注者PR動画");
    expect(out.html).toContain("掲載完了日");
    expect(out.html).toContain("2026/07/10");
  });

  it("UI 名指し (マイページ / プロフィール画面) を含まない (M-04)", () => {
    const out = videoPublishedEmail({
      recipientName: "山田太郎",
      optionLabel: "職場紹介動画",
      publishedAt: "2026/07/10",
    });
    expect(out.html).not.toContain("マイページ");
    expect(out.html).not.toContain("プロフィール画面");
  });
});

describe("videoPublishedOpsEmail §6.6.C-Ops 動画掲載完了 (運営向け)", () => {
  it("件名は「【ビジ友 運営】動画オプションの掲載完了を申込者へ通知しました」、deep link + 警告文を含む", () => {
    const out = videoPublishedOpsEmail({
      applicantName: "佐藤花子",
      companyName: "テスト建設株式会社",
      optionLabel: "職場紹介動画",
      publishedAt: "2026/07/10 11:20",
      userId: "user-001",
      siteUrl: "https://bijiyu.example.com",
    });
    expect(out.subject).toBe(
      "【ビジ友 運営】動画オプションの掲載完了を申込者へ通知しました",
    );
    expect(out.html).toContain(
      "動画オプションの掲載が完了し、申込者へ通知メールを送信しました",
    );
    expect(out.html).toContain("佐藤花子");
    expect(out.html).toContain("テスト建設株式会社");
    expect(out.html).toContain("職場紹介動画");
    expect(out.html).toContain("2026/07/10 11:20");
    expect(out.html).toContain(
      "https://bijiyu.example.com/admin/users/user-001",
    );
    expect(out.html).toContain("ログインした状態でクリックしてください");
  });

  it("【操作者】行は含めない (admin プロフィール UI 不在のため)", () => {
    const out = videoPublishedOpsEmail({
      applicantName: "佐藤花子",
      companyName: null,
      optionLabel: "受注者PR動画",
      publishedAt: "2026/07/10 11:20",
      userId: "user-001",
      siteUrl: "https://bijiyu.example.com",
    });
    expect(out.html).not.toContain("【操作者】");
    expect(out.html).not.toContain("会社名");
  });
});

describe("planActivatedEmail §6.7 基本プラン契約完了", () => {
  it("件名は「【ビジ友】プランのお申し込みを承りました」 (プラン名は subject に含めない)", () => {
    const out = planActivatedEmail({
      recipientName: "山田工務店",
      planName: "法人向けプラン",
      activatedAt: "2026/06/30",
    });
    expect(out.subject).toBe("【ビジ友】プランのお申し込みを承りました");
    expect(out.html).toContain("山田工務店 様");
    expect(out.html).toContain("以下の内容でプランのお申し込みを承りました");
    expect(out.html).toContain("お申し込みプラン");
    expect(out.html).toContain("法人向けプラン");
    expect(out.html).toContain("ご利用開始日");
    expect(out.html).toContain("2026/06/30");
  });

  it("マーケ調 opening・CTA・「ご契約ありがとうございます」を含まない (§6 全体方針)", () => {
    const out = planActivatedEmail({
      recipientName: "山田太郎",
      planName: "個人発注者様向けプラン",
      activatedAt: "2026/06/30",
    });
    expect(out.html).not.toContain("いつもビジ友をご利用いただきありがとうございます");
    expect(out.html).not.toContain("ご契約ありがとうございます");
    expect(out.html).not.toContain("プラン案内へ");
  });
});

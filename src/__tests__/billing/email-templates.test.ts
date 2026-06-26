import { describe, expect, it } from "vitest";

import { paymentFailedEmail } from "@/lib/email/templates/payment-failed";
import { subscriptionCancelledEmail } from "@/lib/email/templates/subscription-cancelled";
import { subscriptionChangedEmail } from "@/lib/email/templates/subscription-changed";

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

describe("subscriptionChangedEmail", () => {
  it("件名は固定: 「プラン変更を承りました」（§6.1-A-1/A-2 共通）", () => {
    const out = subscriptionChangedEmail({
      recipientName: "山田太郎",
      oldPlanName: "個人発注者様向けプラン",
      newPlanName: "小規模事業主様向けプラン",
      effectiveDate: "ただ今より適用",
    });
    expect(out.subject).toBe("【ビジ友】プラン変更を承りました");
  });

  it("html に宛名・新旧プラン名・適用開始日を含む", () => {
    const out = subscriptionChangedEmail({
      recipientName: "山田太郎",
      oldPlanName: "法人向けプラン",
      newPlanName: "個人発注者様向けプラン",
      effectiveDate: "2026/05/01",
    });
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("法人向けプラン");
    expect(out.html).toContain("個人発注者様向けプラン");
    expect(out.html).toContain("2026/05/01");
    expect(out.html).toContain("変更前のプラン");
    expect(out.html).toContain("変更後のプラン");
    expect(out.html).toContain("適用開始日");
  });

  it("マーケ調 opening・CTA を含まない（§6.1 改修）", () => {
    const out = subscriptionChangedEmail({
      recipientName: "山田太郎",
      oldPlanName: "個人発注者様向けプラン",
      newPlanName: "小規模事業主様向けプラン",
      effectiveDate: "ただ今より適用",
    });
    expect(out.html).not.toContain("いつもビジ友をご利用いただきありがとうございます");
    expect(out.html).not.toContain("プラン状況を確認する");
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

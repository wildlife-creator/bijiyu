import { describe, expect, it } from "vitest";

import { proxyRemovedEmail } from "@/lib/email/templates/proxy-removed";
import { proxyRemovedControlEmail } from "@/lib/email/templates/proxy-removed-control";
import { staffRemovedEmail } from "@/lib/email/templates/staff-removed";
import { staffRemovedControlEmail } from "@/lib/email/templates/staff-removed-control";

/**
 * §5.7 (代理 staff 削除) + §5.7.5 (通常 staff 削除) の 4 テンプレ。
 * 完全分離アプローチで節を分けて文面を独立させた設計（spec §5.7 / §5.7.5）。
 */

describe("proxyRemovedEmail (§5.7.A 本人宛、残存有無分岐)", () => {
  const baseProps = {
    recipientName: "田中太郎",
    organizationName: "株式会社○○建設",
    actorName: "山田一郎",
    removedAt: "2026/06/28 14:30",
  };

  it("件名「【ビジ友 運営】「{org}」の代理アカウント設定が解除されました」", () => {
    const { subject } = proxyRemovedEmail({
      ...baseProps,
      hasRemainingMembership: true,
    });
    expect(subject).toBe(
      "【ビジ友 運営】「株式会社○○建設」の代理アカウント設定が解除されました",
    );
  });

  it("A-1 残存あり: 「他の法人組織での代理業務は引き続き継続します」", () => {
    const { html } = proxyRemovedEmail({
      ...baseProps,
      hasRemainingMembership: true,
    });
    expect(html).toContain("他の法人組織での代理業務は引き続き継続します");
    expect(html).not.toContain("すべての法人組織での代理アカウント設定が解除");
  });

  it("A-2 残存なし: 「すべての法人組織での代理アカウント設定が解除されました」", () => {
    const { html } = proxyRemovedEmail({
      ...baseProps,
      hasRemainingMembership: false,
    });
    expect(html).toContain("すべての法人組織での代理アカウント設定が解除されました");
    expect(html).not.toContain("他の法人組織での代理業務は引き続き継続");
  });

  it("件名は残存有無で共通 (本文末尾でのみ区別)", () => {
    const subjectA1 = proxyRemovedEmail({
      ...baseProps,
      hasRemainingMembership: true,
    }).subject;
    const subjectA2 = proxyRemovedEmail({
      ...baseProps,
      hasRemainingMembership: false,
    }).subject;
    expect(subjectA1).toBe(subjectA2);
  });

  it("closing: 「身に覚えがない場合は…/contact」テキストリンク (両ケース共通)", () => {
    const { html } = proxyRemovedEmail({
      ...baseProps,
      hasRemainingMembership: true,
    });
    expect(html).toContain("身に覚えがない場合は");
    expect(html).toContain("/contact");
  });

  it("「ビジ友のご利用は終了」は含めない (N 法人兼任モデルで断言不可)", () => {
    const { html } = proxyRemovedEmail({
      ...baseProps,
      hasRemainingMembership: false,
    });
    expect(html).not.toContain("ビジ友のご利用は終了");
    expect(html).not.toContain("再度ご利用される場合は、新たに会員登録");
  });
});

describe("proxyRemovedControlEmail (§5.7.B 組織管理層宛)", () => {
  const baseProps = {
    recipientName: "発注者一郎",
    targetName: "田中太郎",
    actorName: "山田一郎",
    removedAt: "2026/06/28 14:30",
  };

  it("件名「【ビジ友】{targetName}さんの代理アカウント設定を解除しました」 (能動形)", () => {
    const { subject } = proxyRemovedControlEmail(baseProps);
    expect(subject).toBe(
      "【ビジ友】田中太郎さんの代理アカウント設定を解除しました",
    );
  });

  it("本文: 「(ビジ友運営スタッフ)」サフィックス + 「貴社の操作を代行することはなくなります」断言", () => {
    const { html } = proxyRemovedControlEmail(baseProps);
    expect(html).toContain("発注者一郎 様");
    expect(html).toContain("【対象担当者】 田中太郎 (ビジ友運営スタッフ)");
    expect(html).toContain("【操作者】 山田一郎");
    expect(html).toContain("【解除日時】 2026/06/28 14:30");
    expect(html).toContain(
      "今後、ビジ友運営が貴社の操作を代行することはなくなります",
    );
  });

  it("「一部」を **削除して断言** (§5.6.D 設定通知との非対称設計)", () => {
    const { html } = proxyRemovedControlEmail(baseProps);
    // 解除段階の断言: 「一部」を抜く
    expect(html).not.toContain("操作の一部を代行");
    expect(html).toContain("貴社の操作を代行することはなくなります");
  });

  it("組織名・残存有無・CTA を含めない", () => {
    const { html } = proxyRemovedControlEmail(baseProps);
    expect(html).not.toContain("組織");
    expect(html).not.toContain("他の法人");
    expect(html).not.toContain("/contact");
  });
});

describe("staffRemovedEmail (§5.7.5.A 本人宛)", () => {
  const baseProps = {
    recipientName: "田中太郎",
    organizationName: "株式会社○○建設",
    actorName: "山田一郎",
    removedAt: "2026/06/28 14:30",
  };

  it("件名「【ビジ友】「{org}」の組織から削除されました」", () => {
    const { subject } = staffRemovedEmail(baseProps);
    expect(subject).toBe("【ビジ友】「株式会社○○建設」の組織から削除されました");
  });

  it("本文: 3 項目 + 「これに伴い、ビジ友のご利用は終了いたしました」+ closing 「身に覚えがない/contact」", () => {
    const { html } = staffRemovedEmail(baseProps);
    expect(html).toContain("田中太郎 様");
    expect(html).toContain("下記の組織の担当者から削除されました");
    expect(html).toContain("【法人名】 株式会社○○建設");
    expect(html).toContain("【削除操作者】 山田一郎");
    expect(html).toContain("【削除日時】 2026/06/28 14:30");
    expect(html).toContain("これに伴い、ビジ友のご利用は終了いたしました");
    expect(html).toContain("身に覚えがない場合は");
    expect(html).toContain("/contact");
  });

  it("「再登録は新たに会員登録〜」は **入れない** (同 email 再招待ブロック問題のため誤読回避)", () => {
    const { html } = staffRemovedEmail(baseProps);
    expect(html).not.toContain("再度ご利用される場合は、新たに会員登録");
  });

  it("件名先頭は「【ビジ友】」(代理 §5.7.A の「【ビジ友 運営】」と区別)", () => {
    const { subject } = staffRemovedEmail(baseProps);
    expect(subject.startsWith("【ビジ友】")).toBe(true);
    expect(subject).not.toContain("【ビジ友 運営】");
  });
});

describe("staffRemovedControlEmail (§5.7.5.B 組織管理層宛)", () => {
  const baseProps = {
    recipientName: "発注者一郎",
    targetName: "田中太郎",
    actorName: "山田一郎",
    removedAt: "2026/06/28 14:30",
  };

  it("件名「【ビジ友】{targetName}さんを担当者から削除しました」", () => {
    const { subject } = staffRemovedControlEmail(baseProps);
    expect(subject).toBe(
      "【ビジ友】田中太郎さんを担当者から削除しました",
    );
  });

  it("本文: 3 項目 + closing なし", () => {
    const { html } = staffRemovedControlEmail(baseProps);
    expect(html).toContain("発注者一郎 様");
    expect(html).toContain("【対象担当者】 田中太郎");
    expect(html).toContain("【操作者】 山田一郎");
    expect(html).toContain("【削除日時】 2026/06/28 14:30");
    // closing なし
    expect(html).not.toContain("身に覚えがない");
    expect(html).not.toContain("/contact");
  });

  it("「(ビジ友運営スタッフ)」サフィックスを **付けない** (§5.7.B 代理控えと区別)", () => {
    const { html } = staffRemovedControlEmail(baseProps);
    expect(html).not.toContain("(ビジ友運営スタッフ)");
  });

  it("組織名 / 削除理由 / CTA を含めない", () => {
    const { html } = staffRemovedControlEmail(baseProps);
    expect(html).not.toContain("組織");
    expect(html).not.toContain("削除理由");
  });
});

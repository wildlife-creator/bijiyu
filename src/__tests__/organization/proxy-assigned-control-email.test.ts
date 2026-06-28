import { describe, expect, it } from "vitest";

import { proxyAssignedControlEmail } from "@/lib/email/templates/proxy-assigned-control";

/**
 * §5.6.D 代理アカウント設定通知（法人 Owner + admin 宛、3 ケース統合）。
 * §5.7.B 解除控えと対をなす設計判断: 設定時は「一部」を残し全代行ではないと明示、
 * 解除時は「一部」を削除して断言（spec §5.6.D「一部代行表現の意図」参照）。
 */

describe("proxyAssignedControlEmail (§5.6.D)", () => {
  const baseProps = {
    recipientName: "発注者一郎",
    targetName: "田中太郎",
    actorName: "山田一郎",
    assignedAt: "2026/06/28 14:30",
  };

  it("件名「【ビジ友】{targetName}さんを代理アカウントとして設定しました」", () => {
    const { subject } = proxyAssignedControlEmail(baseProps);
    expect(subject).toBe(
      "【ビジ友】田中太郎さんを代理アカウントとして設定しました",
    );
  });

  it("本文: 宛名 + 3 項目 + 代理マーク説明 closing", () => {
    const { html } = proxyAssignedControlEmail(baseProps);
    expect(html).toContain("発注者一郎 様");
    expect(html).toContain("下記の代理アカウント設定が行われました");
    expect(html).toContain("【代理アカウント担当者】 田中太郎 (ビジ友運営スタッフ)");
    expect(html).toContain("【操作者】 山田一郎");
    expect(html).toContain("【設定日時】 2026/06/28 14:30");
    expect(html).toContain("代理アカウントとは、ビジ友運営が貴社の操作の一部を代行する設定です");
    expect(html).toContain("「代理」マーク");
  });

  it("「一部」を含める (§5.6.D 設定段階。§5.7.B 解除段階は「一部」を削除する非対称設計)", () => {
    const { html } = proxyAssignedControlEmail(baseProps);
    expect(html).toContain("操作の一部を代行する");
  });

  it("「(ビジ友運営スタッフ)」サフィックスを付ける (代理 staff 識別)", () => {
    const { html } = proxyAssignedControlEmail(baseProps);
    expect(html).toContain("(ビジ友運営スタッフ)");
  });

  it("組織名・受注者側「代理」マーク表示は含めない (M-04 / spec 入れないもの)", () => {
    const { html } = proxyAssignedControlEmail(baseProps);
    expect(html).not.toContain("組織"); // 受信者は同組織なので暗黙
    expect(html).toContain("受注者側には表示されません");
  });
});

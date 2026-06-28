import { describe, expect, it } from "vitest";

import { verificationReceivedEmail } from "@/lib/email/templates/verification-received";
import { verificationReceivedOpsEmail } from "@/lib/email/templates/verification-received-ops";

// ----------------------------------------------------------------------------
// §4.1 申請受理控え (verificationReceivedEmail)
// ----------------------------------------------------------------------------

describe("verificationReceivedEmail — §4.1", () => {
  const BASE = {
    recipientName: "田中",
    appliedAt: "2026/06/23 10:30",
  };

  it("identity: 件名は「【ビジ友】本人確認の申請を受け付けました」", () => {
    const out = verificationReceivedEmail({
      ...BASE,
      documentType: "identity",
    });
    expect(out.subject).toBe("【ビジ友】本人確認の申請を受け付けました");
  });

  it("ccus: 件名は「【ビジ友】CCUS登録の申請を受け付けました」", () => {
    const out = verificationReceivedEmail({ ...BASE, documentType: "ccus" });
    expect(out.subject).toBe("【ビジ友】CCUS登録の申請を受け付けました");
  });

  it("identity: 本文に宛名・opening・【申請日時】【申請種別】・closing を含む", () => {
    const out = verificationReceivedEmail({
      ...BASE,
      documentType: "identity",
    });
    expect(out.html).toContain("田中 様");
    expect(out.html).toContain("本人確認の申請を受け付けました。");
    expect(out.html).toContain("【申請日時】 2026/06/23 10:30");
    expect(out.html).toContain("【申請種別】 本人確認");
    expect(out.html).toContain("審査の結果は改めてお知らせします。");
  });

  it("ccus: 【申請種別】が「CCUS登録」に切り替わる", () => {
    const out = verificationReceivedEmail({ ...BASE, documentType: "ccus" });
    expect(out.html).toContain("CCUS登録の申請を受け付けました。");
    expect(out.html).toContain("【申請種別】 CCUS登録");
    expect(out.html).not.toContain("【申請種別】 本人確認");
  });

  it("入れない要素 (CTA / UI 名指し / 提出ファイル名 / 審査期間目安)", () => {
    const out = verificationReceivedEmail({
      ...BASE,
      documentType: "identity",
    });
    expect(out.html).not.toContain("マイページ");
    expect(out.html).not.toContain("ログインして");
    expect(out.html).not.toContain("確認する");
    expect(out.html).not.toContain("ファイル名");
    expect(out.html).not.toContain("審査期間");
    expect(out.html).not.toContain("営業日");
  });
});

// ----------------------------------------------------------------------------
// §4.4 運営通知 (verificationReceivedOpsEmail)
// ----------------------------------------------------------------------------

describe("verificationReceivedOpsEmail — §4.4", () => {
  const BASE = {
    applicantName: "田中太郎",
    appliedAt: "2026/06/23 10:30",
    siteUrl: "https://bijiyu.example.com",
    verificationId: "def67890-aaaa-bbbb-cccc-1234567890ab",
  };

  it("identity: 件名は「【ビジ友 運営】本人確認の申請がありました」", () => {
    const out = verificationReceivedOpsEmail({
      ...BASE,
      documentType: "identity",
    });
    expect(out.subject).toBe("【ビジ友 運営】本人確認の申請がありました");
  });

  it("ccus: 件名は「【ビジ友 運営】CCUS登録の申請がありました」", () => {
    const out = verificationReceivedOpsEmail({
      ...BASE,
      documentType: "ccus",
    });
    expect(out.subject).toBe("【ビジ友 運営】CCUS登録の申請がありました");
  });

  it("本文に画面誘導 + 申請者 / 申請日時 / 申請種別 + deep link + ログイン警告", () => {
    const out = verificationReceivedOpsEmail({
      ...BASE,
      documentType: "identity",
    });
    expect(out.html).toContain("本人確認の申請が新規に作成されました。");
    expect(out.html).toContain(
      "「本人確認承認申請一覧」画面からご対応をお願いします。",
    );
    expect(out.html).toContain("【申請者】 田中太郎");
    expect(out.html).toContain("【申請日時】 2026/06/23 10:30");
    expect(out.html).toContain("【申請種別】 本人確認");
    expect(out.html).toContain(
      "ログインした状態でクリックしてください。",
    );
    expect(out.html).toContain(
      `https://bijiyu.example.com/admin/verifications/${BASE.verificationId}`,
    );
  });

  it("ccus: 画面名称「本人確認承認申請一覧」は固定 (共用画面のため切り替わらない)", () => {
    const out = verificationReceivedOpsEmail({
      ...BASE,
      documentType: "ccus",
    });
    expect(out.html).toContain(
      "「本人確認承認申請一覧」画面からご対応をお願いします。",
    );
    expect(out.html).toContain("【申請種別】 CCUS登録");
  });

  it("入れない要素 (ユーザーID 単独行 / 申請ID 単独行 / 提出ファイルプレビュー)", () => {
    const out = verificationReceivedOpsEmail({
      ...BASE,
      documentType: "identity",
    });
    expect(out.html).not.toContain("【ユーザーID】");
    expect(out.html).not.toContain("【申請ID】");
    expect(out.html).not.toContain("プレビュー");
    expect(out.html).not.toContain("ファイル名");
  });
});

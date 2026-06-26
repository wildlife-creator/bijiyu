import { describe, expect, it } from "vitest";

import { verificationApprovedEmail } from "@/lib/email/templates/verification-approved";
import { verificationRejectedEmail } from "@/lib/email/templates/verification-rejected";

/**
 * ADM-012 の通知メールテンプレート（Task 9.2 + §4.2/§4.3 M-04 適合改修）。
 * document_type で「本人確認」/「CCUS登録」を差し込む共用テンプレ。
 * 否認テンプレは再提出依頼の文面＋否認理由を含める。
 * M-04 準拠で CTA・UI 名指し誘導文は持たない。
 */

describe("verificationApprovedEmail", () => {
  it("identity: 件名・本文に「本人確認」と宛名を含む", () => {
    const { subject, html } = verificationApprovedEmail({
      recipientName: "山田太郎",
      documentType: "identity",
    });
    expect(subject).toContain("本人確認");
    expect(subject).toContain("承認");
    expect(html).toContain("山田太郎 様");
    expect(html).toContain("本人確認");
    expect(html).toContain("承認されました");
  });

  it("ccus: 件名・本文に「CCUS」を含む（本人確認の文言にならない）", () => {
    const { subject, html } = verificationApprovedEmail({
      recipientName: "斎藤忠義",
      documentType: "ccus",
    });
    expect(subject).toContain("CCUS");
    expect(subject).not.toContain("本人確認");
    expect(html).toContain("CCUS");
  });

  it("CTA / UI 名指し誘導文を含まない（M-04 適合）", () => {
    const { html } = verificationApprovedEmail({
      recipientName: "山田太郎",
      documentType: "identity",
    });
    expect(html).not.toContain("マイページを確認");
    expect(html).not.toContain("ログインして");
  });
});

describe("verificationRejectedEmail", () => {
  it("identity: 否認理由と再提出依頼の文面を含む", () => {
    const { subject, html } = verificationRejectedEmail({
      recipientName: "山田太郎",
      documentType: "identity",
      rejectionReason: "書類の文字が不鮮明です",
    });
    expect(subject).toContain("本人確認");
    expect(html).toContain("山田太郎 様");
    expect(html).toContain("書類の文字が不鮮明です");
    expect(html).toContain("ご提出をお願いします");
  });

  it("ccus: 件名に「CCUS」を含む", () => {
    const { subject } = verificationRejectedEmail({
      recipientName: "斎藤忠義",
      documentType: "ccus",
      rejectionReason: "技能者IDが確認できません",
    });
    expect(subject).toContain("CCUS");
  });

  it("CTA / UI 名指し誘導文を含まない（M-04 適合）", () => {
    const { html } = verificationRejectedEmail({
      recipientName: "山田太郎",
      documentType: "identity",
      rejectionReason: "書類が不鮮明",
    });
    expect(html).not.toContain("書類を再提出する");
    expect(html).not.toContain("マイページから");
  });
});

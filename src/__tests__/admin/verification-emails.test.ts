import { describe, expect, it } from "vitest";

import { verificationApprovedEmail } from "@/lib/email/templates/verification-approved";
import { verificationRejectedEmail } from "@/lib/email/templates/verification-rejected";

/**
 * ADM-012 の通知メールテンプレート（Task 9.2）。
 * document_type で「本人確認」/「CCUS」を差し込む共用テンプレ。
 * 否認テンプレは再提出依頼の文面＋否認理由を含める。
 */

describe("verificationApprovedEmail", () => {
  it("identity: 件名・本文に「本人確認」と宛名を含む", () => {
    const { subject, html } = verificationApprovedEmail({
      recipientName: "山田太郎",
      documentType: "identity",
      serviceUrl: "https://example.com",
    });
    expect(subject).toContain("本人確認");
    expect(subject).toContain("承認");
    expect(html).toContain("山田太郎 様");
    expect(html).toContain("本人確認");
    expect(html).toContain("https://example.com");
  });

  it("ccus: 件名・本文に「CCUS」を含む（本人確認の文言にならない）", () => {
    const { subject, html } = verificationApprovedEmail({
      recipientName: "斎藤忠義",
      documentType: "ccus",
      serviceUrl: "https://example.com",
    });
    expect(subject).toContain("CCUS");
    expect(subject).not.toContain("本人確認");
    expect(html).toContain("CCUS");
  });
});

describe("verificationRejectedEmail", () => {
  it("identity: 否認理由と再提出依頼の文面を含む", () => {
    const { subject, html } = verificationRejectedEmail({
      recipientName: "山田太郎",
      documentType: "identity",
      rejectionReason: "書類の文字が不鮮明です",
      serviceUrl: "https://example.com",
    });
    expect(subject).toContain("本人確認");
    expect(html).toContain("山田太郎 様");
    expect(html).toContain("書類の文字が不鮮明です");
    expect(html).toContain("再提出");
  });

  it("ccus: 件名に「CCUS」を含む", () => {
    const { subject } = verificationRejectedEmail({
      recipientName: "斎藤忠義",
      documentType: "ccus",
      rejectionReason: "技能者IDが確認できません",
      serviceUrl: "https://example.com",
    });
    expect(subject).toContain("CCUS");
  });
});

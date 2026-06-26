import { describe, expect, it } from "vitest";

import { jobInquiryNotificationEmail } from "@/lib/email/templates/job-inquiry-notification";

const props = {
  recipientName: "テスト工務店",
  senderName: "山田太郎",
  senderEmail: "yamada@example.com",
  topics: ["求人について話を聞きたい", "その他"],
  content: "ぜひ一度お話しさせてください",
};

describe("jobInquiryNotificationEmail", () => {
  it("件名は固定で送信者名を含まない（§7.3.A 改修）", () => {
    const { subject } = jobInquiryNotificationEmail(props);
    expect(subject).toBe("【ビジ友】求人へのお問い合わせが届きました");
  });

  it("本文に宛先表示名・送信者・メール・項目・内容を含み closing が offering 形", () => {
    const { html } = jobInquiryNotificationEmail(props);
    expect(html).toContain("テスト工務店");
    expect(html).toContain("yamada@example.com");
    expect(html).toContain("求人について話を聞きたい、その他");
    expect(html).toContain("ぜひ一度お話しさせてください");
    expect(html).toContain("ご返信は送信者のメールアドレスへ直接お送りいただけます");
  });

  it("内容未入力時は（未入力）と表示する", () => {
    const { html } = jobInquiryNotificationEmail({ ...props, content: "   " });
    expect(html).toContain("（未入力）");
  });

  it("送信者入力値の HTML はエスケープされる（XSS 対策）", () => {
    const { html } = jobInquiryNotificationEmail({
      ...props,
      content: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("CTA「受信箱で確認する」・inboxUrl deep link を含まない（M-04 適合）", () => {
    const { html } = jobInquiryNotificationEmail(props);
    expect(html).not.toContain("受信箱で確認する");
    expect(html).not.toContain("/mypage/job-inquiries");
  });
});

import { describe, expect, it } from "vitest";

import { jobInquiryNotificationEmail } from "@/lib/email/templates/job-inquiry-notification";

const props = {
  recipientName: "テスト工務店",
  senderName: "山田太郎",
  senderEmail: "yamada@example.com",
  topics: ["求人について話を聞きたい", "その他"],
  content: "ぜひ一度お話しさせてください",
  inboxUrl: "http://127.0.0.1:3000/mypage/job-inquiries",
  serviceUrl: "http://127.0.0.1:3000",
};

describe("jobInquiryNotificationEmail", () => {
  it("件名に送信者氏名を含む", () => {
    const { subject } = jobInquiryNotificationEmail(props);
    expect(subject).toBe("【ビジ友】求人へのお問い合わせを受信しました - 山田太郎");
  });

  it("本文に宛先表示名・送信者メール・選択項目・受信箱URL・内容を含む", () => {
    const { html } = jobInquiryNotificationEmail(props);
    expect(html).toContain("テスト工務店");
    expect(html).toContain("yamada@example.com");
    expect(html).toContain("求人について話を聞きたい、その他");
    expect(html).toContain("http://127.0.0.1:3000/mypage/job-inquiries");
    expect(html).toContain("ぜひ一度お話しさせてください");
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
});

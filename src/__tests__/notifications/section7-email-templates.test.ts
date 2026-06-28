import { describe, expect, it } from "vitest";

import { contactOpsNotificationEmail } from "@/lib/email/templates/contact-ops-notification";
import { contactReceiptEmail } from "@/lib/email/templates/contact-receipt";
import { jobInquiryReceiptEmail } from "@/lib/email/templates/job-inquiry-receipt";
import { troubleReportOpsNotificationEmail } from "@/lib/email/templates/trouble-report-ops-notification";
import { troubleReportReceiptEmail } from "@/lib/email/templates/trouble-report-receipt";

// ----------------------------------------------------------------------------
// §7.1.A 送信者控え (contactReceiptEmail)
// ----------------------------------------------------------------------------

describe("contactReceiptEmail — §7.1.A", () => {
  const BASE = {
    name: "山田太郎",
    inquiryType: "料金について",
    detail: "プランの違いを教えてください。",
    receivedAt: "2026/06/28 10:30",
  };

  it("件名は固定「【ビジ友】お問い合わせを受け付けました」", () => {
    expect(contactReceiptEmail(BASE).subject).toBe(
      "【ビジ友】お問い合わせを受け付けました",
    );
  });

  it("本文に宛名・opening・echo 3 項目を含む", () => {
    const out = contactReceiptEmail(BASE);
    expect(out.html).toContain("山田太郎 様");
    expect(out.html).toContain("ビジ友へのお問い合わせを受け付けました。");
    expect(out.html).toContain("【お問い合わせの種類】 料金について");
    expect(out.html).toContain(
      "【お問い合わせ内容】 プランの違いを教えてください。",
    );
    expect(out.html).toContain("【受付日時】 2026/06/28 10:30");
  });

  it("detail の改行は <br> に変換される (white-space:pre-wrap 相当)", () => {
    const out = contactReceiptEmail({
      ...BASE,
      detail: "1 行目\n2 行目\n3 行目",
    });
    expect(out.html).toContain("1 行目<br>2 行目<br>3 行目");
  });

  it("HTML エスケープが効く (XSS 防止)", () => {
    const out = contactReceiptEmail({
      ...BASE,
      detail: "<script>alert('x')</script>",
    });
    expect(out.html).not.toContain("<script>alert");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("入れない要素 (closing / 連絡予告 / フィッシング配慮文 / 添付情報)", () => {
    const out = contactReceiptEmail(BASE);
    expect(out.html).not.toContain("確認のうえご連絡いたします");
    expect(out.html).not.toContain("しばらくお待ちください");
    expect(out.html).not.toContain("お心当たりがない場合");
    expect(out.html).not.toContain("添付ファイル");
  });
});

// ----------------------------------------------------------------------------
// §7.1.B 運営通知 (contactOpsNotificationEmail)
// ----------------------------------------------------------------------------

describe("contactOpsNotificationEmail — §7.1.B", () => {
  const BASE = {
    companyName: "山田工務店",
    name: "山田太郎",
    phone: "03-1234-5678",
    email: "yamada@example.com",
    inquiryType: "料金について",
    receivedAt: "2026/06/28 10:30",
    siteUrl: "https://bijiyu.example.com",
    contactId: "c-1234",
  } as const;

  it("件名は「【ビジ友 運営】お問い合わせを受信しました」(M-07 プレフィックス)", () => {
    const out = contactOpsNotificationEmail({
      ...BASE,
      loginStatus: { kind: "anonymous" },
    });
    expect(out.subject).toBe("【ビジ友 運営】お問い合わせを受信しました");
  });

  it("送信者情報ブロック 5 行 + 内容情報 2 行 + deep link", () => {
    const out = contactOpsNotificationEmail({
      ...BASE,
      loginStatus: { kind: "logged_in", memberDisplayName: "山田工務店" },
    });
    expect(out.html).toContain("【会社名／屋号】 山田工務店");
    expect(out.html).toContain("【送信者】 山田太郎");
    expect(out.html).toContain("【メールアドレス】 yamada@example.com");
    expect(out.html).toContain("【電話番号】 03-1234-5678");
    expect(out.html).toContain("【ログイン状態】 ログイン中（山田工務店 様）");
    expect(out.html).toContain("【お問い合わせの種類】 料金について");
    expect(out.html).toContain("【受信日時】 2026/06/28 10:30");
    expect(out.html).toContain(
      "ログインした状態で以下の URL を開いて詳細をご確認ください",
    );
    expect(out.html).toContain(
      "https://bijiyu.example.com/admin/contacts/c-1234",
    );
  });

  it("loginStatus.anonymous の場合は「未ログイン送信」表記", () => {
    const out = contactOpsNotificationEmail({
      ...BASE,
      loginStatus: { kind: "anonymous" },
    });
    expect(out.html).toContain("【ログイン状態】 未ログイン送信");
    expect(out.html).not.toContain("ログイン中（");
  });

  it("入れない要素 (本文 detail / 添付情報 / 生 UUID 本文列挙)", () => {
    const out = contactOpsNotificationEmail({
      ...BASE,
      loginStatus: { kind: "anonymous" },
    });
    expect(out.html).not.toContain("【お問い合わせ内容】");
    expect(out.html).not.toContain("添付ファイル");
    // contactId は URL のみで本文には列挙しない (生 UUID 単独行なし)
    expect(out.html).not.toContain("【ID】");
    expect(out.html).not.toContain("【お問い合わせID】");
  });
});

// ----------------------------------------------------------------------------
// §7.2.A 送信者控え (troubleReportReceiptEmail)
// ----------------------------------------------------------------------------

describe("troubleReportReceiptEmail — §7.2.A", () => {
  const BASE = {
    reporterName: "佐藤次郎",
    counterpartyName: "××建設",
    category: "支払いトラブル" as string | null,
    content: "現場で約束した金額が振り込まれていません。",
    receivedAt: "2026/06/28 11:00",
  };

  it("件名は固定「【ビジ友】トラブル報告を受け付けました」", () => {
    expect(troubleReportReceiptEmail(BASE).subject).toBe(
      "【ビジ友】トラブル報告を受け付けました",
    );
  });

  it("本文に宛名・opening・echo 4 項目を含む", () => {
    const out = troubleReportReceiptEmail(BASE);
    expect(out.html).toContain("佐藤次郎 様");
    expect(out.html).toContain("トラブル報告を受け付けました。");
    expect(out.html).toContain("【トラブル相手】 ××建設");
    expect(out.html).toContain("【トラブル種類】 支払いトラブル");
    expect(out.html).toContain(
      "【内容】 現場で約束した金額が振り込まれていません。",
    );
    expect(out.html).toContain("【受付日時】 2026/06/28 11:00");
  });

  it("category 空時は【トラブル種類】行ごと省略", () => {
    const out = troubleReportReceiptEmail({ ...BASE, category: null });
    expect(out.html).not.toContain("【トラブル種類】");
  });

  it("content の改行は <br> に変換", () => {
    const out = troubleReportReceiptEmail({
      ...BASE,
      content: "1 行目\n2 行目",
    });
    expect(out.html).toContain("1 行目<br>2 行目");
  });

  it("入れない要素 (closing / 添付情報)", () => {
    const out = troubleReportReceiptEmail(BASE);
    expect(out.html).not.toContain("運営よりご連絡いたします");
    expect(out.html).not.toContain("添付ファイル");
  });
});

// ----------------------------------------------------------------------------
// §7.2.B 運営通知 (troubleReportOpsNotificationEmail)
// ----------------------------------------------------------------------------

describe("troubleReportOpsNotificationEmail — §7.2.B", () => {
  const BASE = {
    reporterName: "佐藤次郎",
    memberDisplayName: "山田工務店",
    accountEmail: "yamada@account.example.com",
    organizationName: "山田工務店" as string | null,
    formEmail: "yamada-contact@example.com",
    counterpartyName: "××建設",
    category: "支払いトラブル" as string | null,
    receivedAt: "2026/06/28 11:00",
    siteUrl: "https://bijiyu.example.com",
    reportId: "tr-7890",
  };

  it("件名は「【ビジ友 運営】トラブル報告を受信しました」", () => {
    expect(troubleReportOpsNotificationEmail(BASE).subject).toBe(
      "【ビジ友 運営】トラブル報告を受信しました",
    );
  });

  it("報告者情報ブロック (4 行) + トラブル詳細ブロック (3 行) + deep link", () => {
    const out = troubleReportOpsNotificationEmail(BASE);
    expect(out.html).toContain("【報告者】 佐藤次郎");
    expect(out.html).toContain(
      "【ビジ友アカウント】 山田工務店 様（yamada@account.example.com）",
    );
    expect(out.html).toContain("【所属会社】 山田工務店");
    expect(out.html).toContain(
      "【連絡用メールアドレス】 yamada-contact@example.com",
    );
    expect(out.html).toContain("【トラブル相手】 ××建設");
    expect(out.html).toContain("【トラブル種類】 支払いトラブル");
    expect(out.html).toContain("【受信日時】 2026/06/28 11:00");
    expect(out.html).toContain(
      "https://bijiyu.example.com/admin/trouble-reports/tr-7890",
    );
  });

  it("organizationName null → 【所属会社】行ごと省略", () => {
    const out = troubleReportOpsNotificationEmail({
      ...BASE,
      organizationName: null,
    });
    expect(out.html).not.toContain("【所属会社】");
  });

  it("category 空 → 【トラブル種類】行ごと省略", () => {
    const out = troubleReportOpsNotificationEmail({
      ...BASE,
      category: null,
    });
    expect(out.html).not.toContain("【トラブル種類】");
  });

  it("入れない要素 (content 本文 / 添付情報 / 生 UUID 本文列挙)", () => {
    const out = troubleReportOpsNotificationEmail(BASE);
    expect(out.html).not.toContain("【内容】");
    expect(out.html).not.toContain("添付ファイル");
    expect(out.html).not.toContain("【ID】");
    expect(out.html).not.toContain("【報告ID】");
  });
});

// ----------------------------------------------------------------------------
// §7.3.B 送信者控え (jobInquiryReceiptEmail)
// ----------------------------------------------------------------------------

describe("jobInquiryReceiptEmail — §7.3.B", () => {
  const BASE = {
    senderName: "鈴木太郎",
    targetDisplayName: "山田工務店",
    topics: "報酬について、契約条件",
    content: "案件の単価を教えてください。",
    sentAt: "2026/06/28 12:15",
  };

  it("件名は「【ビジ友】求人へのお問い合わせを受け付けました」", () => {
    expect(jobInquiryReceiptEmail(BASE).subject).toBe(
      "【ビジ友】求人へのお問い合わせを受け付けました",
    );
  });

  it("本文に宛名・opening・echo 3 項目を含む", () => {
    const out = jobInquiryReceiptEmail(BASE);
    expect(out.html).toContain("鈴木太郎 様");
    expect(out.html).toContain(
      "山田工務店 へのお問い合わせを送信しました。",
    );
    expect(out.html).toContain("【お問い合わせ項目】 報酬について、契約条件");
    expect(out.html).toContain(
      "【お問い合わせ内容】 案件の単価を教えてください。",
    );
    expect(out.html).toContain("【送信日時】 2026/06/28 12:15");
  });

  it("content 空時は「（未入力）」", () => {
    const out = jobInquiryReceiptEmail({ ...BASE, content: "   " });
    expect(out.html).toContain("【お問い合わせ内容】 （未入力）");
  });

  it("content の改行は <br> に変換", () => {
    const out = jobInquiryReceiptEmail({
      ...BASE,
      content: "1 行目\n2 行目",
    });
    expect(out.html).toContain("1 行目<br>2 行目");
  });

  it("入れない要素 (closing / フィッシング配慮文)", () => {
    const out = jobInquiryReceiptEmail(BASE);
    expect(out.html).not.toContain("お心当たりがない場合");
    expect(out.html).not.toContain("確認のうえご連絡");
  });
});

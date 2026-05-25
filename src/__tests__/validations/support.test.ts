import { describe, expect, it } from "vitest";

import { contactSchema } from "@/lib/validations/contact";
import { troubleReportSchema } from "@/lib/validations/trouble";

// ---------------------------------------------------------------------------
// contactSchema（COM-008）
// ---------------------------------------------------------------------------
describe("contactSchema", () => {
  const valid = {
    companyName: "山田工務店",
    name: "山田太郎",
    phone: "09012345678",
    email: "test@example.com",
    address: "東京都港区",
    inquiryType: "料金について",
    purpose: "仕事を依頼したい",
    industry: "大工",
    projectDescription: "",
    projectArea: "",
    videoConsultation: "",
    detail: "詳細な内容です",
  };

  it("正常な入力を受理する", () => {
    expect(contactSchema.safeParse(valid).success).toBe(true);
  });

  it("任意の単一選択（動画相談）は空文字を許容する", () => {
    expect(
      contactSchema.safeParse({ ...valid, videoConsultation: "" }).success,
    ).toBe(true);
  });

  it("会社名／屋号が空なら拒否する", () => {
    expect(
      contactSchema.safeParse({ ...valid, companyName: "" }).success,
    ).toBe(false);
  });

  it("メール形式が不正なら拒否する", () => {
    expect(contactSchema.safeParse({ ...valid, email: "bad" }).success).toBe(
      false,
    );
  });

  it("必須の単一選択が未選択なら拒否する", () => {
    expect(contactSchema.safeParse({ ...valid, purpose: "" }).success).toBe(
      false,
    );
  });

  it("選択肢が許可リスト外なら拒否する", () => {
    expect(
      contactSchema.safeParse({ ...valid, industry: "宇宙工" }).success,
    ).toBe(false);
  });

  it("動画相談が許可リスト外なら拒否する", () => {
    expect(
      contactSchema.safeParse({ ...valid, videoConsultation: "不正" }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// troubleReportSchema（COM-012）
// ---------------------------------------------------------------------------
describe("troubleReportSchema", () => {
  const valid = {
    reporterName: "山田太郎",
    counterpartyName: "鈴木次郎",
    email: "yamada@example.com",
    category: "支払いトラブル",
    content: "報酬が支払われません",
  };

  it("正常な入力を受理する", () => {
    expect(troubleReportSchema.safeParse(valid).success).toBe(true);
  });

  it("トラブル種類は任意（空文字可）", () => {
    expect(
      troubleReportSchema.safeParse({ ...valid, category: "" }).success,
    ).toBe(true);
  });

  it("必須項目（内容）が空なら拒否する", () => {
    expect(
      troubleReportSchema.safeParse({ ...valid, content: "" }).success,
    ).toBe(false);
  });

  it("トラブル相手の氏名が空なら拒否する", () => {
    expect(
      troubleReportSchema.safeParse({ ...valid, counterpartyName: "" }).success,
    ).toBe(false);
  });

  it("トラブル種類が許可リスト外なら拒否する", () => {
    expect(
      troubleReportSchema.safeParse({ ...valid, category: "不正" }).success,
    ).toBe(false);
  });
});

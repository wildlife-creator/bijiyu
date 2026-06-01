import { describe, expect, it } from "vitest";

import { jobInquirySchema } from "@/lib/validations/job-inquiry";

const valid = {
  name: "山田太郎",
  email: "yamada@example.com",
  topics: ["その他"],
  content: "よろしくお願いします",
};

function firstMessage(input: unknown): string | undefined {
  const result = jobInquirySchema.safeParse(input);
  if (result.success) return undefined;
  return result.error.issues[0]?.message;
}

describe("jobInquirySchema", () => {
  it("正常な入力は通過する", () => {
    const result = jobInquirySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("content 未指定はデフォルト空文字になる", () => {
    const result = jobInquirySchema.safeParse({
      name: "山田太郎",
      email: "yamada@example.com",
      topics: ["その他"],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.content).toBe("");
  });

  it("氏名未入力は固定文言で拒否する", () => {
    expect(firstMessage({ ...valid, name: "" })).toBe("氏名を入力してください");
  });

  it("氏名100文字超は固定文言で拒否する", () => {
    expect(firstMessage({ ...valid, name: "あ".repeat(101) })).toBe(
      "氏名は100文字以内で入力してください",
    );
  });

  it("メール未入力は固定文言で拒否する", () => {
    expect(firstMessage({ ...valid, email: "" })).toBe(
      "メールアドレスを入力してください",
    );
  });

  it("メール形式不正は固定文言で拒否する", () => {
    expect(firstMessage({ ...valid, email: "not-an-email" })).toBe(
      "メールアドレスの形式が正しくありません",
    );
  });

  it("お問い合わせ項目未選択は固定文言で拒否する", () => {
    expect(firstMessage({ ...valid, topics: [] })).toBe(
      "お問い合わせ項目を選択してください",
    );
  });

  it("不正な項目ラベルは拒否する", () => {
    const result = jobInquirySchema.safeParse({ ...valid, topics: ["存在しない項目"] });
    expect(result.success).toBe(false);
  });

  it("内容2000文字超は固定文言で拒否する", () => {
    expect(firstMessage({ ...valid, content: "あ".repeat(2001) })).toBe(
      "お問い合わせ内容は2000文字以内で入力してください",
    );
  });
});

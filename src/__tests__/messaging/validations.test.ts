import { describe, it, expect } from "vitest";
import {
  messageSchema,
  scoutSchema,
  bulkMessageSchema,
} from "@/lib/validations/message";

// ---------------------------------------------------------------------------
// messageSchema
// ---------------------------------------------------------------------------
describe("messageSchema", () => {
  it("正常系: body のみ", () => {
    const result = messageSchema.safeParse({ body: "テストメッセージ" });
    expect(result.success).toBe(true);
  });

  it("異常系: body が空", () => {
    const result = messageSchema.safeParse({ body: "" });
    expect(result.success).toBe(false);
  });

  it("異常系: body が5000文字超", () => {
    const result = messageSchema.safeParse({ body: "あ".repeat(5001) });
    expect(result.success).toBe(false);
  });

  it("正常系: body が5000文字ちょうど", () => {
    const result = messageSchema.safeParse({ body: "あ".repeat(5000) });
    expect(result.success).toBe(true);
  });

  it("正常系: image がJPEGファイル", () => {
    const file = new File(["data"], "test.jpg", { type: "image/jpeg" });
    const result = messageSchema.safeParse({ body: "msg", image: file });
    expect(result.success).toBe(true);
  });

  it("正常系: image がPNGファイル", () => {
    const file = new File(["data"], "test.png", { type: "image/png" });
    const result = messageSchema.safeParse({ body: "msg", image: file });
    expect(result.success).toBe(true);
  });

  it("異常系: image が不正形式（GIF）", () => {
    const file = new File(["data"], "test.gif", { type: "image/gif" });
    const result = messageSchema.safeParse({ body: "msg", image: file });
    expect(result.success).toBe(false);
  });

  it("異常系: image が10MB超", () => {
    const largeData = new Uint8Array(10 * 1024 * 1024 + 1);
    const file = new File([largeData], "large.jpg", { type: "image/jpeg" });
    const result = messageSchema.safeParse({ body: "msg", image: file });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// scoutSchema
// ---------------------------------------------------------------------------
describe("scoutSchema", () => {
  const validData = {
    userId: "11111111-1111-1111-1111-111111111111",
    jobId: "22222222-2222-2222-2222-222222222222",
    title: "スカウトタイトル",
    body: "スカウト本文",
  };

  it("正常系: 全フィールドあり", () => {
    const result = scoutSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("異常系: userId が不正", () => {
    const result = scoutSchema.safeParse({
      ...validData,
      userId: "invalid-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("異常系: jobId が不正", () => {
    const result = scoutSchema.safeParse({
      ...validData,
      jobId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("異常系: title が空", () => {
    const result = scoutSchema.safeParse({ ...validData, title: "" });
    expect(result.success).toBe(false);
  });

  it("異常系: body が空", () => {
    const result = scoutSchema.safeParse({ ...validData, body: "" });
    expect(result.success).toBe(false);
  });

  it("異常系: body が5000文字超", () => {
    const result = scoutSchema.safeParse({
      ...validData,
      body: "あ".repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bulkMessageSchema
// ---------------------------------------------------------------------------
describe("bulkMessageSchema", () => {
  it("正常系: 1名選択", () => {
    const result = bulkMessageSchema.safeParse({
      recipientIds: ["11111111-1111-1111-1111-111111111111"],
      body: "一斉送信テスト",
    });
    expect(result.success).toBe(true);
  });

  it("正常系: 複数名選択", () => {
    const result = bulkMessageSchema.safeParse({
      recipientIds: [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
      ],
      body: "一斉送信テスト",
    });
    expect(result.success).toBe(true);
  });

  it("異常系: recipientIds が空配列", () => {
    const result = bulkMessageSchema.safeParse({
      recipientIds: [],
      body: "テスト",
    });
    expect(result.success).toBe(false);
  });

  it("異常系: body が空", () => {
    const result = bulkMessageSchema.safeParse({
      recipientIds: ["11111111-1111-1111-1111-111111111111"],
      body: "",
    });
    expect(result.success).toBe(false);
  });

  it("異常系: recipientIds に不正UUID", () => {
    const result = bulkMessageSchema.safeParse({
      recipientIds: ["bad-uuid"],
      body: "テスト",
    });
    expect(result.success).toBe(false);
  });
});

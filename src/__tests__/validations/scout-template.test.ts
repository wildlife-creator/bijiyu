import { describe, it, expect } from "vitest";

import { scoutTemplateSchema } from "@/lib/validations/message";

describe("scoutTemplateSchema", () => {
  it("メモ空欄は null になる", () => {
    const r = scoutTemplateSchema.safeParse({ title: "t", body: "b", memo: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.memo).toBeNull();
  });

  it("フォームで変換した値（memo: null）を Server Action が再検証しても通る", () => {
    // zodResolver が onSubmit に渡すのは変換後の値。createScoutTemplateAction は
    // それをもう一度 scoutTemplateSchema で検証する（2026-09-30 staging で
    // メモ空欄のテンプレートが「Invalid input」で保存できなかった）
    const first = scoutTemplateSchema.parse({ title: "t", body: "b", memo: "" });
    const second = scoutTemplateSchema.safeParse(first);
    expect(second.success).toBe(true);
    if (second.success) expect(second.data.memo).toBeNull();
  });

  it("メモ未指定（undefined）も通る", () => {
    const r = scoutTemplateSchema.safeParse({ title: "t", body: "b" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.memo).toBeNull();
  });

  it("メモ入力ありは前後の空白を除いてそのまま", () => {
    const r = scoutTemplateSchema.safeParse({ title: "t", body: "b", memo: "  社内用  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.memo).toBe("社内用");
  });

  it("メモ 501 文字は日本語のエラー", () => {
    const r = scoutTemplateSchema.safeParse({ title: "t", body: "b", memo: "あ".repeat(501) });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("メモは500文字以内で入力してください");
  });
});

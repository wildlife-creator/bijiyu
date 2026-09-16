import { describe, expect, it } from "vitest";

import {
  BANK_TRANSFER_INQUIRY_TYPE,
  BANK_TRANSFER_PLAN_CHOICES,
  BANK_TRANSFER_PLAN_KEYS,
  CONTACT_INQUIRY_TYPES,
  bankTransferPlanLabel,
  isBankTransferPlanKey,
} from "@/lib/constants/contact-options";
import { TROUBLE_CATEGORIES } from "@/lib/constants/trouble-options";
import { contactSchema } from "@/lib/validations/contact";
import { troubleReportSchema } from "@/lib/validations/trouble";

// ---------------------------------------------------------------------------
// P8: 報酬未払いの窓口（お問い合わせ内容 / トラブル種類）
// ---------------------------------------------------------------------------
describe("P8 報酬未払い窓口の選択肢", () => {
  it("お問い合わせ内容に「報酬未払いについて」があり、「その他」の直前に並ぶ", () => {
    const list = [...CONTACT_INQUIRY_TYPES];
    expect(list).toContain("報酬未払いについて");
    expect(list.indexOf("報酬未払いについて")).toBe(list.indexOf("その他") - 1);
    expect(contactSchema.shape.inquiryType.safeParse("報酬未払いについて").success).toBe(true);
  });

  it("トラブル種類に「報酬未払い」があり、「支払いトラブル」の直後に並ぶ（既存項目は維持）", () => {
    const list = [...TROUBLE_CATEGORIES];
    expect(list).toContain("報酬未払い");
    expect(list).toContain("支払いトラブル");
    expect(list.indexOf("報酬未払い")).toBe(list.indexOf("支払いトラブル") + 1);
    expect(troubleReportSchema.shape.category.safeParse("報酬未払い").success).toBe(true);
  });
});

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

// ---------------------------------------------------------------------------
// P12: 銀行振込のお問い合わせ（希望プラン）
// ---------------------------------------------------------------------------
describe("P12 銀行振込の希望プラン", () => {
  const base = {
    companyName: "山田工務店",
    name: "山田太郎",
    phone: "09012345678",
    email: "test@example.com",
    inquiryType: BANK_TRANSFER_INQUIRY_TYPE,
    purpose: "仕事を依頼したい",
    industry: "大工",
    detail: "銀行振込で契約したいです",
  };

  it("選択肢は基本プラン 4 種 + 動画プラン 3 種。旧 職場紹介動画・補償・急募は含まない", () => {
    expect(BANK_TRANSFER_PLAN_KEYS).toEqual([
      "individual",
      "small",
      "corporate",
      "corporate_premium",
      "video",
      "video_shooting",
      "video_sns",
    ]);
    expect(BANK_TRANSFER_PLAN_CHOICES.map((c) => c.kind)).toEqual([
      "plan", "plan", "plan", "plan", "video", "video", "video",
    ]);
    expect(isBankTransferPlanKey("video_workplace")).toBe(false);
    expect(isBankTransferPlanKey("compensation_5000")).toBe(false);
    expect(bankTransferPlanLabel("small")).toBe("スタンダードプラン");
    expect(bankTransferPlanLabel("video")).toBe("プロフィール動画制作プラン");
    expect(bankTransferPlanLabel(null)).toBeNull();
    // 未知のキー（将来の廃止等）は壊さずそのまま返す
    expect(bankTransferPlanLabel("legacy_key")).toBe("legacy_key");
  });

  it("銀行振込を選んだら希望プランが必須（キーで検証）", () => {
    expect(contactSchema.safeParse({ ...base, bankTransferPlan: "" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...base }).success).toBe(false);
    expect(contactSchema.safeParse({ ...base, bankTransferPlan: "スタンダードプラン" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...base, bankTransferPlan: "small" }).success).toBe(true);
    const r = contactSchema.safeParse({ ...base, bankTransferPlan: "" });
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join("."))).toContain("bankTransferPlan");
  });

  it("銀行振込以外では希望プランは空でなければならない", () => {
    expect(
      contactSchema.safeParse({ ...base, inquiryType: "料金について", bankTransferPlan: "small" }).success,
    ).toBe(false);
    expect(
      contactSchema.safeParse({ ...base, inquiryType: "料金について", bankTransferPlan: "" }).success,
    ).toBe(true);
  });
});

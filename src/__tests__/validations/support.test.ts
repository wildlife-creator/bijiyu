import { describe, expect, it } from "vitest";

import {
  BANK_TRANSFER_DETAIL_GUIDE,
  BANK_TRANSFER_INQUIRY_TYPE,
  BANK_TRANSFER_VIDEO_CHOICES,
  CONTACT_INQUIRY_TYPES,
} from "@/lib/constants/contact-options";
import { TROUBLE_CATEGORIES } from "@/lib/constants/trouble-options";
import { contactSchema } from "@/lib/validations/contact";
import { troubleReportSchema } from "@/lib/validations/trouble";

// ---------------------------------------------------------------------------
// 報酬未払いの窓口（お問い合わせ内容 / トラブル種類）
// ---------------------------------------------------------------------------
describe("報酬未払い窓口の選択肢", () => {
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
// 銀行振込のお問い合わせ（希望は問い合わせ詳細に書く）
// ---------------------------------------------------------------------------
describe("銀行振込のお問い合わせ", () => {
  const base = {
    companyName: "山田工務店",
    name: "山田太郎",
    phone: "09012345678",
    email: "test@example.com",
    inquiryType: BANK_TRANSFER_INQUIRY_TYPE,
    purpose: "仕事を依頼したい",
    industry: "大工",
    detail: "スタンダードプラン 月払いを銀行振込で契約したいです",
  };

  it("種類名は「銀行振込について」（旧名「お支払い方法（銀行振込）について」は選択肢に無い）", () => {
    expect(BANK_TRANSFER_INQUIRY_TYPE).toBe("銀行振込について");
    expect([...CONTACT_INQUIRY_TYPES]).toContain("銀行振込について");
    expect([...CONTACT_INQUIRY_TYPES]).not.toContain("お支払い方法（銀行振込）について");
  });

  it("希望プランの入力欄は無く、問い合わせ詳細だけで受理する", () => {
    const r = contactSchema.safeParse({ ...base });
    expect(r.success).toBe(true);
    // 旧フィールドを送ってきても保存対象にならない（スキーマに無いので落ちる）
    const legacy = contactSchema.safeParse({ ...base, bankTransferPlan: "small" });
    expect(legacy.success && "bankTransferPlan" in legacy.data).toBe(false);
  });

  it("問い合わせ詳細が空なら拒否する（希望はここに書いてもらうため）", () => {
    expect(contactSchema.safeParse({ ...base, detail: "" }).success).toBe(false);
  });

  it("問い合わせ詳細の案内は、プラン・オプション名／急募の案件名／未定なら相談、を伝える", () => {
    expect(BANK_TRANSFER_DETAIL_GUIDE).toContain("基本プラン・オプションの名前");
    expect(BANK_TRANSFER_DETAIL_GUIDE).toContain("対象の案件名");
    expect(BANK_TRANSFER_DETAIL_GUIDE).toContain("ご相談ください");
  });

  it("管理画面で手動設定できる動画プランは 3 種（補償は含まない）", () => {
    expect(BANK_TRANSFER_VIDEO_CHOICES.map((c) => c.key)).toEqual(["video", "video_shooting", "video_sns"]);
    expect(BANK_TRANSFER_VIDEO_CHOICES.map((c) => c.label)).toEqual([
      "プロフィール動画制作プラン",
      "ユーザー撮影動画制作プラン",
      "ビジ友公式SNS動画制作プラン",
    ]);
  });
});

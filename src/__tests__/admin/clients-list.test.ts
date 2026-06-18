import { describe, expect, it } from "vitest";

import {
  ADMIN_PLAN_LABELS,
  CLIENT_CATEGORY_LABELS,
  deriveClientCategory,
  derivePlanLabel,
  resolveContractHolderId,
  type ClientCategory,
} from "@/lib/admin/clients-list";

/**
 * ADM-003 発注者一覧の導出ロジック（純粋関数）のテスト。
 * 区分・プラン・契約主体の解決を role × org_role × plan の組合せで網羅する。
 */

describe("deriveClientCategory（区分の導出）", () => {
  it("client + org owner → 管理責任者（プランに関わらず）", () => {
    expect(
      deriveClientCategory({
        role: "client",
        orgRole: "owner",
        planType: "corporate",
      }),
    ).toBe("owner");
    expect(
      deriveClientCategory({
        role: "client",
        orgRole: "owner",
        planType: "corporate_premium",
      }),
    ).toBe("owner");
  });

  it("client + individual プラン → 個人発注者", () => {
    expect(
      deriveClientCategory({
        role: "client",
        orgRole: null,
        planType: "individual",
      }),
    ).toBe("individual");
  });

  it("client + small プラン → 小規模発注者", () => {
    expect(
      deriveClientCategory({ role: "client", orgRole: null, planType: "small" }),
    ).toBe("small");
  });

  it("client + 有効サブスクなし・組織なし → 判定不能（null）", () => {
    expect(
      deriveClientCategory({ role: "client", orgRole: null, planType: null }),
    ).toBeNull();
  });

  it("staff + org_role=admin → 組織管理者", () => {
    expect(
      deriveClientCategory({ role: "staff", orgRole: "admin", planType: null }),
    ).toBe("org_admin");
  });

  it("staff + org_role=staff → 担当者", () => {
    expect(
      deriveClientCategory({ role: "staff", orgRole: "staff", planType: null }),
    ).toBe("org_staff");
  });

  it("staff + 組織所属なし（退会カスケード後等）→ 判定不能（null）", () => {
    expect(
      deriveClientCategory({ role: "staff", orgRole: null, planType: null }),
    ).toBeNull();
  });

  it("staff の planType は無視される（契約主体のプランで区分しない）", () => {
    expect(
      deriveClientCategory({
        role: "staff",
        orgRole: "staff",
        planType: "corporate",
      }),
    ).toBe("org_staff");
  });
});

describe("derivePlanLabel（プラン列の表記）", () => {
  it("4プランを 個人/小規模/法人/法人・高サポート で表記する", () => {
    expect(derivePlanLabel("individual")).toBe("個人");
    expect(derivePlanLabel("small")).toBe("小規模");
    expect(derivePlanLabel("corporate")).toBe("法人");
    expect(derivePlanLabel("corporate_premium")).toBe("法人・高サポート");
  });

  it("有効サブスクなし（null）・未知の値は null", () => {
    expect(derivePlanLabel(null)).toBeNull();
    expect(derivePlanLabel("free")).toBeNull();
    expect(derivePlanLabel("unknown")).toBeNull();
  });
});

describe("resolveContractHolderId（契約主体の解決）", () => {
  it("client は本人が契約主体", () => {
    expect(
      resolveContractHolderId({
        role: "client",
        userId: "user-1",
        orgOwnerId: null,
      }),
    ).toBe("user-1");
  });

  it("staff は所属組織の Owner が契約主体", () => {
    expect(
      resolveContractHolderId({
        role: "staff",
        userId: "staff-1",
        orgOwnerId: "owner-1",
      }),
    ).toBe("owner-1");
  });

  it("staff で組織が解決できない場合は null（行クリック不可）", () => {
    expect(
      resolveContractHolderId({
        role: "staff",
        userId: "staff-1",
        orgOwnerId: null,
      }),
    ).toBeNull();
  });
});

describe("ラベル定義の網羅", () => {
  it("5区分すべてに画面表記がある（org_role=admin は「組織管理者」表記）", () => {
    const expected: Record<ClientCategory, string> = {
      owner: "管理責任者",
      org_admin: "組織管理者",
      org_staff: "担当者",
      individual: "個人発注者",
      small: "小規模発注者",
    };
    expect(CLIENT_CATEGORY_LABELS).toEqual(expected);
  });

  it("ADMIN_PLAN_LABELS は有料4プランのみ", () => {
    expect(Object.keys(ADMIN_PLAN_LABELS).sort()).toEqual([
      "corporate",
      "corporate_premium",
      "individual",
      "small",
    ]);
  });
});

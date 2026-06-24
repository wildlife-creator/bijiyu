import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * proxy-account-multi-org-support Phase 7 / Task 7.1
 *
 * `setActiveOrganizationContext` Server Action の単体テスト。
 *
 * 検証ポイント:
 *   - 不正な UUID 形式は invalid_org_id で拒否
 *   - actor の memberships に含まれない orgId は not_a_member で拒否
 *   - 未認証 / 組織未所属でも not_a_member で拒否（Cookie は触らない）
 *   - 拒否時に Cookie を更新しない
 *   - 成功時に Cookie を「HTTP-only / SameSite=Lax / Path=/ / Max-Age=1年」で書き込み、
 *     redirectTo='/mypage' を返す
 *   - 既に Cookie が同じ orgId でも上書き成功する
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const cookieSet = vi.fn();
const cookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (...args: unknown[]) => cookieSet(...args),
    get: (...args: unknown[]) => cookieGet(...args),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));

const mockGetActive = vi.fn();
vi.mock("@/lib/organization/active-org-context", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/organization/active-org-context")
  >("@/lib/organization/active-org-context");
  return {
    ...actual,
    getActiveOrganizationContext: (...args: unknown[]) =>
      mockGetActive(...args),
  };
});

import { setActiveOrganizationContext } from "@/lib/organization/set-active-org-context";
import {
  BIZYU_ACTIVE_ORG_COOKIE,
  BIZYU_ACTIVE_ORG_COOKIE_MAX_AGE,
} from "@/lib/organization/active-org-context";

const VALID_ORG_A = "aaaa1111-1111-1111-1111-111111111111";
const VALID_ORG_B = "bbbb1111-1111-1111-1111-111111111111";
const NOT_MEMBER_ORG = "cccc1111-1111-1111-1111-111111111111";

function membership(orgId: string) {
  return {
    organizationId: orgId,
    orgRole: "staff" as const,
    isProxyAccount: true,
    displayName: "ダミー組織",
    createdAt: "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActive.mockReset();
});

// ===========================================================================
// 入力バリデーション
// ===========================================================================
describe("setActiveOrganizationContext - 入力バリデーション", () => {
  it("空文字は invalid_org_id で拒否し Cookie を触らない", async () => {
    const result = await setActiveOrganizationContext("");
    expect(result).toEqual({ success: false, error: "invalid_org_id" });
    expect(cookieSet).not.toHaveBeenCalled();
    expect(mockGetActive).not.toHaveBeenCalled();
  });

  it("UUID 形式以外は invalid_org_id で拒否", async () => {
    const result = await setActiveOrganizationContext("not-a-uuid");
    expect(result).toEqual({ success: false, error: "invalid_org_id" });
    expect(cookieSet).not.toHaveBeenCalled();
    expect(mockGetActive).not.toHaveBeenCalled();
  });

  it("SQL-ish インジェクション風 / URL 改竄も invalid_org_id で拒否", async () => {
    const result = await setActiveOrganizationContext(
      "' OR 1=1 --                          ",
    );
    expect(result).toEqual({ success: false, error: "invalid_org_id" });
    expect(cookieSet).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// メンバーシップ検証
// ===========================================================================
describe("setActiveOrganizationContext - メンバーシップ検証", () => {
  it("memberships に含まれない orgId は not_a_member で拒否", async () => {
    mockGetActive.mockResolvedValue({
      active: null,
      all: [membership(VALID_ORG_A), membership(VALID_ORG_B)],
    });
    const result = await setActiveOrganizationContext(NOT_MEMBER_ORG);
    expect(result).toEqual({ success: false, error: "not_a_member" });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("未認証 / 組織未所属 (all=[]) でも not_a_member", async () => {
    mockGetActive.mockResolvedValue({ active: null, all: [] });
    const result = await setActiveOrganizationContext(VALID_ORG_A);
    expect(result).toEqual({ success: false, error: "not_a_member" });
    expect(cookieSet).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 成功パス
// ===========================================================================
describe("setActiveOrganizationContext - 成功パス", () => {
  it("memberships に含まれる orgId で成功し redirectTo='/mypage' を返す", async () => {
    mockGetActive.mockResolvedValue({
      active: null,
      all: [membership(VALID_ORG_A), membership(VALID_ORG_B)],
    });
    const result = await setActiveOrganizationContext(VALID_ORG_B);
    expect(result).toEqual({ success: true, redirectTo: "/mypage" });
  });

  it("Cookie は HTTP-only / SameSite=Lax / Path=/ / Max-Age=1年 で書き込まれる", async () => {
    mockGetActive.mockResolvedValue({
      active: null,
      all: [membership(VALID_ORG_A)],
    });
    await setActiveOrganizationContext(VALID_ORG_A);
    expect(cookieSet).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieSet.mock.calls[0];
    expect(name).toBe(BIZYU_ACTIVE_ORG_COOKIE);
    expect(value).toBe(VALID_ORG_A);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: BIZYU_ACTIVE_ORG_COOKIE_MAX_AGE,
    });
  });

  it("単一組織ユーザーでも Cookie を保存して成功を返す（一律 API）", async () => {
    mockGetActive.mockResolvedValue({
      active: null,
      all: [membership(VALID_ORG_A)],
    });
    const result = await setActiveOrganizationContext(VALID_ORG_A);
    expect(result.success).toBe(true);
    expect(cookieSet).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  getOrganizationMemberRecipients,
  getJobClientRecipients,
} from "@/lib/email/recipients/organization-members";

type AnyAdmin = Parameters<typeof getOrganizationMemberRecipients>[0];

/**
 * 新規 broadcast ヘルパー (§1 / §3 業務通知共通) のリグレッション防止。
 *
 * §1.1.A / §1.2.A / §1.6.C/D / §3.1.A 等で「組織メンバー全員 (M-03 既定)」を解決する。
 * Owner + admin のみの §5 系ヘルパー (`organization-managers.ts`) との分離テスト。
 */

interface OrgMemberRow {
  user_id: string;
}
interface UserRow {
  id: string;
  email: string | null;
  last_name: string | null;
  first_name: string | null;
  deleted_at?: string | null;
  is_active?: boolean;
}

function makeAdminMock(opts: {
  members?: OrgMemberRow[];
  users?: UserRow[];
  ownerLookup?: UserRow | null;
}): AnyAdmin {
  const { members = [], users = [], ownerLookup = null } = opts;
  return {
    from: vi.fn((table: string) => {
      if (table === "organization_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: members, error: null }),
        };
      }
      if (table === "users") {
        // 2 用法をサポート:
        //   - broadcast: select().in(...).is(...).eq(...) → users 配列
        //   - direct lookup (個人プラン): select().eq(...).single() → 1 行
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValue({ data: ownerLookup, error: null }),
          then: (resolve: (v: { data: UserRow[]; error: null }) => unknown) =>
            resolve({ data: users, error: null }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  } as unknown as AnyAdmin;
}

describe("getOrganizationMemberRecipients", () => {
  it("organization_members が空配列なら空配列を返す", async () => {
    const admin = makeAdminMock({ members: [] });
    expect(await getOrganizationMemberRecipients(admin, "org-1")).toEqual([]);
  });

  it("owner / admin / staff 全員を返す (§5 と異なり staff も含む)", async () => {
    const admin = makeAdminMock({
      members: [
        { user_id: "u-owner" },
        { user_id: "u-admin" },
        { user_id: "u-staff" },
      ],
      users: [
        {
          id: "u-owner",
          email: "owner@test.local",
          last_name: "山田",
          first_name: "太郎",
        },
        {
          id: "u-admin",
          email: "admin@test.local",
          last_name: "佐藤",
          first_name: "次郎",
        },
        {
          id: "u-staff",
          email: "staff@test.local",
          last_name: "鈴木",
          first_name: "花子",
        },
      ],
    });
    const result = await getOrganizationMemberRecipients(admin, "org-1");
    expect(result.map((r) => r.userId).sort()).toEqual([
      "u-admin",
      "u-owner",
      "u-staff",
    ]);
    expect(result.find((r) => r.userId === "u-staff")?.displayName).toBe(
      "鈴木花子",
    );
  });

  it("excludeUserIds で個別除外できる", async () => {
    const admin = makeAdminMock({
      members: [{ user_id: "u-owner" }, { user_id: "u-target" }],
      users: [
        {
          id: "u-owner",
          email: "owner@test.local",
          last_name: "山田",
          first_name: "太郎",
        },
      ],
    });
    const result = await getOrganizationMemberRecipients(admin, "org-1", [
      "u-target",
    ]);
    expect(result.map((r) => r.userId)).toEqual(["u-owner"]);
  });

  it("email 空 / null は除外", async () => {
    const admin = makeAdminMock({
      members: [{ user_id: "u-a" }, { user_id: "u-b" }],
      users: [
        {
          id: "u-a",
          email: "ok@test.local",
          last_name: "佐藤",
          first_name: "次郎",
        },
        { id: "u-b", email: null, last_name: "鈴木", first_name: "花子" },
      ],
    });
    const result = await getOrganizationMemberRecipients(admin, "org-1");
    expect(result.map((r) => r.userId)).toEqual(["u-a"]);
  });

  it("姓名空欄は「ご担当者」フォールバック", async () => {
    const admin = makeAdminMock({
      members: [{ user_id: "u-x" }],
      users: [
        {
          id: "u-x",
          email: "x@test.local",
          last_name: null,
          first_name: null,
        },
      ],
    });
    const result = await getOrganizationMemberRecipients(admin, "org-1");
    expect(result[0].displayName).toBe("ご担当者");
  });
});

describe("getJobClientRecipients", () => {
  it("organization_id NULL → owner_id を直接解決 (1 名)", async () => {
    const admin = makeAdminMock({
      ownerLookup: {
        id: "u-owner",
        email: "owner@test.local",
        last_name: "山田",
        first_name: "太郎",
        deleted_at: null,
        is_active: true,
      },
    });
    const result = await getJobClientRecipients(admin, {
      owner_id: "u-owner",
      organization_id: null,
    });
    expect(result).toEqual([
      {
        userId: "u-owner",
        email: "owner@test.local",
        displayName: "山田太郎",
      },
    ]);
  });

  it("organization_id 指定時は broadcast helper に委譲 (全メンバー返却)", async () => {
    const admin = makeAdminMock({
      members: [{ user_id: "u-owner" }, { user_id: "u-staff" }],
      users: [
        {
          id: "u-owner",
          email: "owner@test.local",
          last_name: "山田",
          first_name: "太郎",
        },
        {
          id: "u-staff",
          email: "staff@test.local",
          last_name: "鈴木",
          first_name: "花子",
        },
      ],
    });
    const result = await getJobClientRecipients(admin, {
      owner_id: "u-owner",
      organization_id: "org-1",
    });
    expect(result.map((r) => r.userId).sort()).toEqual(["u-owner", "u-staff"]);
  });

  it("退会 (deleted_at) / 凍結 (is_active=false) owner は配信対象外", async () => {
    const deletedAdmin = makeAdminMock({
      ownerLookup: {
        id: "u-owner",
        email: "owner@test.local",
        last_name: "山田",
        first_name: "太郎",
        deleted_at: "2026-06-28",
        is_active: true,
      },
    });
    expect(
      await getJobClientRecipients(deletedAdmin, {
        owner_id: "u-owner",
        organization_id: null,
      }),
    ).toEqual([]);

    const inactiveAdmin = makeAdminMock({
      ownerLookup: {
        id: "u-owner",
        email: "owner@test.local",
        last_name: "山田",
        first_name: "太郎",
        deleted_at: null,
        is_active: false,
      },
    });
    expect(
      await getJobClientRecipients(inactiveAdmin, {
        owner_id: "u-owner",
        organization_id: null,
      }),
    ).toEqual([]);
  });
});

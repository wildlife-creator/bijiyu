import { describe, expect, it, vi } from "vitest";

import { resolveReporterOrganizationName } from "@/lib/email/recipients/reporter-organization";

type AnyAdmin = Parameters<typeof resolveReporterOrganizationName>[0];

interface OrgRow {
  id: string;
  owner_id?: string;
}
interface ClientProfileRow {
  user_id: string;
  display_name: string | null;
}
interface MembershipRow {
  organization_id: string;
}

function makeAdminMock(opts: {
  /** 自社 Owner として該当する organizations 行（owner_id 検索でヒット） */
  ownedOrgs?: OrgRow[];
  /** Owner 本人の client_profiles 行 (`.maybeSingle()` 用) */
  ownerProfile?: ClientProfileRow | null;
  /** organization_members 検索結果 */
  memberships?: MembershipRow[];
  /** 所属組織の owner_id を引く時の結果 (id IN ... で取得) */
  membershipOrgs?: OrgRow[];
  /** 所属組織の Owner client_profiles リスト (`.in("user_id", ...)`) */
  membershipOwnerProfiles?: ClientProfileRow[];
}): AnyAdmin {
  const {
    ownedOrgs = [],
    ownerProfile = null,
    memberships = [],
    membershipOrgs = [],
    membershipOwnerProfiles = [],
  } = opts;

  return {
    from: vi.fn((table: string) => {
      if (table === "organizations") {
        // 2 用法:
        //   - Owner 判定: select("id").eq("owner_id").is("deleted_at", null) → array thenable
        //   - 所属組織解決: select("owner_id").in("id", ids).is("deleted_at", null) → array thenable
        let useArrayBranch: "owned" | "membership" | null = null;
        return {
          select: vi.fn((cols: string) => {
            useArrayBranch = cols.includes("owner_id") && !cols.includes("id,")
              ? "membership"
              : "owned";
            return chainableArray();
          }),
        };

        function chainableArray() {
          return {
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            is: vi.fn().mockImplementation(() => ({
              then: (
                resolve: (v: { data: OrgRow[]; error: null }) => unknown,
              ) =>
                resolve({
                  data: useArrayBranch === "owned" ? ownedOrgs : membershipOrgs,
                  error: null,
                }),
            })),
          };
        }
      }

      if (table === "client_profiles") {
        // 2 用法:
        //   - 自社 Owner profile: select("display_name").eq("user_id").maybeSingle() → 1 行
        //   - 所属組織 Owner profile list: select("user_id, display_name").in("user_id", ids) → array
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockImplementation(() => ({
              then: (
                resolve: (v: {
                  data: ClientProfileRow[];
                  error: null;
                }) => unknown,
              ) => resolve({ data: membershipOwnerProfiles, error: null }),
            })),
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: ownerProfile, error: null }),
          })),
        };
      }

      if (table === "organization_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: memberships, error: null }),
        };
      }

      throw new Error(`unexpected table: ${table}`);
    }),
  } as unknown as AnyAdmin;
}

describe("resolveReporterOrganizationName", () => {
  it("Owner 1 法人: 自社 client_profiles.display_name を返す", async () => {
    const admin = makeAdminMock({
      ownedOrgs: [{ id: "org-1" }],
      ownerProfile: { user_id: "u-1", display_name: "山田工務店" },
    });
    expect(await resolveReporterOrganizationName(admin, "u-1")).toBe(
      "山田工務店",
    );
  });

  it("代理 staff N 法人兼任: 全件「、」join", async () => {
    const admin = makeAdminMock({
      memberships: [
        { organization_id: "org-a" },
        { organization_id: "org-b" },
      ],
      membershipOrgs: [
        { id: "org-a", owner_id: "u-a" },
        { id: "org-b", owner_id: "u-b" },
      ],
      membershipOwnerProfiles: [
        { user_id: "u-a", display_name: "A 組" },
        { user_id: "u-b", display_name: "B 工務店" },
      ],
    });
    expect(await resolveReporterOrganizationName(admin, "u-staff")).toBe(
      "A 組、B 工務店",
    );
  });

  it("Owner + Staff 兼任: Owner 自社 + 所属組織 join (重複は除外)", async () => {
    const admin = makeAdminMock({
      ownedOrgs: [{ id: "org-own" }],
      ownerProfile: { user_id: "u-x", display_name: "自社" },
      memberships: [{ organization_id: "org-other" }],
      membershipOrgs: [{ id: "org-other", owner_id: "u-y" }],
      membershipOwnerProfiles: [
        { user_id: "u-y", display_name: "他社" },
      ],
    });
    expect(await resolveReporterOrganizationName(admin, "u-x")).toBe(
      "自社、他社",
    );
  });

  it("法人所属なし (個人 client / contractor): null", async () => {
    const admin = makeAdminMock({});
    expect(await resolveReporterOrganizationName(admin, "u-1")).toBeNull();
  });

  it("Owner の display_name が空文字 → 行ごと省略 (null フォールバック扱い)", async () => {
    const admin = makeAdminMock({
      ownedOrgs: [{ id: "org-1" }],
      ownerProfile: { user_id: "u-1", display_name: "  " },
    });
    expect(await resolveReporterOrganizationName(admin, "u-1")).toBeNull();
  });
});

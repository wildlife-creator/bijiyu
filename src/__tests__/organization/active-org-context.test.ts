import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * proxy-account-multi-org-support Phase 2 (Task 2.1 / 2.2)
 *
 * `getActiveOrganizationContext` の単体テスト。
 *
 * 検証ポイント:
 *   - 未認証 / 組織未所属 → null を返す
 *   - 単一組織ユーザー: Cookie 無視で唯一の組織を返す
 *     （`getActorContext` の `.maybeSingle()` 結果と完全等価）
 *   - N 組織: Cookie 解決 / 不正 Cookie / Cookie 不在 のフォールバック
 *   - all[] は `created_at ASC` でソートされる
 *   - all[].displayName は `client_profiles.display_name` → 姓名 → "未設定" の順で解決
 */

// ---------------------------------------------------------------------------
// Mock storage
// ---------------------------------------------------------------------------
const cookieStore = {
  value: null as string | null,
};

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bizyu_active_org" && cookieStore.value
        ? { value: cookieStore.value }
        : undefined,
  }),
}));

import {
  BIZYU_ACTIVE_ORG_COOKIE,
  getActiveOrganizationContext,
} from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_A = "aaaa1111-1111-1111-1111-111111111111";
const ORG_B = "bbbb1111-1111-1111-1111-111111111111";
const ORG_C = "cccc1111-1111-1111-1111-111111111111";
const OWNER_A = "aaaa9999-9999-9999-9999-999999999999";
const OWNER_B = "bbbb9999-9999-9999-9999-999999999999";
const OWNER_C = "cccc9999-9999-9999-9999-999999999999";

// ---------------------------------------------------------------------------
// Thenable chain mock — `await chain.select().eq().order()` 互換
// ---------------------------------------------------------------------------
type Resolved = { data?: unknown; error?: unknown };
type Chain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  then: (resolve: (v: Resolved) => void) => void;
};

function createChain(resolved: Resolved = { data: [], error: null }): Chain {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    then: (resolve: (v: Resolved) => void) => resolve(resolved),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  return chain;
}

function mockAuth(userId: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: userId ? { id: userId } : null },
    error: null,
  });
}

function setupHappyPath({
  memberships,
  profiles = [],
  ownerUsers = [],
}: {
  memberships: Array<{
    organization_id: string;
    org_role: "owner" | "admin" | "staff";
    is_proxy_account: boolean;
    created_at: string;
    organizations: { owner_id: string; deleted_at: string | null };
  }>;
  profiles?: Array<{ user_id: string; display_name: string | null }>;
  ownerUsers?: Array<{
    id: string;
    last_name: string | null;
    first_name: string | null;
  }>;
}) {
  // 1st from(): organization_members
  mockFrom.mockReturnValueOnce(
    createChain({ data: memberships, error: null }),
  );
  if (memberships.length > 0) {
    // 2nd from(): client_profiles
    mockFrom.mockReturnValueOnce(createChain({ data: profiles, error: null }));
    // 3rd from(): users
    mockFrom.mockReturnValueOnce(
      createChain({ data: ownerUsers, error: null }),
    );
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.value = null;
});

// ===========================================================================
// 未認証 / 組織未所属
// ===========================================================================
describe("getActiveOrganizationContext - 認証・組織未所属", () => {
  it("未認証なら active=null, all=[] を返す", async () => {
    mockAuth(null);
    const supabase = await createClient();
    const result = await getActiveOrganizationContext(supabase);
    expect(result.active).toBeNull();
    expect(result.all).toEqual([]);
  });

  it("organization_members が空なら active=null, all=[]", async () => {
    mockAuth(USER_ID);
    setupHappyPath({ memberships: [] });
    const supabase = await createClient();
    const result = await getActiveOrganizationContext(supabase);
    expect(result.active).toBeNull();
    expect(result.all).toEqual([]);
  });

  it("organization_members SELECT がエラーなら active=null, all=[]", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValueOnce(
      createChain({ data: null, error: { message: "RLS denied" } }),
    );
    const supabase = await createClient();
    const result = await getActiveOrganizationContext(supabase);
    expect(result.active).toBeNull();
    expect(result.all).toEqual([]);
  });
});

// ===========================================================================
// 単一組織ユーザー: 既存挙動と等価
// ===========================================================================
describe("getActiveOrganizationContext - 単一組織は既存挙動と等価", () => {
  it("唯一の組織を active に返す（Cookie 無視）", async () => {
    mockAuth(USER_ID);
    cookieStore.value = "this-cookie-should-be-ignored-since-only-1-org";
    setupHappyPath({
      memberships: [
        {
          organization_id: ORG_A,
          org_role: "staff",
          is_proxy_account: true,
          created_at: "2026-01-01T00:00:00Z",
          organizations: { owner_id: OWNER_A, deleted_at: null },
        },
      ],
      profiles: [{ user_id: OWNER_A, display_name: "A 株式会社" }],
      ownerUsers: [{ id: OWNER_A, last_name: "山田", first_name: "太郎" }],
    });
    const supabase = await createClient();
    const result = await getActiveOrganizationContext(supabase);

    expect(result.active).toEqual({
      organizationId: ORG_A,
      orgRole: "staff",
      isProxyAccount: true,
      orgOwnerId: OWNER_A,
      isCorporate: true,
    });
    expect(result.all).toHaveLength(1);
    expect(result.all[0]).toMatchObject({
      organizationId: ORG_A,
      orgRole: "staff",
      isProxyAccount: true,
      displayName: "A 株式会社",
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  it("単一組織で client_profiles.display_name 不在なら姓名フォールバック", async () => {
    mockAuth(USER_ID);
    setupHappyPath({
      memberships: [
        {
          organization_id: ORG_A,
          org_role: "owner",
          is_proxy_account: false,
          created_at: "2026-01-01T00:00:00Z",
          organizations: { owner_id: OWNER_A, deleted_at: null },
        },
      ],
      profiles: [{ user_id: OWNER_A, display_name: null }],
      ownerUsers: [{ id: OWNER_A, last_name: "鈴木", first_name: "次郎" }],
    });
    const supabase = await createClient();
    const result = await getActiveOrganizationContext(supabase);
    expect(result.all[0].displayName).toBe("鈴木次郎");
  });

  it("単一組織で表示名が全て無いなら『未設定』", async () => {
    mockAuth(USER_ID);
    setupHappyPath({
      memberships: [
        {
          organization_id: ORG_A,
          org_role: "owner",
          is_proxy_account: false,
          created_at: "2026-01-01T00:00:00Z",
          organizations: { owner_id: OWNER_A, deleted_at: null },
        },
      ],
      profiles: [],
      ownerUsers: [{ id: OWNER_A, last_name: null, first_name: null }],
    });
    const supabase = await createClient();
    const result = await getActiveOrganizationContext(supabase);
    expect(result.all[0].displayName).toBe("未設定");
  });
});

// ===========================================================================
// N 組織: Cookie 解決
// ===========================================================================
describe("getActiveOrganizationContext - N 組織の Cookie 解決", () => {
  const baseMemberships = [
    {
      organization_id: ORG_B,
      org_role: "staff" as const,
      is_proxy_account: true,
      created_at: "2026-02-01T00:00:00Z",
      organizations: { owner_id: OWNER_B, deleted_at: null },
    },
    {
      organization_id: ORG_A,
      org_role: "staff" as const,
      is_proxy_account: true,
      created_at: "2026-01-01T00:00:00Z", // ← 最古
      organizations: { owner_id: OWNER_A, deleted_at: null },
    },
    {
      organization_id: ORG_C,
      org_role: "staff" as const,
      is_proxy_account: true,
      created_at: "2026-03-01T00:00:00Z",
      organizations: { owner_id: OWNER_C, deleted_at: null },
    },
  ];

  const baseProfiles = [
    { user_id: OWNER_A, display_name: "A 株式会社" },
    { user_id: OWNER_B, display_name: "B 工務店" },
    { user_id: OWNER_C, display_name: "C 建設" },
  ];

  const baseOwnerUsers = [
    { id: OWNER_A, last_name: "甲", first_name: "一郎" },
    { id: OWNER_B, last_name: "乙", first_name: "二郎" },
    { id: OWNER_C, last_name: "丙", first_name: "三郎" },
  ];

  it("Cookie 不在: created_at ASC で最古の組織を active に返す（ORG_A）", async () => {
    mockAuth(USER_ID);
    setupHappyPath({
      memberships: baseMemberships,
      profiles: baseProfiles,
      ownerUsers: baseOwnerUsers,
    });
    const supabase = await createClient();
    const result = await getActiveOrganizationContext(supabase);

    expect(result.active?.organizationId).toBe(ORG_A);
    expect(result.all).toHaveLength(3);
  });

  it("Cookie 有効: Cookie が指す組織を active に返す（ORG_C）", async () => {
    mockAuth(USER_ID);
    cookieStore.value = ORG_C;
    setupHappyPath({
      memberships: baseMemberships,
      profiles: baseProfiles,
      ownerUsers: baseOwnerUsers,
    });
    const supabase = await createClient();
    const result = await getActiveOrganizationContext(supabase);

    expect(result.active?.organizationId).toBe(ORG_C);
    expect(result.active?.orgOwnerId).toBe(OWNER_C);
  });

  it("Cookie 不正（memberships に含まれない ID）: 最古へフォールバック", async () => {
    mockAuth(USER_ID);
    cookieStore.value = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    setupHappyPath({
      memberships: baseMemberships,
      profiles: baseProfiles,
      ownerUsers: baseOwnerUsers,
    });
    const supabase = await createClient();
    const result = await getActiveOrganizationContext(supabase);

    expect(result.active?.organizationId).toBe(ORG_A);
  });
});

// ===========================================================================
// all[] のソート保証
// ===========================================================================
describe("getActiveOrganizationContext - all[] の順序", () => {
  it("all[] は created_at ASC で並ぶ（DB クエリの ORDER BY を信頼）", async () => {
    mockAuth(USER_ID);
    // DB クエリが ORDER BY created_at ASC を返した想定。
    // ヘルパーが順序を保つことを確認。
    setupHappyPath({
      memberships: [
        {
          organization_id: ORG_A,
          org_role: "staff",
          is_proxy_account: true,
          created_at: "2026-01-01T00:00:00Z",
          organizations: { owner_id: OWNER_A, deleted_at: null },
        },
        {
          organization_id: ORG_B,
          org_role: "staff",
          is_proxy_account: true,
          created_at: "2026-02-01T00:00:00Z",
          organizations: { owner_id: OWNER_B, deleted_at: null },
        },
        {
          organization_id: ORG_C,
          org_role: "staff",
          is_proxy_account: true,
          created_at: "2026-03-01T00:00:00Z",
          organizations: { owner_id: OWNER_C, deleted_at: null },
        },
      ],
      profiles: [
        { user_id: OWNER_A, display_name: "A" },
        { user_id: OWNER_B, display_name: "B" },
        { user_id: OWNER_C, display_name: "C" },
      ],
      ownerUsers: [
        { id: OWNER_A, last_name: "甲", first_name: "一郎" },
        { id: OWNER_B, last_name: "乙", first_name: "二郎" },
        { id: OWNER_C, last_name: "丙", first_name: "三郎" },
      ],
    });
    const supabase = await createClient();
    const result = await getActiveOrganizationContext(supabase);

    expect(result.all.map((m) => m.organizationId)).toEqual([
      ORG_A,
      ORG_B,
      ORG_C,
    ]);
  });
});

// ===========================================================================
// ソフト削除済組織は除外
// ===========================================================================
describe("getActiveOrganizationContext - 組織 deleted_at 除外", () => {
  it("organizations.deleted_at がセットされている組織は active / all から除外", async () => {
    mockAuth(USER_ID);
    setupHappyPath({
      memberships: [
        {
          organization_id: ORG_A,
          org_role: "staff",
          is_proxy_account: true,
          created_at: "2026-01-01T00:00:00Z",
          organizations: {
            owner_id: OWNER_A,
            deleted_at: "2026-05-01T00:00:00Z",
          },
        },
        {
          organization_id: ORG_B,
          org_role: "staff",
          is_proxy_account: true,
          created_at: "2026-02-01T00:00:00Z",
          organizations: { owner_id: OWNER_B, deleted_at: null },
        },
      ],
      profiles: [
        { user_id: OWNER_A, display_name: "(deleted)" },
        { user_id: OWNER_B, display_name: "B 工務店" },
      ],
      ownerUsers: [
        { id: OWNER_A, last_name: "甲", first_name: "一郎" },
        { id: OWNER_B, last_name: "乙", first_name: "二郎" },
      ],
    });
    const supabase = await createClient();
    const result = await getActiveOrganizationContext(supabase);

    expect(result.all).toHaveLength(1);
    expect(result.all[0].organizationId).toBe(ORG_B);
    expect(result.active?.organizationId).toBe(ORG_B);
  });
});

// ===========================================================================
// 公開 Cookie 名定数
// ===========================================================================
describe("getActiveOrganizationContext - Cookie 名定数", () => {
  it("BIZYU_ACTIVE_ORG_COOKIE は 'bizyu_active_org'", () => {
    expect(BIZYU_ACTIVE_ORG_COOKIE).toBe("bizyu_active_org");
  });
});

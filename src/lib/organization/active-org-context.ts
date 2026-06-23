import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * proxy-account-multi-org-support Phase 2 / Task 2.1
 *
 * `getActiveOrganizationContext`:
 *   現在のログインユーザーが所属する全 `organization_members` 行を取得し、
 *   Cookie `bizyu_active_org` を考慮して「現在の組織コンテキスト」を解決する。
 *
 * 設計のキー:
 *   - 単一組織ユーザーには Cookie を無視して唯一の組織を返す（既存挙動と等価）
 *   - N 組織で Cookie 不在 / 不正な場合は `created_at ASC` で最古の組織を既定値とする
 *   - 戻り値の `all[]` は OrgSwitcher UI（Phase 7）と兼用できるよう、
 *     表示名（`client_profiles.display_name` → 姓名 → "未設定"）まで解決済の
 *     サマリ配列で返す
 *
 * 仕様: `.kiro/specs/proxy-account-multi-org-support/design.md`
 *      → Components and Interfaces / Helper Layer
 * 要件: 7.1, 7.2, 7.3, 7.5, 7.6, 1.3, 1.4
 */

export const BIZYU_ACTIVE_ORG_COOKIE = "bizyu_active_org";

/** Cookie の Max-Age（1 年）。`setActiveOrganizationContext`（Phase 7）と共用。 */
export const BIZYU_ACTIVE_ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type OrgRole = "owner" | "admin" | "staff";

export interface ActiveOrgContext {
  organizationId: string;
  orgRole: OrgRole;
  isProxyAccount: boolean;
  orgOwnerId: string;
  /**
   * 現状常に `true`。`organization_members` に行があるユーザーは法人プラン
   * コンテキスト下にあると見なす。将来の拡張余地として型に残す。
   */
  isCorporate: boolean;
}

export interface MembershipSummary {
  organizationId: string;
  orgRole: OrgRole;
  isProxyAccount: boolean;
  /**
   * `client_profiles.display_name` で解決。空 or 不在なら組織 Owner の
   * `users.last_name + first_name`（スペース無し結合）にフォールバック。
   * 両方無ければ "未設定"。
   */
  displayName: string;
  createdAt: string;
}

export type MembershipListResult = {
  active: ActiveOrgContext | null;
  all: MembershipSummary[];
};

type SupabaseServerClient = SupabaseClient<Database>;

type EmbeddedOrg = {
  owner_id: string;
  deleted_at: string | null;
};

type MembershipRow = {
  organization_id: string;
  org_role: OrgRole;
  is_proxy_account: boolean;
  created_at: string;
  organizations: EmbeddedOrg | EmbeddedOrg[] | null;
};

function extractOrg(embed: MembershipRow["organizations"]): EmbeddedOrg | null {
  if (!embed) return null;
  if (Array.isArray(embed)) return embed[0] ?? null;
  return embed;
}

function resolveDisplayName(
  ownerId: string,
  profileMap: Map<string, string | null>,
  ownerMap: Map<string, { last_name: string | null; first_name: string | null }>,
): string {
  const fromProfile = profileMap.get(ownerId)?.trim();
  if (fromProfile) return fromProfile;
  const owner = ownerMap.get(ownerId);
  const last = owner?.last_name?.trim() ?? "";
  const first = owner?.first_name?.trim() ?? "";
  const fullName = last || first ? `${last}${first}` : "";
  return fullName || "未設定";
}

export async function getActiveOrganizationContext(
  supabase: SupabaseServerClient,
): Promise<MembershipListResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { active: null, all: [] };
  }

  // Step 1: 全 memberships を 1 SELECT で取得（organizations.owner_id / deleted_at を embed）
  const { data: rows, error } = await supabase
    .from("organization_members")
    .select(
      "organization_id, org_role, is_proxy_account, created_at, organizations!inner(owner_id, deleted_at)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error || !rows || rows.length === 0) {
    return { active: null, all: [] };
  }

  // 型安全に正規化（埋め込みリレーションが配列で来るケースに備える）+
  // ソフト削除済の organization を除外。
  // DB クエリ側で `.order('created_at', { ascending: true })` を付けているが、
  // 既定値（最古）解決の安全性を最後に JS 側でも保証する。
  const normalized = (rows as unknown as MembershipRow[])
    .map((row) => {
      const org = extractOrg(row.organizations);
      if (!org || org.deleted_at) return null;
      return {
        organizationId: row.organization_id,
        orgRole: row.org_role,
        isProxyAccount: row.is_proxy_account,
        createdAt: row.created_at,
        ownerId: org.owner_id,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  if (normalized.length === 0) {
    return { active: null, all: [] };
  }

  // Step 2: 表示名を解決（client_profiles + users を batch 取得）
  const ownerIds = Array.from(new Set(normalized.map((n) => n.ownerId)));

  const profileMap = new Map<string, string | null>();
  const ownerMap = new Map<
    string,
    { last_name: string | null; first_name: string | null }
  >();

  const [profileRes, ownerUserRes] = await Promise.all([
    supabase
      .from("client_profiles")
      .select("user_id, display_name")
      .in("user_id", ownerIds),
    supabase
      .from("users")
      .select("id, last_name, first_name")
      .in("id", ownerIds),
  ]);

  (profileRes.data ?? []).forEach((p) => {
    profileMap.set(p.user_id as string, p.display_name as string | null);
  });
  (ownerUserRes.data ?? []).forEach((u) => {
    ownerMap.set(u.id as string, {
      last_name: (u.last_name as string | null) ?? null,
      first_name: (u.first_name as string | null) ?? null,
    });
  });

  const all: MembershipSummary[] = normalized.map((n) => ({
    organizationId: n.organizationId,
    orgRole: n.orgRole,
    isProxyAccount: n.isProxyAccount,
    displayName: resolveDisplayName(n.ownerId, profileMap, ownerMap),
    createdAt: n.createdAt,
  }));

  // Step 3: active を解決
  //   - 単一組織なら唯一の組織（Cookie 無視 = 既存挙動）
  //   - N 組織なら Cookie の組織 ID を memberships で検証
  //   - Cookie 不在 / 不正なら最古（normalized[0]）にフォールバック
  let activeRow = normalized[0];
  if (normalized.length > 1) {
    const cookieStore = await cookies();
    const cookieOrgId =
      cookieStore.get(BIZYU_ACTIVE_ORG_COOKIE)?.value ?? null;
    if (cookieOrgId) {
      const fromCookie = normalized.find(
        (n) => n.organizationId === cookieOrgId,
      );
      if (fromCookie) {
        activeRow = fromCookie;
      }
    }
  }

  const active: ActiveOrgContext = {
    organizationId: activeRow.organizationId,
    orgRole: activeRow.orgRole,
    isProxyAccount: activeRow.isProxyAccount,
    orgOwnerId: activeRow.ownerId,
    isCorporate: true,
  };

  return { active, all };
}

"use server";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import {
  BIZYU_ACTIVE_ORG_COOKIE,
  BIZYU_ACTIVE_ORG_COOKIE_MAX_AGE,
  getActiveOrganizationContext,
} from "@/lib/organization/active-org-context";

/**
 * proxy-account-multi-org-support Phase 7 / Task 7.1
 *
 * `setActiveOrganizationContext`:
 *   N 組織兼任スタッフが組織コンテキストを切り替えるための Server Action。
 *   入力 `orgId` がアクターの `organization_members` に含まれることを確認し、
 *   Cookie `bizyu_active_org` を更新する。成功時は `redirectTo: '/mypage'` を
 *   返し、呼び出し側（OrgSwitcher）がハードナビゲーションを発火する。
 *
 * 設計のキー:
 *   - 遷移先は **常に `/mypage` 固定**（現在 URL が組織スコープのリソースだった場合
 *     の権限エラー / 404 を回避）
 *   - 不正な orgId は Cookie を触らず `not_a_member` / `invalid_org_id` で拒否
 *   - 検証は `getActiveOrganizationContext` の membership 解決を再利用し、
 *     アクター認証 + 組織所属確認を一括で行う
 *
 * 仕様: `.kiro/specs/proxy-account-multi-org-support/design.md`
 *      → UI Layer / Service Interface（補足: setActiveOrganizationContext）
 * 要件: 7.4, 7.5
 */

export type SetActiveOrgResult =
  | { success: true; redirectTo: "/mypage" }
  | { success: false; error: "invalid_org_id" | "not_a_member" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setActiveOrganizationContext(
  orgId: string,
): Promise<SetActiveOrgResult> {
  if (typeof orgId !== "string" || !UUID_RE.test(orgId.trim())) {
    return { success: false, error: "invalid_org_id" };
  }

  const supabase = await createClient();
  const { all } = await getActiveOrganizationContext(supabase);

  const isMember = all.some((m) => m.organizationId === orgId);
  if (!isMember) {
    return { success: false, error: "not_a_member" };
  }

  const cookieStore = await cookies();
  cookieStore.set(BIZYU_ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: BIZYU_ACTIVE_ORG_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  return { success: true, redirectTo: "/mypage" };
}

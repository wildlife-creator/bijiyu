import type { Database } from "@/types/database";

export type UserRole = Database["public"]["Enums"]["user_role"];

/**
 * 受注者アクション系 Server Action の許可ロール判定。
 * staff / admin は受注者活動を行わない設計のため拒否する（CLAUDE.md「担当者の受注者アクション制限」）。
 */
export function isContractorOrClientRole(
  role: UserRole | null | undefined,
): boolean {
  return role === "contractor" || role === "client";
}

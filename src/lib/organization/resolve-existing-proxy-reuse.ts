import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * 担当者招待 Server Action（`createMemberAction`）の事前判定ヘルパー。
 *
 * 入力 email が既存ユーザーと一致したときに、N 法人代理スタッフの
 * 再利用パスを許可するか / 拒否するかを discriminated union で返す。
 *
 * R2 (proxy-account-multi-org-support):
 *   - 既存ユーザーが他組織で代理在籍中 + 招待も isProxyAccount=true + 氏名一致
 *     → reuse_existing_proxy (新規 auth.users を作らず既存 user_id で RPC 投入)
 *   - 既存ユーザー (非代理) や、代理 ON でない招待や、論理削除済みユーザーは
 *     既存挙動（reject / new_user）にフォールバックする
 *
 * R2-7 / R2-8: プライバシー保護として既存ユーザーの氏名情報は **戻り値に含めない**。
 * 上位 Server Action 側でも氏名不一致時に既存氏名を露呈しない設計を担保する。
 *
 * RLS: admin client を渡すこと（全組織横断確認のため）。本関数は SELECT のみで
 * 副作用を持たない。
 */

export type ReuseDecision =
  | { kind: "new_user" }
  | { kind: "reuse_existing_proxy"; userId: string }
  | { kind: "reject_email_taken" }
  | { kind: "reject_name_mismatch" };

export interface ReuseInput {
  email: string;
  lastName: string;
  firstName: string;
  isProxyAccount: boolean;
}

type AdminClient = SupabaseClient<Database>;

export async function resolveExistingProxyReuse(
  admin: AdminClient,
  input: ReuseInput,
): Promise<ReuseDecision> {
  // Step 1: email で既存ユーザーを検索（active 行のみ = deleted_at IS NULL）
  //
  // email-recycle-on-delete spec / Task 6 で `.is("deleted_at", null)` を追加。
  // 削除済みユーザーは auth.users.email が印付け書き換えされる設計のため、
  // public.users.email は原本のまま残るが、本関数では active 行のみを扱う。
  // 削除済み行と active 行が同じ原本 email で並存する状況（同メールで再登録
  // された場合）でも、active 行のみが `.maybeSingle()` で拾われる。
  //
  // SELECT 列は変更なし。Step 3 の deleted_at 判定はフィルタにより dead code
  // 化するが、二重防御として残す。
  const { data: existingUser } = await admin
    .from("users")
    .select("id, last_name, first_name, deleted_at")
    .eq("email", input.email)
    .is("deleted_at", null)
    .maybeSingle();

  // Step 2: 既存ユーザーなし → 新規ユーザーとして扱う
  if (!existingUser) {
    return { kind: "new_user" };
  }

  // Step 3: 論理削除済みユーザー → 新規ユーザーとして扱う (退会後の再登録)
  //
  // Step 1 の `.is("deleted_at", null)` フィルタにより到達しない dead code。
  // 万一 RLS 等で漏れた場合の二重防御として残す。
  if (existingUser.deleted_at !== null) {
    return { kind: "new_user" };
  }

  // Step 4: 既存ユーザーの代理在籍を横断確認 (全組織スコープ)
  // limit は付けない。配列長 1 件以上で「代理在籍あり」と判定する。
  const { data: proxyMemberships } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", existingUser.id)
    .eq("is_proxy_account", true);

  const hasProxyMembership = (proxyMemberships?.length ?? 0) > 0;

  // Step 5: 代理在籍なし (一般受注者・発注者・通常スタッフ・admin 等)
  //         → 「既に登録されています」相当のエラーで拒否
  if (!hasProxyMembership) {
    return { kind: "reject_email_taken" };
  }

  // Step 6: 招待が proxy=false (通常スタッフ招待) → 拒否
  //         R5.1 で通常スタッフは 1 組織制限を維持するため再利用不可
  if (!input.isProxyAccount) {
    return { kind: "reject_email_taken" };
  }

  // Step 7: 氏名突合 (姓+名 をスペースなし結合で完全一致比較)
  const existingFullName = `${existingUser.last_name ?? ""}${existingUser.first_name ?? ""}`;
  const inputFullName = `${input.lastName}${input.firstName}`;
  if (existingFullName !== inputFullName) {
    return { kind: "reject_name_mismatch" };
  }

  // Step 8: 全条件 OK → 再利用許可。userId のみ返却 (氏名は返さない)
  return { kind: "reuse_existing_proxy", userId: existingUser.id };
}

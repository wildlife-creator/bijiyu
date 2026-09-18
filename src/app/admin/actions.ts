"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * 管理者ログアウト（AdminShell のヘッダーから呼ばれる）。
 * 一般ユーザー用 logoutAction（/login へ redirect）は流用せず、
 * admin 専用に /admin/login へ戻す。
 *
 * 動画の登録・更新は動画管理画面（ADM-027、
 * `src/app/admin/(protected)/users/[id]/videos/actions.ts`）が担う。
 */
export async function adminLogoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

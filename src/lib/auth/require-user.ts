import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Server Component（page.tsx）の冒頭で使う「ログイン必須」の共通処理。
 * 未ログインなら /login へリダイレクトし（戻らない）、ログイン中なら Supabase クライアントとユーザーを返す。
 *
 * 認可（ロール・組織・本人かどうか）は各画面で行うこと。ここはログインの有無だけを見る。
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

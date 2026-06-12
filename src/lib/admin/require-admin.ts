import { createClient } from "@/lib/supabase/server";

/**
 * admin 用 Server Action の認可ガード（Middleware + layout に加えた三重防御）。
 * 実行者が role='admin' であることを確認し、admin の userId を返す。
 */
export async function requireAdmin(): Promise<
  { ok: true; adminId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインしてください" };
  }
  const { data: actor } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (actor?.role !== "admin") {
    return { ok: false, error: "この操作を行う権限がありません" };
  }
  return { ok: true, adminId: user.id };
}

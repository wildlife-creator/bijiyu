import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { WithdrawalForm } from "./withdrawal-form";

/**
 * COM-006 退会手続き Server Component ラッパー
 *
 * 法人プラン Owner（corporate / corporate_premium）の場合のみ、警告ダイアログ
 * 表示用の `displayName` と `isCorporateOwner=true` を form に渡す。
 * （REQ-PF-006 / organization spec C 案）
 */
export default async function WithdrawalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgMember } = await supabase
    .from("organization_members")
    .select("org_role")
    .eq("user_id", user.id)
    .maybeSingle();

  let isCorporateOwner = false;
  let displayName = "（社名未設定）";

  if (orgMember?.org_role === "owner") {
    // Owner subscription は本人クエリで引ける（自分の subscriptions は SELECT 可）
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan_type")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .maybeSingle();

    isCorporateOwner =
      sub?.plan_type === "corporate" || sub?.plan_type === "corporate_premium";

    if (isCorporateOwner) {
      // display_name は client_profiles から取得（自分の profile は SELECT 可）
      // admin client を使う必要は無いが、未作成のレコード救済のため maybeSingle
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("client_profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      displayName = profile?.display_name?.trim() || displayName;
    }
  }

  return (
    <WithdrawalForm
      isCorporateOwner={isCorporateOwner}
      displayName={displayName}
    />
  );
}

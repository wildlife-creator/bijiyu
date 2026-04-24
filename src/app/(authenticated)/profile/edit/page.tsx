import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ProfileEditForm } from "./profile-edit-form";

/**
 * Task 13.5: 法人プラン Owner が /profile/edit を開いたときに
 * 「契約者引き継ぎは運営経由」の注意バナーを表示する。
 *
 * 編集機能自体は一切制限しない。同一人物の改姓・メール変更は通常通り保存可。
 */
export default async function ProfileEditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 法人プラン Owner 判定
  const [subResult, memberResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_type")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("org_role")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const planType = subResult.data?.plan_type ?? null;
  const isCorporate =
    planType === "corporate" || planType === "corporate_premium";
  const isOwner = memberResult.data?.org_role === "owner";
  const showOwnerBanner = isCorporate && isOwner;

  return (
    <>
      {showOwnerBanner && (
        <div className="mx-auto mt-4 max-w-2xl px-4">
          <div className="rounded-[8px] border border-primary/30 bg-primary/5 px-4 py-3">
            <p className="text-body-sm text-foreground">
              氏名・メールアドレスの変更は同一人物の情報更新のみです。契約者
              （管理責任者）を別の方に引き継ぐ場合は、
              <Link
                href="/contact"
                className="ml-1 underline text-primary"
              >
                お問い合わせ
              </Link>
              からご依頼ください
            </p>
          </div>
        </div>
      )}
      <ProfileEditForm />
    </>
  );
}

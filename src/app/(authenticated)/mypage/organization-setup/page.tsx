import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { OrganizationSetupForm } from "./OrganizationSetupForm";

/**
 * Task 8.7: 組織名入力暫定画面
 *
 * 法人プラン購入直後のユーザーに組織名入力を求める軽量画面。
 * CLI-021 完成後は Task 8.6 でこの画面を削除し、CLI-021 の `?setup=true`
 * フローに統合する。
 */
export default async function OrganizationSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Check user role + subscription + organization
  const [userResult, subResult, orgResult] = await Promise.all([
    admin.from("users").select("role").eq("id", user.id).single(),
    admin
      .from("subscriptions")
      .select("plan_type, status")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .in("plan_type", ["corporate", "corporate_premium"])
      .maybeSingle(),
    admin
      .from("organizations")
      .select("id, name")
      .eq("owner_id", user.id)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  const role = userResult.data?.role;

  // Redirect away if conditions not met (staff, contractor, non-corporate, name already set)
  if (
    !role ||
    role === "staff" ||
    role === "contractor" ||
    !subResult.data ||
    !orgResult.data
  ) {
    redirect("/mypage");
  }

  // If name is already set, redirect (idempotency)
  if (orgResult.data.name && orgResult.data.name.trim() !== "") {
    redirect("/mypage");
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-center text-heading-lg font-bold">
        組織名を入力してください
      </h1>
      <p className="mt-4 text-center text-body-sm text-muted-foreground">
        法人プランにご登録いただきありがとうございます。受注者に表示される組織名を入力してください。
      </p>
      <OrganizationSetupForm />
    </main>
  );
}

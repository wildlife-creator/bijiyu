"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withdrawalSchema } from "@/lib/validations/profile";
import type { ActionResult } from "@/lib/types/action-result";

export async function withdrawAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証されていません。再度ログインしてください。" };
  }

  // 2. Zod validation
  const parsed = withdrawalSchema.safeParse({
    reason: formData.get("reason"),
    details: formData.get("details"),
    confirmed: formData.get("confirmed") === "on" ? true : undefined,
  });

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。";
    return { success: false, error: firstError };
  }

  // 3. Check 1: Active applications as applicant
  const { count: activeApplicationCount } = await supabase
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("applicant_id", user.id)
    .in("status", ["applied", "accepted"]);

  if (activeApplicationCount && activeApplicationCount > 0) {
    return {
      success: false,
      error:
        "応募中または進行中の案件があるため退会できません。応募の取り下げまたは完了後に再度お試しください。",
    };
  }

  // 4. Check 2: Active applications on user's owned jobs
  const { data: ownedJobApplications } = await supabase
    .from("applications")
    .select("id, jobs!inner(owner_id)")
    .eq("jobs.owner_id", user.id)
    .eq("status", "accepted");

  if (ownedJobApplications && ownedJobApplications.length > 0) {
    return {
      success: false,
      error:
        "受注者が作業中の案件があるため退会できません。案件の完了後に再度お試しください。",
    };
  }

  // 5. Check 3: Organization membership check
  const { data: orgMembership } = await supabase
    .from("organization_members")
    .select("org_role, organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (orgMembership && orgMembership.org_role !== "owner") {
    return {
      success: false,
      error:
        "法人プランの管理責任者のみ退会手続きが可能です。管理責任者にお問い合わせください。",
    };
  }

  // --- Cascade processing ---

  // 6. Soft-delete user
  await supabase
    .from("users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", user.id);

  // 7. Close open/draft jobs
  await supabase
    .from("jobs")
    .update({ status: "closed" })
    .eq("owner_id", user.id)
    .in("status", ["draft", "open"]);

  // 8. Cancel pending/accepted applications
  await supabase
    .from("applications")
    .update({ status: "cancelled" })
    .eq("applicant_id", user.id)
    .in("status", ["applied", "accepted"]);

  // 9. Cancel active subscriptions
  await supabase
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"]);

  // 10. Cancel active option subscriptions
  await supabase
    .from("option_subscriptions")
    .update({ status: "cancelled" })
    .eq("user_id", user.id)
    .eq("status", "active");

  // 11. Remove from organization
  if (orgMembership) {
    const orgId = orgMembership.organization_id;

    await supabase
      .from("organization_members")
      .delete()
      .eq("user_id", user.id);

    // 12. Organization handling: if user was owner, check for remaining admins
    if (orgMembership.org_role === "owner") {
      const { count: remainingAdmins } = await supabase
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("org_role", "admin");

      if (!remainingAdmins || remainingAdmins === 0) {
        await supabase
          .from("organizations")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", orgId);
      }
    }
  }

  // 13. Stripe cancellation
  try {
    // TODO: billing spec 実装後に有効化
  } catch {
    // Stripe error should not block withdrawal
  }

  // 14. Send withdrawal confirmation email
  try {
    // TODO: Resend integration
    // await resend.emails.send({ ... });
  } catch (emailError) {
    console.error("Failed to send withdrawal confirmation email:", emailError);
  }

  // 15. Ban account via admin client
  const adminClient = createAdminClient();
  await adminClient.auth.admin.updateUserById(user.id, {
    ban_duration: "876600h",
  });

  // 16. Invalidate session
  await supabase.auth.signOut();

  // 17. Return success
  return { success: true };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send-email";
import { withdrawalCompletedEmail } from "@/lib/email/templates/withdrawal-completed";
import { withdrawalSchema } from "@/lib/validations/profile";
import type { ActionResult } from "@/lib/types/action-result";

const SERVICE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";

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

  // 4. Organization membership check（以降の accepted 応募チェック範囲の判定に使う）
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

  // 5. Check 2: Active applications on jobs the user is responsible for
  //    - 個人発注者 / 小規模プラン Owner（組織無し・単独メンバー）: jobs.owner_id = user.id
  //    - 法人プラン Owner: 組織全体の案件 (jobs.organization_id = org.id)
  //      Admin/Staff が組織名義で作成した案件も含めないと、退会後に進行中案件の
  //      発注責任者が不在になる（REQ-PF-006 の「発注中案件がある場合は退会不可」
  //      の本来の意図に反する）。
  let ownedJobQuery = supabase
    .from("applications")
    .select("id, jobs!inner(owner_id, organization_id)")
    .eq("status", "accepted");

  if (orgMembership?.org_role === "owner" && orgMembership.organization_id) {
    ownedJobQuery = ownedJobQuery.eq(
      "jobs.organization_id",
      orgMembership.organization_id,
    );
  } else {
    ownedJobQuery = ownedJobQuery.eq("jobs.owner_id", user.id);
  }

  const { data: ownedJobApplications } = await ownedJobQuery;

  if (ownedJobApplications && ownedJobApplications.length > 0) {
    return {
      success: false,
      error:
        "受注者が作業中の案件があるため退会できません。案件の完了後に再度お試しください。",
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

  // 11. Organization handling (C 案: organization spec Task 13.4)
  // Owner 退会時は Admin の有無に関わらず組織ごとソフトデリートし、
  // 配下 Admin / Staff の users.deleted_at も連動設定してログイン不可化。
  // client_profiles / scout_templates は削除せず保持（履歴）。
  if (orgMembership) {
    const orgId = orgMembership.organization_id;
    const adminClientForOrg = createAdminClient();

    if (orgMembership.org_role === "owner") {
      // 配下メンバー取得（Owner 以外）
      const { data: memberRows } = await adminClientForOrg
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId)
        .neq("user_id", user.id);

      const memberIds = (memberRows ?? [])
        .map((m) => m.user_id as string)
        .filter(Boolean);

      // 配下メンバーの users.deleted_at をセット（DB レベルの退会フラグ）
      if (memberIds.length > 0) {
        await adminClientForOrg
          .from("users")
          .update({ deleted_at: new Date().toISOString() })
          .in("id", memberIds);
      }

      // 配下メンバーも auth.users で ban して signin を即時ブロック
      // （public.users.deleted_at だけだと auth.users 側の signin は通ってしまい、
      //   middleware の自己 SELECT も RLS で弾かれて「新規ユーザー扱い」になる）
      for (const memberId of memberIds) {
        try {
          await adminClientForOrg.auth.admin.updateUserById(memberId, {
            ban_duration: "876600h",
          });
        } catch (err) {
          console.error(
            "[withdrawAction] failed to ban org member (non-blocking)",
            { memberId, err },
          );
        }
      }

      // organization_members を全削除（Owner 含む）
      await adminClientForOrg
        .from("organization_members")
        .delete()
        .eq("organization_id", orgId);

      // 組織をソフトデリート
      await adminClientForOrg
        .from("organizations")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", orgId);
    } else {
      // Owner 以外の自己退会（現在は上部ガードで Owner のみ到達可能だが
      // 将来の仕様変更に備え本人分のみ削除）
      await adminClientForOrg
        .from("organization_members")
        .delete()
        .eq("user_id", user.id);
    }
  }

  // 13. Stripe cancellation
  try {
    // TODO: billing spec 実装後に有効化
  } catch {
    // Stripe error should not block withdrawal
  }

  // 14. Send withdrawal confirmation email（REQ-PF-006 step 7）
  // 失敗時は非ロールバック（security.md「メール送信失敗時の共通方針」）
  try {
    const { data: deletedUser } = await createAdminClient()
      .from("users")
      .select("email, last_name, first_name")
      .eq("id", user.id)
      .maybeSingle();
    const email = deletedUser?.email ?? user.email;
    const recipientName =
      `${deletedUser?.last_name ?? ""}${deletedUser?.first_name ?? ""}`.trim() ||
      "ご利用者";
    if (email) {
      const { subject, html } = withdrawalCompletedEmail({
        recipientName,
        serviceUrl: SERVICE_URL,
      });
      await sendEmail({ to: email, subject, html });
    }
  } catch (emailError) {
    console.error(
      "[withdrawAction] withdrawal email failed (non-blocking)",
      emailError,
    );
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

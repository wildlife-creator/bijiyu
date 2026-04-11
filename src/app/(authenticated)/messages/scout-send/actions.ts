"use server";

import { createClient } from "@/lib/supabase/server";
import { scoutSchema } from "@/lib/validations/message";
import { sendEmail } from "@/lib/email/send-email";
import { scoutNotificationEmail } from "@/lib/email/templates/scout-notification";
import { resolveParticipantName } from "@/lib/utils/display-name";
import type { ActionResult } from "@/lib/types/action-result";

const SERVICE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ---------------------------------------------------------------------------
// Helper: find or create thread for org/individual + contractor pair
// ---------------------------------------------------------------------------
async function findOrCreateThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  targetUserId: string,
  organizationId: string | null,
) {
  // Search for existing thread
  if (organizationId) {
    // Corporate: search by org + contractor
    const { data: existing } = await supabase
      .from("message_threads")
      .select("id, thread_type")
      .eq("organization_id", organizationId)
      .eq("participant_2_id", targetUserId)
      .limit(1)
      .maybeSingle();
    if (existing) return existing;
  } else {
    // Individual: search by participant pair
    const { data: existing } = await supabase
      .from("message_threads")
      .select("id, thread_type")
      .or(
        `and(participant_1_id.eq.${userId},participant_2_id.eq.${targetUserId}),and(participant_1_id.eq.${targetUserId},participant_2_id.eq.${userId})`,
      )
      .limit(1)
      .maybeSingle();
    if (existing) return existing;
  }

  // Create new thread
  const { data: newThread, error } = await supabase
    .from("message_threads")
    .insert({
      participant_1_id: userId,
      participant_2_id: targetUserId,
      organization_id: organizationId,
      thread_type: "scout",
    })
    .select("id, thread_type")
    .single();

  if (error || !newThread) return null;
  return newThread;
}

// ---------------------------------------------------------------------------
// 3.2 sendScoutAction
// ---------------------------------------------------------------------------
export async function sendScoutAction(
  formData: FormData,
): Promise<ActionResult<{ threadId: string; messageId: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "認証が必要です" };

    // Role check
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!userData || (userData.role !== "client" && userData.role !== "staff")) {
      return { success: false, error: "スカウト送信は発注者のみ利用できます" };
    }

    // Validate
    const parsed = scoutSchema.safeParse({
      userId: formData.get("userId"),
      jobId: formData.get("jobId"),
      title: formData.get("title"),
      body: formData.get("body"),
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
    }

    // Get user's org (if any) and proxy account status
    const { data: orgMember } = await supabase
      .from("organization_members")
      .select("organization_id, is_proxy_account")
      .eq("user_id", user.id)
      .maybeSingle();
    const organizationId = orgMember?.organization_id ?? null;
    const isProxy = orgMember?.is_proxy_account === true;

    // Find or create thread
    const thread = await findOrCreateThread(supabase, user.id, parsed.data.userId, organizationId);
    if (!thread) return { success: false, error: "スレッドの作成に失敗しました" };

    // Duplicate scout check: same job in same thread
    const { data: existingScout } = await supabase
      .from("messages")
      .select("id")
      .eq("thread_id", thread.id)
      .eq("job_id", parsed.data.jobId)
      .eq("is_scout", true)
      .limit(1)
      .maybeSingle();

    if (existingScout) {
      return { success: false, error: "この職人には既にこの案件でスカウトを送信済みです" };
    }

    // Update thread_type to 'scout' if it was 'message'
    if (thread.thread_type === "message") {
      await supabase
        .from("message_threads")
        .update({ thread_type: "scout" })
        .eq("id", thread.id);
    }

    // Insert scout message with scout_status = 'pending'
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        thread_id: thread.id,
        sender_id: user.id,
        body: `【${parsed.data.title}】\n${parsed.data.body}`,
        is_scout: true,
        is_proxy: isProxy,
        job_id: parsed.data.jobId,
        scout_status: "pending",
      })
      .select("id")
      .single();

    if (msgError || !message) {
      return { success: false, error: "スカウトメッセージの送信に失敗しました" };
    }

    // Update thread updated_at
    await supabase
      .from("message_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", thread.id);

    // Email notification (don't rollback on failure)
    const { data: targetUser } = await supabase
      .from("users")
      .select("email, last_name, first_name")
      .eq("id", parsed.data.userId)
      .single();

    if (targetUser?.email) {
      // Resolve sender name: org.name → company_name → personal name
      const { data: senderData } = await supabase
        .from("users")
        .select("last_name, first_name, company_name")
        .eq("id", user.id)
        .single();
      let orgName: string | null = null;
      if (organizationId) {
        const { data: orgData } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", organizationId)
          .single();
        orgName = orgData?.name ?? null;
      }
      const senderName = resolveParticipantName({
        organizationName: orgName,
        companyName: senderData?.company_name,
        lastName: senderData?.last_name,
        firstName: senderData?.first_name,
      });
      const recipientName = `${targetUser.last_name ?? ""}${targetUser.first_name ?? ""}`.trim() || "ユーザー";

      const { subject, html } = scoutNotificationEmail({
        recipientName,
        senderName,
        jobTitle: parsed.data.title,
        serviceUrl: SERVICE_URL,
      });

      await sendEmail({ to: targetUser.email, subject, html }).catch((err) => {
        console.error("[sendScoutAction] Email notification failed:", err);
      });
    }

    return { success: true, data: { threadId: thread.id, messageId: message.id } };
  } catch {
    return { success: false, error: "処理中にエラーが発生しました" };
  }
}

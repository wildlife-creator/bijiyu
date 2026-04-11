"use server";

import { createClient } from "@/lib/supabase/server";
import { bulkMessageSchema } from "@/lib/validations/message";
import type { ActionResult } from "@/lib/types/action-result";

// ---------------------------------------------------------------------------
// 3.3 sendBulkMessagesAction (org-aware)
// ---------------------------------------------------------------------------
export async function sendBulkMessagesAction(
  formData: FormData,
): Promise<ActionResult<{ sent: number; failed: number }>> {
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
      return { success: false, error: "一斉送信は発注者のみ利用できます" };
    }

    // Validate
    const recipientIdsRaw = formData.get("recipientIds") as string;
    let recipientIds: string[];
    try {
      recipientIds = JSON.parse(recipientIdsRaw);
    } catch {
      return { success: false, error: "送信先の形式が不正です" };
    }

    const parsed = bulkMessageSchema.safeParse({
      recipientIds,
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

    let sent = 0;
    let failed = 0;

    for (const recipientId of parsed.data.recipientIds) {
      try {
        // Find existing thread (org-aware)
        let threadId: string | null = null;

        if (organizationId) {
          const { data: existing } = await supabase
            .from("message_threads")
            .select("id")
            .eq("organization_id", organizationId)
            .eq("participant_2_id", recipientId)
            .limit(1)
            .maybeSingle();
          threadId = existing?.id ?? null;
        } else {
          const { data: existing } = await supabase
            .from("message_threads")
            .select("id")
            .or(
              `and(participant_1_id.eq.${user.id},participant_2_id.eq.${recipientId}),and(participant_1_id.eq.${recipientId},participant_2_id.eq.${user.id})`,
            )
            .eq("thread_type", "message")
            .limit(1)
            .maybeSingle();
          threadId = existing?.id ?? null;
        }

        if (!threadId) {
          const { data: newThread, error: threadError } = await supabase
            .from("message_threads")
            .insert({
              participant_1_id: user.id,
              participant_2_id: recipientId,
              organization_id: organizationId,
              thread_type: "message",
            })
            .select("id")
            .single();
          if (threadError || !newThread) { failed++; continue; }
          threadId = newThread.id;
        }

        const { error: msgError } = await supabase.from("messages").insert({
          thread_id: threadId,
          sender_id: user.id,
          body: parsed.data.body,
          is_scout: false,
          is_proxy: isProxy,
        });
        if (msgError) { failed++; continue; }

        await supabase
          .from("message_threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", threadId);

        sent++;
      } catch {
        failed++;
      }
    }

    return { success: true, data: { sent, failed } };
  } catch {
    return { success: false, error: "処理中にエラーが発生しました" };
  }
}

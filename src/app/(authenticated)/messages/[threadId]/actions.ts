"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
// messageSchema is not used here; validation is done inline to avoid
// File instanceof issues across server/client boundary
import type { ActionResult } from "@/lib/types/action-result";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 3;
const MONTHLY_NEW_THREAD_LIMIT = 5;

async function canAccessThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  threadId: string,
  userId: string,
) {
  // RLS handles this, but we also return the thread data
  const { data, error } = await supabase
    .from("message_threads")
    .select("id, participant_1_id, participant_2_id, organization_id, thread_type")
    .eq("id", threadId)
    .single();

  if (error || !data) return null;
  return data;
}

async function isRateLimited(
  supabase: Awaited<ReturnType<typeof createClient>>,
  senderId: string,
): Promise<boolean> {
  const oneMinuteAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", senderId)
    .gte("created_at", oneMinuteAgo);
  return (count ?? 0) >= RATE_LIMIT_MAX;
}

async function isMonthlyLimitExceeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .limit(1)
    .maybeSingle();
  if (sub) return false;

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  if (userData?.role === "staff" || userData?.role === "client") return false;

  const { count } = await supabase
    .from("message_threads")
    .select("*", { count: "exact", head: true })
    .eq("participant_1_id", userId)
    .gte(
      "created_at",
      new Date(
        new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" }).slice(0, 7) + "-01T00:00:00+09:00",
      ).toISOString(),
    );
  return (count ?? 0) >= MONTHLY_NEW_THREAD_LIMIT;
}

// ---------------------------------------------------------------------------
// 3.1 sendMessageAction
// ---------------------------------------------------------------------------
export async function sendMessageAction(
  formData: FormData,
): Promise<ActionResult<{ messageId: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "認証が必要です" };

    const threadId = formData.get("threadId") as string;
    if (!threadId) return { success: false, error: "スレッドIDが必要です" };

    // Thread access check (RLS + explicit)
    const thread = await canAccessThread(supabase, threadId, user.id);
    if (!thread) return { success: false, error: "スレッドが見つかりません" };

    // Rate limit
    if (await isRateLimited(supabase, user.id)) {
      return { success: false, error: "送信頻度が高すぎます。しばらく待ってから再送信してください" };
    }

    // Check if sender is a proxy account
    const { data: orgMemberData } = await supabase
      .from("organization_members")
      .select("is_proxy_account")
      .eq("user_id", user.id)
      .maybeSingle();
    const isProxy = orgMemberData?.is_proxy_account === true;

    // Validate body
    const body = formData.get("body") as string | null;
    const imageFile = formData.get("image") as File | null;
    const hasImage = imageFile && imageFile.size > 0;
    const bodyText = body?.trim() ?? "";

    if (!bodyText && !hasImage) {
      return { success: false, error: "メッセージを入力してください" };
    }
    if (bodyText.length > 5000) {
      return { success: false, error: "メッセージは5000文字以内で入力してください" };
    }

    // Image upload (validate and upload separately from Zod)
    let imagePath: string | null = null;
    if (hasImage) {
      if (imageFile.size > 10 * 1024 * 1024) {
        return { success: false, error: "画像は10MB以下にしてください" };
      }
      if (!["image/jpeg", "image/png"].includes(imageFile.type)) {
        return { success: false, error: "画像はJPEGまたはPNG形式のみ対応しています" };
      }
      const ext = imageFile.name.split(".").pop() || "jpg";
      const fileName = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("message-attachments")
        .upload(fileName, imageFile);
      if (uploadError) {
        console.error("[sendMessageAction] Upload error:", uploadError);
        return { success: false, error: "画像のアップロードに失敗しました" };
      }
      imagePath = fileName;
    }

    // Insert message
    const { data: message, error: insertError } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        sender_id: user.id,
        body: bodyText,
        image_url: imagePath,
        is_scout: false,
        is_proxy: isProxy,
      })
      .select("id")
      .single();

    if (insertError) return { success: false, error: "メッセージの送信に失敗しました" };

    // Update thread updated_at
    await supabase
      .from("message_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId);

    return { success: true, data: { messageId: message.id } };
  } catch {
    return { success: false, error: "処理中にエラーが発生しました" };
  }
}

// ---------------------------------------------------------------------------
// 3.4 markAsReadAction
// ---------------------------------------------------------------------------
export async function markAsReadAction(
  messageIds: string[],
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "認証が必要です" };
    if (messageIds.length === 0) return { success: true };

    const admin = createAdminClient();
    const { error } = await admin
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", messageIds)
      .neq("sender_id", user.id)
      .is("read_at", null);

    if (error) return { success: false, error: "既読更新に失敗しました" };
    return { success: true };
  } catch {
    return { success: false, error: "処理中にエラーが発生しました" };
  }
}

// ---------------------------------------------------------------------------
// 3.5 respondToScoutAction (message-level scout_status)
// ---------------------------------------------------------------------------
export async function respondToScoutAction(
  messageId: string,
  response: "accepted" | "rejected",
): Promise<ActionResult<{ jobId?: string; messageId?: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "認証が必要です" };

    // Fetch the scout message
    const { data: scoutMessage, error: msgError } = await supabase
      .from("messages")
      .select("id, thread_id, sender_id, job_id, is_scout, scout_status")
      .eq("id", messageId)
      .single();

    if (msgError || !scoutMessage) {
      return { success: false, error: "スカウトメッセージが見つかりません" };
    }

    if (!scoutMessage.is_scout) {
      return { success: false, error: "このメッセージはスカウトではありません" };
    }
    if (scoutMessage.scout_status !== "pending") {
      return { success: false, error: "このスカウトには既に応答済みです" };
    }

    // Check that current user is the scout recipient (participant_2)
    const { data: thread } = await supabase
      .from("message_threads")
      .select("participant_2_id")
      .eq("id", scoutMessage.thread_id)
      .single();

    if (!thread || thread.participant_2_id !== user.id) {
      return { success: false, error: "スカウトへの応答権限がありません" };
    }

    // Update scout_status via admin client (no UPDATE RLS on messages)
    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("messages")
      .update({ scout_status: response })
      .eq("id", messageId);

    if (updateError) {
      return { success: false, error: "スカウト応答の更新に失敗しました" };
    }

    // Invalidate thread page cache so back navigation shows updated status
    revalidatePath(`/messages/${scoutMessage.thread_id}`);

    return {
      success: true,
      data: {
        jobId: scoutMessage.job_id ?? undefined,
        messageId: scoutMessage.id,
      },
    };
  } catch {
    return { success: false, error: "処理中にエラーが発生しました" };
  }
}

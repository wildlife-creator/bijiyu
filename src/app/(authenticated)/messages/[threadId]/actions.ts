"use server";

import { revalidatePath } from "next/cache";
import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send-email";
import { scoutDeclinedControlEmail } from "@/lib/email/templates/scout-declined-control";
import { getJobClientRecipients } from "@/lib/email/recipients/organization-members";
import { sendMessageNotification } from "@/lib/email/send/message-notification";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { isOwnedStoragePath } from "@/lib/storage/storage-path";
import { formatDateTime } from "@/lib/utils/format-date";
// messageSchema is not used here; validation is done inline to avoid
// File instanceof issues across server/client boundary
import type { ActionResult } from "@/lib/types/action-result";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 3;

async function canAccessThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  threadId: string,
  userId: string,
) {
  // RLS handles this, but we also return the thread data.
  // A7 (R5.2): 退会判定に必要な情報を nested 取得。
  //   - counterpart が個人 identity なら participant.deleted_at
  //   - counterpart が組織 identity なら organizations.deleted_at
  //     (組織メンバー入れ替わりで元 participant が退会しても、組織が
  //      生きていればスレッドは継続する Phase 2 設計を反映する)
  // Phase 2 (A2/A4): identity ベースメール通知に必要な organization_1_id /
  //     organization_2_id も同時に取得する。
  const { data, error } = await supabase
    .from("message_threads")
    .select(
      `id, participant_1_id, participant_2_id,
       organization_id, organization_1_id, organization_2_id, thread_type,
       participant_1:users!message_threads_participant_1_id_fkey(deleted_at),
       participant_2:users!message_threads_participant_2_id_fkey(deleted_at),
       organization_1:organizations!organization_1_id(deleted_at),
       organization_2:organizations!organization_2_id(deleted_at)`,
    )
    .eq("id", threadId)
    .single();

  if (error || !data) return null;
  return data;
}

function firstOrObj<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * A7 (R5.2): 相手 identity が退会 / 解散済みかを identity ベースで判定する。
 *
 * 旧実装は participant slot ごとの deleted_at を見ていたため、Phase 2 で
 * 「組織スレッドの元 participant staff が退会したが、組織自体は生きている」
 * ケースでも組織メンバー全員が誤ってブロックされる問題があった。
 *
 * 新実装:
 *   1. viewer がどちらの席 (identity) にいるかを判定
 *      (personal participant 一致 → その席、org 一致 → その席)
 *   2. counterpart 側 (反対側) の identity:
 *      - 組織 identity なら organizations.deleted_at のみを見る
 *        (元 participant staff の退会は無視 = 組織スレッド継続)
 *      - 個人 identity なら participant.deleted_at を見る
 *   3. viewer 側が特定できない (fallback) または nested が取れない場合は
 *      false を返す = 非ブロック
 */
function isCounterpartWithdrawn(
  thread: {
    participant_1_id: string | null;
    participant_2_id: string | null;
    organization_1_id?: string | null;
    organization_2_id?: string | null;
    participant_1?:
      | { deleted_at?: string | null }
      | Array<{ deleted_at?: string | null }>
      | null;
    participant_2?:
      | { deleted_at?: string | null }
      | Array<{ deleted_at?: string | null }>
      | null;
    organization_1?:
      | { deleted_at?: string | null }
      | Array<{ deleted_at?: string | null }>
      | null;
    organization_2?:
      | { deleted_at?: string | null }
      | Array<{ deleted_at?: string | null }>
      | null;
  },
  userId: string,
  userOrgId: string | null,
): boolean {
  // 1. viewer がどちらの席にいるかを identity ベースで判定
  let viewerOnSide2: boolean | null = null;
  if (thread.participant_1_id === userId) {
    viewerOnSide2 = false;
  } else if (thread.participant_2_id === userId) {
    viewerOnSide2 = true;
  } else if (userOrgId && thread.organization_1_id === userOrgId) {
    viewerOnSide2 = false;
  } else if (userOrgId && thread.organization_2_id === userOrgId) {
    viewerOnSide2 = true;
  }
  if (viewerOnSide2 === null) return false;

  // 2. counterpart 側の identity 種別で判定基準を切り替え
  const counterOrgId = viewerOnSide2
    ? thread.organization_1_id
    : thread.organization_2_id;

  if (counterOrgId) {
    const counterOrg = firstOrObj(
      viewerOnSide2 ? thread.organization_1 : thread.organization_2,
    );
    // 組織側 counterpart は組織自身の解散状態のみを見る
    // (組織メンバー入れ替えでの participant 退会は無視 = 組織スレッド継続)
    return counterOrg?.deleted_at != null;
  } else {
    const counterParticipant = firstOrObj(
      viewerOnSide2 ? thread.participant_1 : thread.participant_2,
    );
    return counterParticipant?.deleted_at != null;
  }
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

    // R5.2 (A7 identity-based): viewer の active org を先に解決し、
    // isCounterpartWithdrawn / isProxy 判定で使い回す。
    const { active } = await getActiveOrganizationContext(supabase);
    const isProxy = active?.isProxyAccount === true;
    const viewerOrgId = active?.organizationId ?? null;

    // A7 (R5.2): 退会/解散済み相手へのメッセージ送信をブロック。identity ベースで
    // counterpart が組織なら organizations.deleted_at のみを見る (組織メンバー
    // 入れ替えでの participant 退会は無視 = 組織スレッド継続)。
    if (isCounterpartWithdrawn(thread, user.id, viewerOrgId)) {
      return { success: false, error: "相手のユーザーは退会されました" };
    }

    // Rate limit
    if (await isRateLimited(supabase, user.id)) {
      return { success: false, error: "送信頻度が高すぎます。しばらく待ってから再送信してください" };
    }

    // Validate body
    const body = formData.get("body") as string | null;
    const rawImagePath = formData.get("imagePath");
    const bodyText = body?.trim() ?? "";
    const hasImage =
      typeof rawImagePath === "string" && rawImagePath.length > 0;

    if (!bodyText && !hasImage) {
      return { success: false, error: "メッセージを入力してください" };
    }
    if (bodyText.length > 5000) {
      return { success: false, error: "メッセージは5000文字以内で入力してください" };
    }

    // 画像はブラウザから direct-upload 済み (Vercel の 4.5MB 上限回避)。
    // 本人フォルダ配下のパスのみ許可
    let imagePath: string | null = null;
    if (hasImage) {
      if (
        !isOwnedStoragePath(rawImagePath, user.id, [
          "jpg",
          "jpeg",
          "png",
          "webp",
          "pdf",
        ])
      ) {
        return {
          success: false,
          error: "画像データが不正です。画面を再読み込みして再度お試しください",
        };
      }
      imagePath = rawImagePath;
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

    // §2.1 メッセージ受信通知 (throttle 15 分 + M-03 broadcast)、fire-and-forget。
    // メッセージ送信自体は完了済みなので、メール失敗は握り潰す。
    void sendMessageNotification(createAdminClient(), {
      threadId,
      thread,
      senderId: user.id,
      messageBody: bodyText,
      hasImage: Boolean(hasImage),
    }).catch((err) => {
      console.error(
        "[sendMessageAction] §2.1 message notification failed:",
        err,
      );
    });

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
      .select(
        "id, thread_id, sender_id, job_id, is_scout, scout_status, created_at",
      )
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

    // Phase 2: スカウト受信者 = 個人 identity 側 (organization_X_id が null な side に居る
    // personal participant)。受注者は必ず個人 identity という業務ルールに基づく。
    // 「発注者 → 受注者」の方向は sender の側と反対側で決まるため、
    // 「organization_X_id が null な side の participant_X_id が user.id」で判定する。
    // これにより ①受注者起点スレッド (受注者 = participant_1) ②個人発注者スカウト
    // の両ケースで正しく承諾/辞退できる。
    const { data: thread } = await supabase
      .from("message_threads")
      .select(
        "participant_1_id, participant_2_id, organization_1_id, organization_2_id",
      )
      .eq("id", scoutMessage.thread_id)
      .single();

    if (!thread) {
      return { success: false, error: "スカウトへの応答権限がありません" };
    }

    const isRecipientOnSide1 =
      thread.organization_1_id === null &&
      thread.participant_1_id === user.id;
    const isRecipientOnSide2 =
      thread.organization_2_id === null &&
      thread.participant_2_id === user.id;
    if (!isRecipientOnSide1 && !isRecipientOnSide2) {
      return { success: false, error: "スカウトへの応答権限がありません" };
    }

    // 送信者本人による自分のスカウトへの応答は二重防御でブロック
    if (scoutMessage.sender_id === user.id) {
      return { success: false, error: "自身のスカウトには応答できません" };
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

    // §1.3.A 発注者組織宛 broadcast (辞退のみ、承諾は応募フローで §1.4.A 発火)
    if (response === "rejected" && scoutMessage.job_id) {
      await sendScoutDeclinedEmails({
        admin,
        contractorId: user.id,
        jobId: scoutMessage.job_id,
        scoutCreatedAt: scoutMessage.created_at ?? null,
      }).catch((err) => {
        console.error("[respondToScoutAction] Email failed:", err);
      });
    }

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

// ---------------------------------------------------------------------------
// sendScoutDeclinedEmails — §1.3.A 発注者組織宛 broadcast
// ---------------------------------------------------------------------------

async function sendScoutDeclinedEmails(params: {
  admin: ReturnType<typeof createAdminClient>;
  contractorId: string;
  jobId: string;
  scoutCreatedAt: string | null;
}): Promise<void> {
  const { admin, contractorId, jobId, scoutCreatedAt } = params;

  const [jobRes, contractorRes] = await Promise.all([
    admin
      .from("jobs")
      .select("title, owner_id, organization_id")
      .eq("id", jobId)
      .single(),
    admin
      .from("users")
      .select("last_name, first_name, company_name, deleted_at")
      .eq("id", contractorId)
      .single(),
  ]);
  const job = jobRes.data;
  const contractor = contractorRes.data;
  if (!job) return;

  const contractorName = contractor
    ? getUserDisplayName(
        {
          lastName: contractor.last_name,
          firstName: contractor.first_name,
          companyName: contractor.company_name,
          deletedAt: contractor.deleted_at,
        },
        "prefer-company",
      )
    : "受注者";

  const scoutSentDate = scoutCreatedAt
    ? formatDateTime(scoutCreatedAt).split(" ")[0] || "—"
    : "—";
  const declinedAt = formatDateTime(new Date().toISOString());

  const recipients = await getJobClientRecipients(admin, {
    owner_id: job.owner_id,
    organization_id: job.organization_id ?? null,
  });
  await Promise.all(
    recipients.map((r) => {
      const { subject, html } = scoutDeclinedControlEmail({
        recipientName: r.displayName,
        jobTitle: job.title,
        contractorName,
        scoutSentDate,
        declinedAt,
      });
      return sendEmail({ to: r.email, subject, html }).catch((err) => {
        console.error(
          "[respondToScoutAction] scout-declined-control send failed:",
          err,
        );
      });
    }),
  );
}

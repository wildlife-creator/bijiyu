"use server";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoutSchema } from "@/lib/validations/message";
import { sendEmail } from "@/lib/email/send-email";
import { scoutNotificationEmail } from "@/lib/email/templates/scout-notification";
import { scoutSentBroadcastEmail } from "@/lib/email/templates/scout-sent-broadcast";
import { getOrganizationMemberRecipients } from "@/lib/email/recipients/organization-members";
import {
  areIdentityPairsEqual,
  type ThreadActorIdentity,
} from "@/lib/messaging/identity";
import { fetchAllRows } from "@/lib/admin/proxy-threads";
import {
  getUserDisplayName,
  resolveClientProfileForRow,
  resolveParticipantName,
} from "@/lib/utils/display-name";
import type { ActionResult } from "@/lib/types/action-result";

const SERVICE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";

// ---------------------------------------------------------------------------
// Helper: find or create thread by identity pair (Phase 2)
// 相手 (受注者) の組織所属 identity も含めた identity ペアでスレッドを一意化。
// 受注者起点スレッドや受注者⇔受注者などにも同一ロジックが通る。
// ---------------------------------------------------------------------------
async function findOrCreateThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  targetUserId: string,
  organizationId: string | null,
) {
  // 相手 (target) の組織 identity を admin 経由で解決
  // (organization_members は同一組織メンバーのみ SELECT 可という RLS のため)
  const { data: targetOrgRow } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", targetUserId)
    .maybeSingle();
  const targetOrgId = targetOrgRow?.organization_id ?? null;

  const myIdentity: ThreadActorIdentity = {
    userId,
    organizationId,
  };
  const targetIdentity: ThreadActorIdentity = {
    userId: targetUserId,
    organizationId: targetOrgId,
  };

  // 自分 (または自組織) が絡む候補を identity 列で拾い、JS で identity ペア照合
  const involvementOr = [
    `participant_1_id.eq.${userId}`,
    `participant_2_id.eq.${userId}`,
  ];
  if (organizationId) {
    involvementOr.push(`organization_1_id.eq.${organizationId}`);
    involvementOr.push(`organization_2_id.eq.${organizationId}`);
  }
  // R5.1: 1000 件上限による静かな打ち切りを避けるため range ページネーション。
  let candidates: Array<{
    id: string;
    thread_type: "message" | "scout";
    participant_1_id: string;
    participant_2_id: string;
    organization_1_id: string | null;
    organization_2_id: string | null;
  }> = [];
  try {
    candidates = await fetchAllRows((from, to) =>
      supabase
        .from("message_threads")
        .select(
          "id, thread_type, participant_1_id, participant_2_id, organization_1_id, organization_2_id",
        )
        .or(involvementOr.join(","))
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch {
    candidates = [];
  }

  const existing = candidates.find((t) => {
    const p1: ThreadActorIdentity = {
      userId: t.participant_1_id,
      organizationId: t.organization_1_id,
    };
    const p2: ThreadActorIdentity = {
      userId: t.participant_2_id,
      organizationId: t.organization_2_id,
    };
    return areIdentityPairsEqual([myIdentity, targetIdentity], [p1, p2]);
  });

  if (existing) {
    return { id: existing.id, thread_type: existing.thread_type };
  }

  // 新規作成: identity 列 (organization_1/2_id) を明示 set し、
  // identity UNIQUE 制約 (idx_message_threads_identity_pair_unique) と整合させる。
  // 旧 organization_id は片側 org を代表値として維持 (後方互換のため)。
  const { data: newThread, error } = await supabase
    .from("message_threads")
    .insert({
      participant_1_id: userId,
      participant_2_id: targetUserId,
      organization_1_id: organizationId,
      organization_2_id: targetOrgId,
      organization_id: organizationId ?? targetOrgId,
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
    const { active } = await getActiveOrganizationContext(supabase);
    const organizationId = active?.organizationId ?? null;
    const isProxy = active?.isProxyAccount === true;

    // Find or create thread (Phase 2: identity ベース)
    const admin = createAdminClient();
    const thread = await findOrCreateThread(supabase, admin, user.id, parsed.data.userId, organizationId);
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

    // A3: 案件タイトル（jobs.title）を取得。以前はメール本文で
    // parsed.data.title（スカウトタイトル入力欄）を「案件名」として使っていたため、
    // 控えメール件名と受信者メール本文の【案件名】欄が不正になっていた。
    // 辞退通知（respondToScoutAction 経由）は jobs.title を取得できていたのに
    // 送信側だけ非対称だった。ここで一元的に案件タイトルを解決する。
    const { data: scoutJob } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", parsed.data.jobId)
      .single();
    const jobTitle = scoutJob?.title ?? parsed.data.title;

    // Email notification (don't rollback on failure)
    const { data: targetUser } = await supabase
      .from("users")
      .select("email, last_name, first_name")
      .eq("id", parsed.data.userId)
      .single();

    if (targetUser?.email) {
      // Resolve sender name: 法人プランなら組織 Owner の client_profiles、
      // 個人プランなら自身の client_profiles（resolveClientProfileForRow で統一）
      const { data: senderSelf } = await supabase
        .from("users")
        .select(
          `last_name, first_name, deleted_at,
           client_profiles(display_name, image_url)`,
        )
        .eq("id", user.id)
        .single();

      let orgOwnerUser: typeof senderSelf | null = null;
      if (organizationId) {
        const { data: orgRow } = await supabase
          .from("organizations")
          .select(
            `owner_user:users!owner_id(
              last_name, first_name, deleted_at,
              client_profiles(display_name, image_url)
            )`,
          )
          .eq("id", organizationId)
          .single();
        orgOwnerUser =
          (orgRow?.owner_user as typeof senderSelf | null) ?? null;
      }

      const resolution = resolveClientProfileForRow({
        organization_id: organizationId,
        owner: senderSelf,
        organization: orgOwnerUser ? { owner_user: orgOwnerUser } : null,
      });
      const senderName = resolveParticipantName({
        displayName: resolution.displayName,
        lastName: resolution.lastName,
        firstName: resolution.firstName,
        deletedAt: resolution.deletedAt,
      });
      const recipientName = `${targetUser.last_name ?? ""}${targetUser.first_name ?? ""}`.trim() || "ユーザー";

      const { subject, html } = scoutNotificationEmail({
        recipientName,
        senderName,
        jobTitle,
        messageExcerpt: parsed.data.body,
      });

      await sendEmail({ to: targetUser.email, subject, html }).catch((err) => {
        console.error("[sendScoutAction] Email notification failed:", err);
      });
    }

    // §1.7.B 発注者組織宛 broadcast (fire-and-forget)
    await sendScoutSentBroadcast({
      supabase,
      senderId: user.id,
      organizationId,
      targetUserId: parsed.data.userId,
      jobTitle,
      messageBody: parsed.data.body,
    }).catch((err) => {
      console.error("[sendScoutAction] scout-sent-broadcast failed:", err);
    });

    return { success: true, data: { threadId: thread.id, messageId: message.id } };
  } catch {
    return { success: false, error: "処理中にエラーが発生しました" };
  }
}

// ---------------------------------------------------------------------------
// sendScoutSentBroadcast — §1.7.B 発注者組織宛 broadcast
// ---------------------------------------------------------------------------

async function sendScoutSentBroadcast(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  senderId: string;
  organizationId: string | null;
  targetUserId: string;
  jobTitle: string;
  messageBody: string;
}): Promise<void> {
  const { senderId, organizationId, targetUserId, jobTitle, messageBody } =
    params;
  const admin = createAdminClient();

  const [targetRes, senderRes] = await Promise.all([
    admin
      .from("users")
      .select("last_name, first_name, company_name, deleted_at")
      .eq("id", targetUserId)
      .single(),
    admin
      .from("users")
      .select("last_name, first_name")
      .eq("id", senderId)
      .single(),
  ]);

  const contractorName = targetRes.data
    ? getUserDisplayName(
        {
          lastName: targetRes.data.last_name,
          firstName: targetRes.data.first_name,
          companyName: targetRes.data.company_name,
          deletedAt: targetRes.data.deleted_at,
        },
        "prefer-company",
      )
    : "受注者";
  const actualSenderName = senderRes.data
    ? `${senderRes.data.last_name ?? ""}${senderRes.data.first_name ?? ""}`.trim() ||
      "送信者"
    : "送信者";

  let recipients: Array<{ email: string; displayName: string }> = [];
  if (organizationId) {
    recipients = await getOrganizationMemberRecipients(admin, organizationId);
  } else {
    const { data: self } = await admin
      .from("users")
      .select("email, last_name, first_name, deleted_at, is_active")
      .eq("id", senderId)
      .single();
    if (
      self?.email &&
      !self.deleted_at &&
      self.is_active !== false &&
      typeof self.email === "string" &&
      self.email.trim() !== ""
    ) {
      recipients = [
        {
          email: self.email,
          displayName:
            `${self.last_name ?? ""}${self.first_name ?? ""}`.trim() ||
            "ご担当者",
        },
      ];
    }
  }

  await Promise.all(
    recipients.map((r) => {
      const { subject, html } = scoutSentBroadcastEmail({
        memberName: r.displayName,
        contractorName,
        jobTitle,
        messageExcerpt: messageBody,
        actualSenderName,
      });
      return sendEmail({ to: r.email, subject, html }).catch((err) => {
        console.error(
          "[sendScoutAction] scout-sent-broadcast send failed:",
          err,
        );
      });
    }),
  );
}

"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canSendJobInquiry } from "@/lib/job-inquiry/access-guard";
import {
  resolveTargetOrganizationId,
  resolveViewerOrganizationId,
} from "@/lib/job-inquiry/resolve-context";
import { getJobClientRecipients } from "@/lib/email/recipients/organization-members";
import { jobInquiryNotificationEmail } from "@/lib/email/templates/job-inquiry-notification";
import { jobInquiryReceiptEmail } from "@/lib/email/templates/job-inquiry-receipt";
import { sendEmail } from "@/lib/email/send-email";
import { jobInquirySchema } from "@/lib/validations/job-inquiry";
import { resolveParticipantName } from "@/lib/utils/display-name";
import { formatDateTime } from "@/lib/utils/format-date";
import type { ActionResult } from "@/lib/types/action-result";

const MAX_SUBMISSIONS_PER_HOUR = 5;
const GENERIC_ERROR =
  "送信中にエラーが発生しました。しばらくしてから再度お試しください。";
const FORBIDDEN_ERROR = "この発注者には求人へのお問い合わせを送信できません";

export async function submitJobInquiryAction(
  targetClientId: string,
  formData: FormData,
): Promise<ActionResult> {
  // 1. 認証必須（middleware と二重防御）
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインが必要です" };
  }

  const admin = createAdminClient();

  // 2. viewer（送信者）のロール・所属組織を解決
  const { data: viewerData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const viewerOrgId = await resolveViewerOrganizationId(admin, user.id, supabase);

  // 3. 宛先 client を取得（admin client = cross-user 参照）
  const { data: targetUser } = await admin
    .from("users")
    .select("id, role, deleted_at, email, last_name, first_name")
    .eq("id", targetClientId)
    .maybeSingle();
  if (!targetUser) {
    return { success: false, error: "対象の発注者が見つかりません" };
  }
  const targetOrgId = await resolveTargetOrganizationId(admin, targetClientId);

  // 4. アクセスガード（self / deleted / same_org / admin）。UI と同じ純粋関数を呼ぶ
  const guard = canSendJobInquiry({
    viewer: { id: user.id, role: viewerData?.role ?? null, organizationId: viewerOrgId },
    target: {
      id: targetUser.id,
      deletedAt: targetUser.deleted_at,
      organizationId: targetOrgId,
    },
  });
  if (!guard.ok) {
    return { success: false, error: FORBIDDEN_ERROR };
  }

  // 5. サーバー側 Zod 再検証（クライアント検証を信用しない）
  const str = (key: string) => String(formData.get(key) ?? "");
  const topics = formData.getAll("topics").map((v) => String(v));
  const parsed = jobInquirySchema.safeParse({
    name: str("name"),
    email: str("email"),
    topics,
    content: str("content"),
  });
  if (!parsed.success) {
    const firstError =
      parsed.error.issues[0]?.message ?? "入力内容を確認してください";
    return { success: false, error: firstError };
  }
  const input = parsed.data;

  // 6. 連投制限: 直近1時間で 5 件以上は拒否（admin client で集計）。
  //    sender 本人は自分の送信行を SELECT できない（RLS）ため admin client が必須
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("job_inquiries")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", user.id)
    .gte("created_at", oneHourAgo);

  if (countError) {
    console.error("[submitJobInquiryAction] rate-limit count failed:", countError.message);
    return { success: false, error: GENERIC_ERROR };
  }
  if (count !== null && count >= MAX_SUBMISSIONS_PER_HOUR) {
    return {
      success: false,
      error: "送信回数の上限に達しました。しばらくしてから再度お試しください。",
    };
  }

  // 7. INSERT（admin client）。target_organization_id を denormalize 保存
  const { error: insertError } = await admin.from("job_inquiries").insert({
    sender_id: user.id,
    target_client_id: targetUser.id,
    target_organization_id: targetOrgId,
    name: input.name,
    email: input.email,
    topics: input.topics,
    content: input.content,
  });
  if (insertError) {
    console.error("[submitJobInquiryAction] insert failed:", insertError.message);
    return { success: false, error: GENERIC_ERROR };
  }

  // 8. 宛先発注者組織への通知メール（§7.3.A、M-03 broadcast）と
  //    送信者本人への控えメール（§7.3.B）を fire-and-forget で並列送信
  const { data: targetProfile } = await admin
    .from("client_profiles")
    .select("display_name")
    .eq("user_id", targetClientId)
    .maybeSingle();
  const recipientName = resolveParticipantName({
    displayName: targetProfile?.display_name ?? null,
    lastName: targetUser.last_name,
    firstName: targetUser.first_name,
    deletedAt: targetUser.deleted_at,
  });

  // §7.3.A: M-03 broadcast。法人プランは Owner + admin + staff 全員、個人プランは Owner 1 通
  //         (job.owner_id, organization_id) ペアと同形の引数で getJobClientRecipients を流用
  try {
    const recipients = await getJobClientRecipients(admin, {
      owner_id: targetUser.id,
      organization_id: targetOrgId,
    });
    const { subject, html } = jobInquiryNotificationEmail({
      recipientName,
      senderName: input.name,
      senderEmail: input.email,
      topics: input.topics,
      content: input.content,
    });
    for (const recipient of recipients) {
      void sendEmail({ to: recipient.email, subject, html }).catch((err) => {
        console.error(
          "[submitJobInquiryAction] notification email failed:",
          err,
        );
      });
    }
  } catch (err) {
    console.error(
      "[submitJobInquiryAction] broadcast recipient resolve failed:",
      err,
    );
  }

  // §7.3.B: 送信者本人への控え
  const sentAt = formatDateTime(new Date().toISOString());
  const receipt = jobInquiryReceiptEmail({
    senderName: input.name,
    targetDisplayName: recipientName,
    topics: input.topics.join("、"),
    content: input.content,
    sentAt,
  });
  void sendEmail({
    to: input.email,
    subject: receipt.subject,
    html: receipt.html,
  }).catch((err) => {
    console.error("[submitJobInquiryAction] receipt email failed:", err);
  });

  return { success: true };
}

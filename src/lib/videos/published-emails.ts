import { OPTION_LABELS } from "@/lib/billing/options";
import { resolveApplicantCompanyName } from "@/lib/email/recipients/applicant-company-name";
import {
  formatBillingDate,
  formatBillingDateTime,
} from "@/lib/email/recipients/billing-recipient";
import { getUserOrganizationRecipients } from "@/lib/email/recipients/organization-members";
import { sendEmail } from "@/lib/email/send-email";
import { videoPublishedEmail } from "@/lib/email/templates/video-published";
import { videoPublishedOpsEmail } from "@/lib/email/templates/video-published-ops";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  VIDEO_PLACEMENT_OPTION_TYPE,
  type VideoPlacement,
} from "@/lib/videos/constants";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * §6.6.C 動画掲載完了通知（C-User: 本人 + 法人なら組織メンバー全員 / C-Ops: 運営宛）。
 *
 * 発火条件は呼び出し側が判定する: **その掲載場所で公開中の動画が 0 → 1 本になったとき**
 * だけ（P4 承認済み既定。複数本まとめて掲載してもメールは 1 回）。
 * 2 本目以降の追加・差し替え・削除では送らない。
 *
 * 呼び出し元: 管理画面の URL 登録（`addExternalVideoAction`）と、Cloudflare の処理完了
 * （Webhook / 状態確認 → `markVideoReady`）。失敗はログのみ（本体処理を止めない）。
 * `await` で送信完了を待つこと（fire-and-forget は Vercel で途中破棄される）。
 */
export async function sendVideoPublishedEmails(
  admin: AdminClient,
  params: { userId: string; placement: VideoPlacement; siteUrl: string },
): Promise<void> {
  const { userId, placement, siteUrl } = params;
  const optionLabel = OPTION_LABELS[VIDEO_PLACEMENT_OPTION_TYPE[placement]];
  const publishedAtIso = new Date().toISOString();

  // C-User broadcast (M-03)。組織 broadcast は sendEmail 側で直列化される
  try {
    const recipients = await getUserOrganizationRecipients(admin, userId);
    await Promise.all(
      recipients.map(async (r) => {
        const built = videoPublishedEmail({
          recipientName: r.displayName,
          optionLabel,
          publishedAt: formatBillingDate(publishedAtIso),
        });
        try {
          await sendEmail({
            to: r.email,
            subject: built.subject,
            html: built.html,
          });
        } catch (err) {
          console.error("[sendVideoPublishedEmails] §6.6.C-User send failed", {
            to: r.email,
            err,
          });
        }
      }),
    );
  } catch (err) {
    console.error("[sendVideoPublishedEmails] §6.6.C-User broadcast failed", err);
  }

  // C-Ops single (M-07)
  try {
    const opsEmail = process.env.OPS_NOTIFICATION_EMAIL;
    if (!opsEmail) return;

    const { data: applicant } = await admin
      .from("users")
      .select("last_name, first_name")
      .eq("id", userId)
      .maybeSingle();
    const applicantName =
      `${applicant?.last_name ?? ""}${applicant?.first_name ?? ""}`.trim() ||
      "申込者";
    const companyName = await resolveApplicantCompanyName(admin, userId);

    const tpl = videoPublishedOpsEmail({
      applicantName,
      companyName,
      optionLabel,
      publishedAt: formatBillingDateTime(publishedAtIso),
      userId,
      siteUrl,
    });
    await sendEmail({ to: opsEmail, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error("[sendVideoPublishedEmails] §6.6.C-Ops send failed", err);
  }
}

/** その掲載場所で公開中（ready）の本数。掲載メールの「1 本目」判定に使う。 */
export async function countReadyVideos(
  admin: AdminClient,
  userId: string,
  placement: VideoPlacement,
): Promise<number> {
  const { count, error } = await admin
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("placement", placement)
    .eq("status", "ready");
  if (error) {
    // 件数不明のときは「1 本目ではない」側に倒す（メールの重複送信より欠落を許容）
    console.error("[countReadyVideos] count failed", error);
    return Number.POSITIVE_INFINITY;
  }
  return count ?? 0;
}

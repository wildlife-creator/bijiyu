import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { OPTION_LABELS, type VideoOptionType } from "@/lib/billing/options";
import { PLAN_LABELS, type PlanType } from "@/lib/constants/plans";
import { resolveApplicantCompanyName } from "@/lib/email/recipients/applicant-company-name";
import {
  fetchBillingRecipient,
  formatBillingDate,
  formatBillingDateTime,
} from "@/lib/email/recipients/billing-recipient";
import {
  getJobClientRecipients,
  getUserOrganizationRecipients,
} from "@/lib/email/recipients/organization-members";
import type { sendEmail } from "@/lib/email/send-email";
import { optionSubscriptionActivatedEmail } from "@/lib/email/templates/option-subscription-activated";
import { planActivatedEmail } from "@/lib/email/templates/plan-activated";
import { urgentOptionActivatedEmail } from "@/lib/email/templates/urgent-option-activated";
import { videoOptionActivatedEmail } from "@/lib/email/templates/video-option-activated";
import { videoOptionAppliedOpsEmail } from "@/lib/email/templates/video-option-applied-ops";
import type { Database } from "@/types/database";

/**
 * 契約 / オプション有効化時のメール送信ヘルパー。
 *
 * Stripe Webhook（`handle-checkout-completed.ts`）と、銀行振込の入金確認後に
 * 管理画面から有効化する Server Action（P2）の両方から呼ぶため、Webhook ファイル
 * から切り出して共通化した。送信内容は支払方法に依存しない（同じ「承りました」）。
 *
 * すべて失敗はサイレント（DB 整合は呼出側で完了済み。メール失敗で業務処理を巻き戻さない）。
 */

/** §6.7 基本プラン契約完了（Owner 1 名のみ）。 */
export async function sendPlanActivatedEmail(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  planType: PlanType,
  activatedAtIso: string = new Date().toISOString(),
): Promise<void> {
  try {
    const recipient = await fetchBillingRecipient(admin, userId);
    if (!recipient) return;
    const tpl = planActivatedEmail({
      recipientName: recipient.name,
      planName: PLAN_LABELS[planType],
      activatedAt: formatBillingDate(activatedAtIso),
    });
    await send({ to: recipient.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error("[activation-emails] sendPlanActivatedEmail failed", err);
  }
}

/** §6.5.A 補償オプション申し込み完了（申込者本人 1 通）。 */
export async function sendCompensationActivatedEmail(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  optionType: "compensation_5000" | "compensation_9800",
  activatedAtIso: string,
): Promise<void> {
  try {
    const recipient = await fetchBillingRecipient(admin, userId);
    if (!recipient) return;
    const tpl = optionSubscriptionActivatedEmail({
      recipientName: recipient.name,
      optionLabel: OPTION_LABELS[optionType],
      activatedAt: formatBillingDate(activatedAtIso),
    });
    await send({ to: recipient.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error(
      "[activation-emails] sendCompensationActivatedEmail failed",
      err,
    );
  }
}

/** §6.6.A 急募オプション申し込み完了（M-03 broadcast、jobs 起点で配信先解決）。 */
export async function sendUrgentActivatedEmails(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  jobId: string,
  endDate: Date,
): Promise<void> {
  try {
    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .select("title, owner_id, organization_id")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr || !job) return;

    const recipients = await getJobClientRecipients(admin, {
      owner_id: job.owner_id as string,
      organization_id: (job.organization_id as string | null) ?? null,
    });
    if (recipients.length === 0) return;

    const tpl = (recipientName: string) =>
      urgentOptionActivatedEmail({
        recipientName,
        jobTitle: (job.title as string) ?? "",
        endDate: formatBillingDate(endDate.toISOString()),
      });

    await Promise.all(
      recipients.map(async (r) => {
        const built = tpl(r.displayName);
        try {
          await send({ to: r.email, subject: built.subject, html: built.html });
        } catch (err) {
          console.error("[activation-emails] §6.6.A send failed", {
            to: r.email,
            err,
          });
        }
      }),
    );
  } catch (err) {
    console.error("[activation-emails] sendUrgentActivatedEmails failed", err);
  }
}

/**
 * §6.6.B-User + §6.6.B-Ops 並列送信ヘルパー（動画 / 職場紹介動画共通）。
 *
 * - B-User: 申込者本人 + 法人プランなら組織メンバー全員（M-03 broadcast）
 * - B-Ops: `process.env.OPS_NOTIFICATION_EMAIL` 単一宛先（M-07）。運営はこの通知を
 *   受けて動画制作・撮影手配を開始する（銀行振込の有効化時も同じ）
 */
export async function sendVideoActivatedEmails(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  optionType: VideoOptionType,
  activatedAtIso: string,
): Promise<void> {
  const optionLabel = OPTION_LABELS[optionType];

  // B-User broadcast
  try {
    const recipients = await getUserOrganizationRecipients(admin, userId);
    await Promise.all(
      recipients.map(async (r) => {
        const built = videoOptionActivatedEmail({
          recipientName: r.displayName,
          optionLabel,
          activatedAt: formatBillingDate(activatedAtIso),
        });
        try {
          await send({ to: r.email, subject: built.subject, html: built.html });
        } catch (err) {
          console.error("[activation-emails] §6.6.B-User send failed", {
            to: r.email,
            err,
          });
        }
      }),
    );
  } catch (err) {
    console.error("[activation-emails] §6.6.B-User broadcast failed", err);
  }

  // B-Ops single
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
    const siteUrl = await resolveSiteUrl();

    const tpl = videoOptionAppliedOpsEmail({
      applicantName,
      companyName,
      appliedAt: formatBillingDateTime(activatedAtIso),
      optionLabel,
      userId,
      siteUrl,
    });
    await send({ to: opsEmail, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error("[activation-emails] §6.6.B-Ops send failed", err);
  }
}

/**
 * 運営向けメールの deep link 用 site URL。ユーザーが今アクセスしている host に揃える
 * （CLAUDE.md「emailRedirectTo を組む時は host header を使う」と同方針）。
 */
export async function resolveSiteUrl(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  return host
    ? `${proto}://${host}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000");
}

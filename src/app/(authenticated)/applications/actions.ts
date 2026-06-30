"use server";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  contractorReportSchema,
  clientReportSchema,
  acceptApplicationSchema,
  rejectApplicationSchema,
  mapOperatingStatusToApplicationStatus,
} from "@/lib/validations/matching";
import { sendEmail } from "@/lib/email/send-email";
import { matchingAcceptedEmail } from "@/lib/email/templates/matching-accepted";
import { matchingRejectedEmail } from "@/lib/email/templates/matching-rejected";
import { applicationCancelledControlEmail } from "@/lib/email/templates/application-cancelled-control";
import { applicationCancelledEmail } from "@/lib/email/templates/application-cancelled";
import { orderAcceptedControlEmail } from "@/lib/email/templates/order-accepted-control";
import { orderRejectedControlEmail } from "@/lib/email/templates/order-rejected-control";
import { completionReportToClientEmail } from "@/lib/email/templates/completion-report-to-client";
import { completionReportToContractorEmail } from "@/lib/email/templates/completion-report-to-contractor";
import { getJobClientRecipients } from "@/lib/email/recipients/organization-members";
import {
  getUserDisplayName,
  resolveClientProfileForRow,
  resolveParticipantName,
} from "@/lib/utils/display-name";
import { formatDateTime } from "@/lib/utils/format-date";
import type { ActionResult } from "@/lib/types/action-result";

const SERVICE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";

// ---------------------------------------------------------------------------
// Helper: fetch application with job and applicant info
// ---------------------------------------------------------------------------
async function getApplicationWithDetails(
  supabase: Awaited<ReturnType<typeof createClient>>,
  applicationId: string,
) {
  return supabase
    .from("applications")
    .select(
      `*, jobs(
        id, title, owner_id, organization_id, trade_types, work_end_date,
        owner:users!owner_id(
          last_name, first_name, deleted_at,
          client_profiles(display_name, image_url)
        ),
        organization:organizations(
          owner_user:users!owner_id(
            last_name, first_name, deleted_at,
            client_profiles(display_name, image_url)
          )
        )
      ),
      applicant:users!applications_applicant_id_fkey(
        id, email, last_name, first_name, company_name, deleted_at
      )`,
    )
    .eq("id", applicationId)
    .single();
}

// ---------------------------------------------------------------------------
// 3.1 cancelApplicationAction — 受注者がapplied状態の応募をキャンセル
// ---------------------------------------------------------------------------
export async function cancelApplicationAction(
  applicationId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "認証が必要です" };
    }

    // Fetch application with full join (needed for the cancellation emails)
    const { data: application, error: fetchError } =
      await getApplicationWithDetails(supabase, applicationId);

    if (fetchError || !application) {
      return { success: false, error: "応募が見つかりません" };
    }

    // Ownership check
    if (application.applicant_id !== user.id) {
      return { success: false, error: "この応募をキャンセルする権限がありません" };
    }

    // Status check: cancel is only available for accepted applications
    if (application.status !== "accepted") {
      return { success: false, error: "発注済みの応募のみキャンセルできます" };
    }

    // 5-day restriction check based on first_work_date (set by client)
    if (application.first_work_date) {
      const deadline = new Date(application.first_work_date);
      deadline.setDate(deadline.getDate() - 5);
      if (new Date() >= deadline) {
        return {
          success: false,
          error:
            "初回稼働日の5日前を過ぎたため、システムからはキャンセルできません。",
        };
      }
    }

    // Update status via admin client (RLS cancel policy only allows applied→cancelled,
    // but we now cancel accepted applications, so use admin client)
    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("applications")
      .update({ status: "cancelled", cancelled_by: "contractor" })
      .eq("id", applicationId);

    if (updateError) {
      return { success: false, error: "キャンセルに失敗しました" };
    }

    // §1.2.A 発注者組織宛 broadcast + §1.2.B 受注者本人控え (fire-and-forget)
    await sendCancellationEmails({ admin, application }).catch((err) => {
      console.error("[cancelApplicationAction] Email failed:", err);
    });

    return { success: true };
  } catch {
    return { success: false, error: "予期しないエラーが発生しました" };
  }
}

// ---------------------------------------------------------------------------
// sendCancellationEmails — §1.2.A 発注者組織宛 broadcast + §1.2.B 受注者本人控え
// ---------------------------------------------------------------------------

interface SendCancellationEmailsParams {
  admin: ReturnType<typeof createAdminClient>;
  application: ApplicationWithDetails;
}

async function sendCancellationEmails(
  params: SendCancellationEmailsParams,
): Promise<void> {
  const { admin, application } = params;
  const job = application.jobs;
  const applicant = application.applicant;
  if (!job) return;

  const contractorName = applicant
    ? getUserDisplayName(
        {
          lastName: applicant.last_name,
          firstName: applicant.first_name,
          companyName:
            (applicant as { company_name?: string | null }).company_name,
          deletedAt: applicant.deleted_at,
        },
        "prefer-company",
      )
    : "応募者";

  const tradeTypesValue =
    (job as { trade_types?: string[] | null }).trade_types ?? null;
  const tradeType =
    tradeTypesValue && tradeTypesValue.length > 0
      ? tradeTypesValue.join("、")
      : undefined;
  const headcountValue = (application as { headcount?: number | null })
    .headcount;
  const firstWorkDateValue = (application as { first_work_date?: string | null })
    .first_work_date;
  const firstWorkDate = firstWorkDateValue
    ? firstWorkDateValue.replace(/-/g, "/")
    : undefined;
  const cancelledAt = formatDateTime(new Date().toISOString());

  const tasks: Array<Promise<unknown>> = [];

  // §1.2.A 発注者組織宛 broadcast
  const recipients = await getJobClientRecipients(admin, {
    owner_id: job.owner_id,
    organization_id: job.organization_id ?? null,
  });
  for (const r of recipients) {
    const { subject, html } = applicationCancelledControlEmail({
      recipientName: r.displayName,
      jobTitle: job.title,
      contractorName,
      tradeType,
      headcount: headcountValue ?? null,
      firstWorkDate,
      cancelledAt,
    });
    tasks.push(
      sendEmail({ to: r.email, subject, html }).catch((err) => {
        console.error(
          "[cancelApplicationAction] cancelled-control send failed:",
          err,
        );
      }),
    );
  }

  // §1.2.B 受注者本人控え
  if (applicant?.email && !applicant.deleted_at) {
    const resolution = resolveClientProfileForRow(job);
    const clientName = resolveParticipantName({
      displayName: resolution.displayName,
      lastName: resolution.lastName,
      firstName: resolution.firstName,
      deletedAt: resolution.deletedAt,
    });
    const { subject, html } = applicationCancelledEmail({
      applicantName: contractorName,
      jobTitle: job.title,
      clientName,
      tradeType,
      headcount: headcountValue ?? null,
      firstWorkDate,
      cancelledAt,
    });
    tasks.push(
      sendEmail({ to: applicant.email, subject, html }).catch((err) => {
        console.error(
          "[cancelApplicationAction] cancelled (applicant) send failed:",
          err,
        );
      }),
    );
  }

  await Promise.all(tasks);
}

type ApplicationWithDetails = NonNullable<
  Awaited<ReturnType<typeof getApplicationWithDetails>>["data"]
>;

// ---------------------------------------------------------------------------
// 3.2 submitContractorReportAction — 受注者の完了報告 + 発注者評価
// ---------------------------------------------------------------------------
export async function submitContractorReportAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "認証が必要です" };
    }

    // Parse and validate
    const raw = {
      applicationId: formData.get("applicationId") as string,
      operatingStatus: formData.get("operatingStatus") as string,
      statusSupplement: (formData.get("statusSupplement") as string) || undefined,
      ratingAgain: formData.get("ratingAgain") as string,
      comment: (formData.get("comment") as string) || undefined,
    };

    const parsed = contractorReportSchema.safeParse(raw);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "入力内容に誤りがあります";
      return { success: false, error: firstError };
    }

    const input = parsed.data;

    // Fetch application and verify ownership + status
    const { data: application, error: fetchError } =
      await getApplicationWithDetails(supabase, input.applicationId);

    if (fetchError || !application) {
      return { success: false, error: "応募が見つかりません" };
    }

    if (application.applicant_id !== user.id) {
      return { success: false, error: "この応募に対する権限がありません" };
    }

    if (application.status !== "accepted") {
      return { success: false, error: "発注済みの応募のみ完了報告できます" };
    }

    const admin = createAdminClient();

    // Insert client review (contractor's evaluation of the client)
    const jobOwner = application.jobs;
    const { error: reviewError } = await admin
      .from("client_reviews")
      .insert({
        application_id: input.applicationId,
        reviewer_id: user.id,
        reviewee_id: jobOwner?.owner_id ?? "",
        // 会社単位集計の鍵（案C）。法人案件は jobs.organization_id、個人発注者案件は NULL。
        // reviewee_id（案件作成者）は従来どおり保持し、作成者別の内訳を残す。
        organization_id: jobOwner?.organization_id ?? null,
        operating_status: input.operatingStatus,
        status_supplement: input.statusSupplement ?? null,
        rating_again: input.ratingAgain,
        comment: input.comment ?? null,
      });

    if (reviewError) {
      if (reviewError.code === "23505") {
        return { success: false, error: "既に評価を登録済みです" };
      }
      return { success: false, error: "評価の登録に失敗しました" };
    }

    // Check if the other side (client) has already submitted their review.
    // If both reviews exist, transition status to completed/lost.
    const { data: existingUserReview } = await admin
      .from("user_reviews")
      .select("operating_status")
      .eq("application_id", input.applicationId)
      .maybeSingle();

    if (existingUserReview?.operating_status) {
      // Both reviews are now in — map the client's operating_status to final status.
      // operating_status stores the Japanese 6-choice label, so it MUST go through
      // mapOperatingStatusToApplicationStatus. A raw cast writes the Japanese string
      // into the application_status enum → invalid enum value → UPDATE fails silently
      // and the application stays "accepted" forever (mirrors the client-side path).
      const finalStatus = mapOperatingStatusToApplicationStatus(
        existingUserReview.operating_status,
      );
      const { error: updateError } = await admin
        .from("applications")
        .update({ status: finalStatus })
        .eq("id", input.applicationId);
      if (updateError) {
        return { success: false, error: "ステータスの更新に失敗しました" };
      }
    } else {
      // §3.1.A 受注者が先に提出 → 発注者組織宛 broadcast (fire-and-forget)
      await sendCompletionReportToClient({ admin, application }).catch((err) => {
        console.error(
          "[submitContractorReportAction] completion-report-to-client failed:",
          err,
        );
      });
    }

    return { success: true };
  } catch {
    return { success: false, error: "予期しないエラーが発生しました" };
  }
}

// ---------------------------------------------------------------------------
// sendCompletionReportToClient — §3.1.A
// ---------------------------------------------------------------------------

async function sendCompletionReportToClient(params: {
  admin: ReturnType<typeof createAdminClient>;
  application: ApplicationWithDetails;
}): Promise<void> {
  const { admin, application } = params;
  const job = application.jobs;
  const applicant = application.applicant;
  if (!job) return;

  const contractorName = applicant
    ? getUserDisplayName(
        {
          lastName: applicant.last_name,
          firstName: applicant.first_name,
          companyName:
            (applicant as { company_name?: string | null }).company_name,
          deletedAt: applicant.deleted_at,
        },
        "prefer-company",
      )
    : "受注者";

  const tradeTypesValue =
    (job as { trade_types?: string[] | null }).trade_types ?? null;
  const tradeType =
    tradeTypesValue && tradeTypesValue.length > 0
      ? tradeTypesValue.join("、")
      : undefined;
  const workEndDateValue = (job as { work_end_date?: string | null })
    .work_end_date;
  const workEndDate = workEndDateValue
    ? workEndDateValue.replace(/-/g, "/")
    : undefined;
  const reportedAt = formatDateTime(new Date().toISOString());

  const recipients = await getJobClientRecipients(admin, {
    owner_id: job.owner_id,
    organization_id: job.organization_id ?? null,
  });
  await Promise.all(
    recipients.map((r) => {
      const { subject, html } = completionReportToClientEmail({
        recipientName: r.displayName,
        contractorName,
        jobTitle: job.title,
        tradeType,
        workEndDate,
        reportedAt,
      });
      return sendEmail({ to: r.email, subject, html }).catch((err) => {
        console.error(
          "[submitContractorReportAction] completion-report-to-client send failed:",
          err,
        );
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// 4.1 acceptApplicationAction — 発注者が応募を承認
// ---------------------------------------------------------------------------
export async function acceptApplicationAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "認証が必要です" };
    }

    // Parse and validate
    const raw = {
      applicationId: formData.get("applicationId") as string,
      workLocation: formData.get("workLocation") as string,
      clientNotes: (formData.get("clientNotes") as string) || undefined,
      firstWorkDate: formData.get("firstWorkDate") as string,
    };

    const parsed = acceptApplicationSchema.safeParse(raw);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "入力内容に誤りがあります";
      return { success: false, error: firstError };
    }

    const input = parsed.data;

    // Fetch application with details
    const { data: application, error: fetchError } =
      await getApplicationWithDetails(supabase, input.applicationId);

    if (fetchError || !application) {
      return { success: false, error: "応募が見つかりません" };
    }

    // Verify ownership: job owner or same org member
    const job = application.jobs;
    if (!job) {
      return { success: false, error: "案件情報が見つかりません" };
    }

    if (job.owner_id !== user.id) {
      // Check org membership
      if (job.organization_id) {
        const { active } = await getActiveOrganizationContext(supabase);
        if (active?.organizationId !== job.organization_id) {
          return { success: false, error: "この応募に対する権限がありません" };
        }
      } else {
        return { success: false, error: "この応募に対する権限がありません" };
      }
    }

    // Status check
    if (application.status !== "applied") {
      return { success: false, error: "応募中の案件のみ発注できます" };
    }

    // Upload documents to Supabase Storage
    const documentFiles = formData.getAll("documents") as File[];
    const documentUrls: string[] = [];

    for (const file of documentFiles) {
      if (file.size === 0) continue;
      const filePath = `${user.id}/${input.applicationId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("application-documents")
        .upload(filePath, file);

      if (uploadError) {
        return { success: false, error: "書類のアップロードに失敗しました" };
      }

      documentUrls.push(filePath);
    }

    // Update via RLS-protected client
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        status: "accepted",
        first_work_date: input.firstWorkDate,
        work_location: input.workLocation,
        client_notes: input.clientNotes ?? null,
        document_urls: documentUrls.length > 0 ? documentUrls : null,
      })
      .eq("id", input.applicationId);

    if (updateError) {
      return { success: false, error: "発注処理に失敗しました" };
    }

    // Send email notification (failure does NOT rollback)
    const applicant = application.applicant;
    if (applicant && applicant.email && !applicant.deleted_at) {
      const applicantName = getUserDisplayName(
        {
          lastName: applicant.last_name,
          firstName: applicant.first_name,
          companyName: (applicant as { company_name?: string | null }).company_name,
          deletedAt: applicant.deleted_at,
        },
        "prefer-company",
      );
      const resolution = resolveClientProfileForRow(job);
      const clientName = resolveParticipantName({
        displayName: resolution.displayName,
        lastName: resolution.lastName,
        firstName: resolution.firstName,
        deletedAt: resolution.deletedAt,
      });
      const tradeTypesValue = (job as { trade_types?: string[] | null }).trade_types ?? null;
      const workEndDateValue = (job as { work_end_date?: string | null }).work_end_date ?? null;
      const { subject, html } = matchingAcceptedEmail({
        applicantName,
        jobTitle: job.title,
        clientName,
        tradeType: tradeTypesValue && tradeTypesValue.length > 0
          ? tradeTypesValue.join("、")
          : undefined,
        firstWorkDate: input.firstWorkDate,
        workEndDate: workEndDateValue ?? undefined,
      });

      await sendEmail({ to: applicant.email, subject, html }).catch((err) => {
        console.error("[acceptApplicationAction] Failed to send email:", err);
      });
    }

    // §1.6.C 発注確定控え (発注者組織宛 broadcast、fire-and-forget)
    const admin = createAdminClient();
    await sendOrderAcceptedControl({
      admin,
      application,
      firstWorkDate: input.firstWorkDate,
    }).catch((err) => {
      console.error("[acceptApplicationAction] order-accepted-control failed:", err);
    });

    return { success: true };
  } catch {
    return { success: false, error: "予期しないエラーが発生しました" };
  }
}

// ---------------------------------------------------------------------------
// sendOrderAcceptedControl — §1.6.C
// ---------------------------------------------------------------------------

async function sendOrderAcceptedControl(params: {
  admin: ReturnType<typeof createAdminClient>;
  application: ApplicationWithDetails;
  firstWorkDate: string;
}): Promise<void> {
  const { admin, application, firstWorkDate } = params;
  const job = application.jobs;
  const applicant = application.applicant;
  if (!job) return;

  const contractorName = applicant
    ? getUserDisplayName(
        {
          lastName: applicant.last_name,
          firstName: applicant.first_name,
          companyName:
            (applicant as { company_name?: string | null }).company_name,
          deletedAt: applicant.deleted_at,
        },
        "prefer-company",
      )
    : "受注者";

  const tradeTypesValue =
    (job as { trade_types?: string[] | null }).trade_types ?? null;
  const tradeType =
    tradeTypesValue && tradeTypesValue.length > 0
      ? tradeTypesValue.join("、")
      : undefined;
  const headcountValue = (application as { headcount?: number | null })
    .headcount;
  const workEndDateValue = (job as { work_end_date?: string | null })
    .work_end_date;
  const workEndDate = workEndDateValue
    ? workEndDateValue.replace(/-/g, "/")
    : undefined;
  const decidedAt = formatDateTime(new Date().toISOString());

  const recipients = await getJobClientRecipients(admin, {
    owner_id: job.owner_id,
    organization_id: job.organization_id ?? null,
  });
  await Promise.all(
    recipients.map((r) => {
      const { subject, html } = orderAcceptedControlEmail({
        recipientName: r.displayName,
        jobTitle: job.title,
        contractorName,
        tradeType,
        headcount: headcountValue ?? null,
        firstWorkDate: firstWorkDate.replace(/-/g, "/"),
        workEndDate,
        decidedAt,
      });
      return sendEmail({ to: r.email, subject, html }).catch((err) => {
        console.error(
          "[acceptApplicationAction] order-accepted-control send failed:",
          err,
        );
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// 4.2 rejectApplicationAction — 発注者が応募をお断り
// ---------------------------------------------------------------------------
export async function rejectApplicationAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "認証が必要です" };
    }

    const raw = {
      applicationId: formData.get("applicationId") as string,
      rejectionReason: (formData.get("rejectionReason") as string) || undefined,
    };

    const parsed = rejectApplicationSchema.safeParse(raw);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "入力内容に誤りがあります";
      return { success: false, error: firstError };
    }

    const input = parsed.data;

    // Fetch application with details
    const { data: application, error: fetchError } =
      await getApplicationWithDetails(supabase, input.applicationId);

    if (fetchError || !application) {
      return { success: false, error: "応募が見つかりません" };
    }

    const job = application.jobs;
    if (!job) {
      return { success: false, error: "案件情報が見つかりません" };
    }

    // Verify ownership
    if (job.owner_id !== user.id) {
      if (job.organization_id) {
        const { active } = await getActiveOrganizationContext(supabase);
        if (active?.organizationId !== job.organization_id) {
          return { success: false, error: "この応募に対する権限がありません" };
        }
      } else {
        return { success: false, error: "この応募に対する権限がありません" };
      }
    }

    if (application.status !== "applied") {
      return { success: false, error: "応募中の案件のみお断りできます" };
    }

    // Update via RLS-protected client
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        status: "rejected",
        rejection_reason: input.rejectionReason ?? null,
      })
      .eq("id", input.applicationId);

    if (updateError) {
      return { success: false, error: "お断り処理に失敗しました" };
    }

    // Send email notification
    const applicant = application.applicant;
    if (applicant && applicant.email && !applicant.deleted_at) {
      const applicantName = getUserDisplayName(
        {
          lastName: applicant.last_name,
          firstName: applicant.first_name,
          companyName: (applicant as { company_name?: string | null }).company_name,
          deletedAt: applicant.deleted_at,
        },
        "prefer-company",
      );
      const resolution = resolveClientProfileForRow(job);
      const clientName = resolveParticipantName({
        displayName: resolution.displayName,
        lastName: resolution.lastName,
        firstName: resolution.firstName,
        deletedAt: resolution.deletedAt,
      });
      const { subject, html } = matchingRejectedEmail({
        applicantName,
        jobTitle: job.title,
        clientName,
      });

      await sendEmail({ to: applicant.email, subject, html }).catch((err) => {
        console.error("[rejectApplicationAction] Failed to send email:", err);
      });
    }

    // §1.6.D 発注見送り控え (発注者組織宛 broadcast、fire-and-forget)
    const admin = createAdminClient();
    await sendOrderRejectedControl({ admin, application }).catch((err) => {
      console.error("[rejectApplicationAction] order-rejected-control failed:", err);
    });

    return { success: true };
  } catch {
    return { success: false, error: "予期しないエラーが発生しました" };
  }
}

// ---------------------------------------------------------------------------
// sendOrderRejectedControl — §1.6.D
// ---------------------------------------------------------------------------

async function sendOrderRejectedControl(params: {
  admin: ReturnType<typeof createAdminClient>;
  application: ApplicationWithDetails;
}): Promise<void> {
  const { admin, application } = params;
  const job = application.jobs;
  const applicant = application.applicant;
  if (!job) return;

  const contractorName = applicant
    ? getUserDisplayName(
        {
          lastName: applicant.last_name,
          firstName: applicant.first_name,
          companyName:
            (applicant as { company_name?: string | null }).company_name,
          deletedAt: applicant.deleted_at,
        },
        "prefer-company",
      )
    : "受注者";

  const tradeTypesValue =
    (job as { trade_types?: string[] | null }).trade_types ?? null;
  const tradeType =
    tradeTypesValue && tradeTypesValue.length > 0
      ? tradeTypesValue.join("、")
      : undefined;
  const decidedAt = formatDateTime(new Date().toISOString());

  const recipients = await getJobClientRecipients(admin, {
    owner_id: job.owner_id,
    organization_id: job.organization_id ?? null,
  });
  await Promise.all(
    recipients.map((r) => {
      const { subject, html } = orderRejectedControlEmail({
        recipientName: r.displayName,
        jobTitle: job.title,
        contractorName,
        tradeType,
        decidedAt,
      });
      return sendEmail({ to: r.email, subject, html }).catch((err) => {
        console.error(
          "[rejectApplicationAction] order-rejected-control send failed:",
          err,
        );
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// 4.3 submitClientReportAction — 発注者の完了報告 + 受注者評価
// ---------------------------------------------------------------------------
export async function submitClientReportAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "認証が必要です" };
    }

    // Parse and validate
    const raw = {
      applicationId: formData.get("applicationId") as string,
      operatingStatus: formData.get("operatingStatus") as string,
      statusSupplement: (formData.get("statusSupplement") as string) || undefined,
      ratingOverall: formData.get("ratingOverall") as string,
      ratingPunctual: formData.get("ratingPunctual") as string,
      ratingFollowsInstructions: formData.get("ratingFollowsInstructions") as string,
      ratingSpeed: formData.get("ratingSpeed") as string,
      ratingQuality: formData.get("ratingQuality") as string,
      ratingHasTools: formData.get("ratingHasTools") as string,
      ratingHasSpecialEquipment: formData.get("ratingHasSpecialEquipment") as string,
      comment: (formData.get("comment") as string) || undefined,
    };

    const parsed = clientReportSchema.safeParse(raw);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "入力内容に誤りがあります";
      return { success: false, error: firstError };
    }

    const input = parsed.data;

    // Fetch application and verify ownership
    const { data: application, error: fetchError } =
      await getApplicationWithDetails(supabase, input.applicationId);

    if (fetchError || !application) {
      return { success: false, error: "応募が見つかりません" };
    }

    const job = application.jobs;
    if (!job) {
      return { success: false, error: "案件情報が見つかりません" };
    }

    // Verify job owner or org member
    if (job.owner_id !== user.id) {
      if (job.organization_id) {
        const { active } = await getActiveOrganizationContext(supabase);
        if (active?.organizationId !== job.organization_id) {
          return { success: false, error: "この応募に対する権限がありません" };
        }
      } else {
        return { success: false, error: "この応募に対する権限がありません" };
      }
    }

    if (application.status !== "accepted") {
      return { success: false, error: "発注済みの応募のみ完了報告できます" };
    }

    const admin = createAdminClient();

    // Insert user review (client's evaluation of the contractor)
    const { error: reviewError } = await admin
      .from("user_reviews")
      .insert({
        application_id: input.applicationId,
        reviewer_id: user.id,
        reviewee_id: application.applicant_id,
        operating_status: input.operatingStatus,
        status_supplement: input.statusSupplement ?? null,
        rating_overall: input.ratingOverall,
        rating_punctual: input.ratingPunctual,
        rating_follows_instructions: input.ratingFollowsInstructions,
        rating_speed: input.ratingSpeed,
        rating_quality: input.ratingQuality,
        rating_has_tools: input.ratingHasTools,
        rating_has_special_equipment: input.ratingHasSpecialEquipment,
        comment: input.comment ?? null,
      });

    if (reviewError) {
      if (reviewError.code === "23505") {
        return { success: false, error: "既に評価を登録済みです" };
      }
      return { success: false, error: "評価の登録に失敗しました" };
    }

    // Check if the other side (contractor) has already submitted their review.
    // If both reviews exist, transition status to completed/lost.
    const { data: existingClientReview } = await admin
      .from("client_reviews")
      .select("operating_status")
      .eq("application_id", input.applicationId)
      .maybeSingle();

    if (existingClientReview) {
      // Both reviews are now in — map the client's operating_status to final status
      const finalStatus = mapOperatingStatusToApplicationStatus(input.operatingStatus);
      const { error: updateError } = await admin
        .from("applications")
        .update({ status: finalStatus })
        .eq("id", input.applicationId);

      if (updateError) {
        return { success: false, error: "ステータスの更新に失敗しました" };
      }
    } else {
      // §3.1.B 発注者が先に提出 → 受注者本人 1 通 (fire-and-forget)
      await sendCompletionReportToContractor({ application }).catch((err) => {
        console.error(
          "[submitClientReportAction] completion-report-to-contractor failed:",
          err,
        );
      });
    }

    return { success: true };
  } catch {
    return { success: false, error: "予期しないエラーが発生しました" };
  }
}

// ---------------------------------------------------------------------------
// sendCompletionReportToContractor — §3.1.B
// ---------------------------------------------------------------------------

async function sendCompletionReportToContractor(params: {
  application: ApplicationWithDetails;
}): Promise<void> {
  const { application } = params;
  const job = application.jobs;
  const applicant = application.applicant;
  if (!job) return;
  if (!applicant?.email || applicant.deleted_at) return;

  const applicantName = getUserDisplayName(
    {
      lastName: applicant.last_name,
      firstName: applicant.first_name,
      companyName: (applicant as { company_name?: string | null }).company_name,
      deletedAt: applicant.deleted_at,
    },
    "prefer-company",
  );
  const resolution = resolveClientProfileForRow(job);
  const clientName = resolveParticipantName({
    displayName: resolution.displayName,
    lastName: resolution.lastName,
    firstName: resolution.firstName,
    deletedAt: resolution.deletedAt,
  });

  const tradeTypesValue =
    (job as { trade_types?: string[] | null }).trade_types ?? null;
  const tradeType =
    tradeTypesValue && tradeTypesValue.length > 0
      ? tradeTypesValue.join("、")
      : undefined;
  const workEndDateValue = (job as { work_end_date?: string | null })
    .work_end_date;
  const workEndDate = workEndDateValue
    ? workEndDateValue.replace(/-/g, "/")
    : undefined;
  const reportedAt = formatDateTime(new Date().toISOString());

  const { subject, html } = completionReportToContractorEmail({
    applicantName,
    clientName,
    jobTitle: job.title,
    tradeType,
    workEndDate,
    reportedAt,
  });
  await sendEmail({ to: applicant.email, subject, html }).catch((err) => {
    console.error(
      "[submitClientReportAction] completion-report-to-contractor send failed:",
      err,
    );
  });
}

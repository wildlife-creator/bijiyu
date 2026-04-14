"use server";

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
import { resolveParticipantName } from "@/lib/utils/display-name";
import { getActiveCorporateOrgNames } from "@/lib/utils/resolve-org-names";
import type { ActionResult } from "@/lib/types/action-result";

const SERVICE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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
      "*, jobs(id, title, owner_id, organization_id, organizations(name), owner:users!jobs_owner_id_fkey(last_name, first_name, company_name)), applicant:users!applications_applicant_id_fkey(id, email, last_name, first_name, company_name, deleted_at)",
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

    // Fetch application
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("id, applicant_id, status, first_work_date")
      .eq("id", applicationId)
      .single();

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
      .update({ status: "cancelled" })
      .eq("id", applicationId);

    if (updateError) {
      return { success: false, error: "キャンセルに失敗しました" };
    }

    return { success: true };
  } catch {
    return { success: false, error: "予期しないエラーが発生しました" };
  }
}

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

    if (existingUserReview) {
      // Both reviews are now in — use the client's operating_status for final status
      const finalStatus = existingUserReview.operating_status as "completed" | "lost";
      await admin
        .from("applications")
        .update({ status: finalStatus })
        .eq("id", input.applicationId);
    }

    return { success: true };
  } catch {
    return { success: false, error: "予期しないエラーが発生しました" };
  }
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
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("organization_id", job.organization_id)
          .single();

        if (!orgMember) {
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
      const applicantName = resolveParticipantName({
        companyName: (applicant as { company_name?: string | null }).company_name,
        lastName: applicant.last_name,
        firstName: applicant.first_name,
      });
      const owner = (job as { owner?: { last_name: string | null; first_name: string | null; company_name: string | null } | null }).owner;
      // 法人プラン active のオーナーのみ組織名を使う（ダウングレード後は company_name にフォールバック）
      const admin = createAdminClient();
      const ownerOrgNameMap = job.owner_id
        ? await getActiveCorporateOrgNames(admin, [job.owner_id as string])
        : new Map<string, string>();
      const clientName = resolveParticipantName({
        organizationName: job.owner_id
          ? (ownerOrgNameMap.get(job.owner_id as string) ?? null)
          : null,
        companyName: owner?.company_name,
        lastName: owner?.last_name,
        firstName: owner?.first_name,
      });
      const { subject, html } = matchingAcceptedEmail({
        applicantName,
        jobTitle: job.title,
        clientName,
        firstWorkDate: input.firstWorkDate,
        serviceUrl: SERVICE_URL,
      });

      await sendEmail({ to: applicant.email, subject, html }).catch((err) => {
        console.error("[acceptApplicationAction] Failed to send email:", err);
      });
    }

    return { success: true };
  } catch {
    return { success: false, error: "予期しないエラーが発生しました" };
  }
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
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("organization_id", job.organization_id)
          .single();

        if (!orgMember) {
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
      const applicantName = resolveParticipantName({
        companyName: (applicant as { company_name?: string | null }).company_name,
        lastName: applicant.last_name,
        firstName: applicant.first_name,
      });
      const owner = (job as { owner?: { last_name: string | null; first_name: string | null; company_name: string | null } | null }).owner;
      // 法人プラン active のオーナーのみ組織名を使う
      const admin = createAdminClient();
      const ownerOrgNameMap = job.owner_id
        ? await getActiveCorporateOrgNames(admin, [job.owner_id as string])
        : new Map<string, string>();
      const clientName = resolveParticipantName({
        organizationName: job.owner_id
          ? (ownerOrgNameMap.get(job.owner_id as string) ?? null)
          : null,
        companyName: owner?.company_name,
        lastName: owner?.last_name,
        firstName: owner?.first_name,
      });
      const { subject, html } = matchingRejectedEmail({
        applicantName,
        jobTitle: job.title,
        clientName,
        serviceUrl: SERVICE_URL,
      });

      await sendEmail({ to: applicant.email, subject, html }).catch((err) => {
        console.error("[rejectApplicationAction] Failed to send email:", err);
      });
    }

    return { success: true };
  } catch {
    return { success: false, error: "予期しないエラーが発生しました" };
  }
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
      ratingAgain: formData.get("ratingAgain") as string,
      ratingFollowsInstructions: formData.get("ratingFollowsInstructions") as string,
      ratingPunctual: formData.get("ratingPunctual") as string,
      ratingSpeed: formData.get("ratingSpeed") as string,
      ratingQuality: formData.get("ratingQuality") as string,
      ratingHasTools: formData.get("ratingHasTools") as string,
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
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("organization_id", job.organization_id)
          .single();

        if (!orgMember) {
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
        rating_again: input.ratingAgain,
        rating_follows_instructions: input.ratingFollowsInstructions,
        rating_punctual: input.ratingPunctual,
        rating_speed: input.ratingSpeed,
        rating_quality: input.ratingQuality,
        rating_has_tools: input.ratingHasTools,
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
    }

    return { success: true };
  } catch {
    return { success: false, error: "予期しないエラーが発生しました" };
  }
}

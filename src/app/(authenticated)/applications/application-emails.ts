/**
 * 応募まわりの Server Action（actions.ts）から送るメールをまとめたモジュール。
 * 応募取り下げ / キャンセル / 発注可否 / 完了報告 の通知を組み立てて送る。
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send-email";
import {
  applicationCancelledControlEmail,
} from "@/lib/email/templates/application-cancelled-control";
import {
  applicationWithdrawnControlEmail,
} from "@/lib/email/templates/application-withdrawn-control";
import { applicationWithdrawnEmail } from "@/lib/email/templates/application-withdrawn";
import { applicationCancelledEmail } from "@/lib/email/templates/application-cancelled";
import { orderAcceptedControlEmail } from "@/lib/email/templates/order-accepted-control";
import { orderRejectedControlEmail } from "@/lib/email/templates/order-rejected-control";
import {
  completionReportToClientEmail,
} from "@/lib/email/templates/completion-report-to-client";
import {
  completionReportToContractorEmail,
} from "@/lib/email/templates/completion-report-to-contractor";
import { getJobClientRecipients } from "@/lib/email/recipients/organization-members";
import {
  getUserDisplayName,
  resolveClientProfileForRow,
  resolveParticipantName,
} from "@/lib/utils/display-name";
import { formatDateTime } from "@/lib/utils/format-date";
import type { ApplicationWithDetails } from "./actions";

export interface SendCancellationEmailsParams {
  admin: ReturnType<typeof createAdminClient>;
  application: ApplicationWithDetails;
  /** cancelled = 発注後キャンセル（§1.2.A/B）/ withdrawn = 結果待ちの取り下げ（§1.2.C/D） */
  kind: "cancelled" | "withdrawn";
}

export async function sendCancellationEmails(
  params: SendCancellationEmailsParams,
): Promise<void> {
  const { admin, application, kind } = params;
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
    const { subject, html } =
      kind === "withdrawn"
        ? applicationWithdrawnControlEmail({
            recipientName: r.displayName,
            jobTitle: job.title,
            contractorName,
            tradeType,
            headcount: headcountValue ?? null,
            withdrawnAt: cancelledAt,
          })
        : applicationCancelledControlEmail({
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
    const { subject, html } =
      kind === "withdrawn"
        ? applicationWithdrawnEmail({
            applicantName: contractorName,
            jobTitle: job.title,
            clientName,
            tradeType,
            headcount: headcountValue ?? null,
            withdrawnAt: cancelledAt,
          })
        : applicationCancelledEmail({
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

export async function sendCompletionReportToClient(params: {
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

export async function sendOrderAcceptedControl(params: {
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

export async function sendOrderRejectedControl(params: {
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

export async function sendCompletionReportToContractor(params: {
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

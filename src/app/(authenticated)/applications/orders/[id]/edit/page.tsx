import { notFound } from "next/navigation";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { requireUser } from "@/lib/auth/require-user";
import { appendWithdrawnSuffix } from "@/lib/messaging/counterparty-display";
import { canEditOrderDetails } from "@/lib/order-details";
import { signApplicationDocuments } from "@/lib/storage/application-documents";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { hasReview } from "@/lib/utils/has-review";
import { OrderEditForm } from "./order-edit-form";

// 発注内容の変更通知は発注者組織のメンバー全員宛にメールを直列送信する
// （最大31通 ≒ 約20秒）ため、タイムアウトしないよう実行時間上限を延長する
export const maxDuration = 60;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderEditPage({ params }: Props) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  const { data: application } = await supabase
    .from("applications")
    .select(
      `id, status, first_work_date, work_location, client_notes, document_urls,
       applicant:users!applications_applicant_id_fkey(last_name, first_name, deleted_at),
       jobs!inner(id, title, owner_id, organization_id),
       user_reviews(id),
       client_reviews(id)`,
    )
    .eq("id", id)
    .single();

  if (!application) {
    notFound();
  }

  const job = application.jobs as {
    id: string;
    title: string;
    owner_id: string;
    organization_id: string | null;
  };

  // 認可: Owner または同一組織メンバー（CLI-011 詳細・CLI-009 発注可否と同一ロジック）
  if (job.owner_id !== user.id) {
    if (!job.organization_id) {
      notFound();
    }
    const { active } = await getActiveOrganizationContext(supabase);
    if (active?.organizationId !== job.organization_id) {
      notFound();
    }
  }

  // 編集できるのは発注確定かつ、どちらも完了報告を出していない間だけ
  if (
    !canEditOrderDetails(application, {
      hasUserReview: hasReview(application.user_reviews),
      hasClientReview: hasReview(application.client_reviews),
    })
  ) {
    notFound();
  }

  const applicant = application.applicant as {
    last_name: string | null;
    first_name: string | null;
    deleted_at: string | null;
  } | null;
  const contractorName = applicant
    ? appendWithdrawnSuffix(
        getUserDisplayName({
          lastName: applicant.last_name,
          firstName: applicant.first_name,
          deletedAt: null,
        }),
        applicant.deleted_at,
      )
    : "不明";

  const existingDocuments = await signApplicationDocuments(
    supabase,
    application.document_urls,
  );

  return (
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-center text-heading-lg font-bold text-secondary">
          発注内容の編集
        </h1>

        <div className="mt-4 rounded-[8px] border border-border bg-white p-3">
          <p className="text-body-md font-bold text-foreground">{job.title}</p>
          <p className="mt-1 text-body-xs text-muted-foreground">
            受注者: {contractorName}
          </p>
        </div>

        <OrderEditForm
          applicationId={application.id}
          defaultWorkLocation={application.work_location ?? ""}
          defaultClientNotes={application.client_notes ?? ""}
          defaultFirstWorkDate={application.first_work_date ?? ""}
          existingDocuments={existingDocuments}
        />
      </div>
    </div>
  );
}

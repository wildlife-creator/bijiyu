import Link from "next/link";
import { notFound } from "next/navigation";
import { ThumbsUp } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { AreaList } from "@/components/area/area-list";
import { CollapsibleList } from "@/components/master/collapsible-list";
import { VideoEmbed } from "@/components/video-embed/video-embed";
import { buildBackToValue, resolveBackTo } from "@/lib/admin/back-to";
import { derivePlanLabel } from "@/lib/admin/clients-list";
import { fetchClientReputation } from "@/lib/client-review/aggregate";
import { hasActiveOption } from "@/lib/billing/options";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils/format-date";
import { resolveParticipantName } from "@/lib/utils/display-name";
import type { AreaForDisplay } from "@/lib/utils/format-areas";
import { DeleteAccountButton } from "./delete-account-button";
import { JobSiteList } from "./job-site-list";
import { MemberList } from "./member-list";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ backTo?: string }>;
}

const ORG_ROLE_LABELS: Record<string, string> = {
  owner: "管理責任者",
  admin: "組織管理者",
  staff: "担当者",
};

const JOB_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  open: "掲載中",
  closed: "掲載終了",
};

const SNS_ITEMS = [
  { key: "sns_x", label: "X" },
  { key: "sns_instagram", label: "Instagram" },
  { key: "sns_tiktok", label: "TikTok" },
  { key: "sns_youtube", label: "YouTube" },
  { key: "sns_facebook", label: "Facebook" },
] as const;

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode | string | null | undefined;
}) {
  const isString = typeof value === "string";
  return (
    <div className="border-b border-border/20 last:border-b-0">
      <p className="bg-primary/[0.08] px-4 py-2 text-body-sm font-medium text-foreground">
        {label}
      </p>
      <div className="px-4 py-3 text-body-md text-foreground">
        {value == null || (isString && !value) ? "—" : value}
      </div>
    </div>
  );
}

/**
 * ADM-004: 発注者アカウント詳細（会社＝契約主体単位の1ページ）。
 * デザインカンプ: design-assets/screens/ADM-004.png
 * （ヘッダーは admin 共通レイアウト。カンプの LOGO／ハンバーガー／＜ は使わない）
 *
 * 集計スコープは org-scoping 準拠:
 * 法人 = organization_id 単位、個人・小規模 = owner_id 単位。
 */
export default async function AdminClientDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const backTo = resolveBackTo(sp.backTo);
  const currentPath = `/admin/clients/${id}`;
  const backToForChildren = buildBackToValue(currentPath, backTo);
  const admin = createAdminClient();

  // 契約主体（role='client'）のみ表示。退会済みも閲覧可能
  const { data: target } = await admin
    .from("users")
    .select("id, role, last_name, first_name, email, deleted_at, avatar_url")
    .eq("id", id)
    .maybeSingle();

  if (!target || target.role !== "client") notFound();
  const isDeleted = !!target.deleted_at;

  const [{ data: profile }, { data: subscription }, { data: org }] =
    await Promise.all([
      admin.from("client_profiles").select("*").eq("user_id", id).maybeSingle(),
      admin
        .from("subscriptions")
        .select("plan_type")
        .eq("user_id", id)
        .in("status", ["active", "past_due"])
        .maybeSingle(),
      admin
        .from("organizations")
        .select("id")
        .eq("owner_id", id)
        .maybeSingle(),
    ]);

  const orgId = org?.id ?? null;
  const displayName = resolveParticipantName({
    displayName: profile?.display_name ?? null,
    lastName: target.last_name,
    firstName: target.first_name,
    deletedAt: target.deleted_at,
  });
  const planLabel = derivePlanLabel(subscription?.plan_type ?? null);

  // 募集エリア
  const { data: areaRows } = await admin
    .from("client_recruit_areas")
    .select("prefecture, municipality")
    .eq("client_id", id);
  const recruitAreas: AreaForDisplay[] = (areaRows ?? []).map((a) => ({
    prefecture: a.prefecture,
    municipality: a.municipality,
  }));

  // オプション加入状況: 急募（active 複数案件分 → 最長 end_date ＋件数）／職場紹介動画
  const { data: urgentRows } = await admin
    .from("option_subscriptions")
    .select("end_date")
    .eq("user_id", id)
    .eq("option_type", "urgent")
    .eq("status", "active");
  const urgentCount = (urgentRows ?? []).length;
  const urgentMaxEnd =
    urgentCount > 0
      ? (urgentRows ?? [])
          .map((r) => r.end_date)
          .filter((d): d is string => !!d)
          .sort()
          .at(-1) ?? null
      : null;
  const hasWorkplaceVideoOption = await hasActiveOption(
    admin,
    id,
    "video_workplace",
  );

  // 評判（法人は会社単位）
  const reputation = await fetchClientReputation(
    admin,
    orgId
      ? { kind: "organization", organizationId: orgId }
      : { kind: "individual", clientUserId: id },
  );

  // 担当者一覧（法人のみ）
  let memberRows: Array<{
    userId: string;
    name: string;
    email: string;
    orgRoleLabel: string;
    isPending: boolean;
    isProxy: boolean;
  }> = [];
  if (orgId) {
    const { data: members } = await admin
      .from("organization_members")
      .select("user_id, org_role, is_proxy_account")
      .eq("organization_id", orgId);
    const memberIds = (members ?? []).map((m) => m.user_id);
    if (memberIds.length > 0) {
      const { data: memberUsers } = await admin
        .from("users")
        .select("id, last_name, first_name, email, password_set_at, deleted_at")
        .in("id", memberIds);
      const userById = new Map((memberUsers ?? []).map((u) => [u.id, u]));
      const rolePriority: Record<string, number> = { owner: 0, admin: 1, staff: 2 };
      memberRows = (members ?? [])
        .sort(
          (a, b) =>
            (rolePriority[a.org_role] ?? 9) - (rolePriority[b.org_role] ?? 9),
        )
        .map((m) => {
          const u = userById.get(m.user_id);
          return {
            userId: m.user_id,
            name:
              `${u?.last_name ?? ""}${u?.first_name ?? ""}`.trim() || "未設定",
            email: u?.email ?? "—",
            orgRoleLabel: ORG_ROLE_LABELS[m.org_role] ?? m.org_role,
            // Owner は通常サインアップのため招待中扱いしない（CLI-022 と同ルール）
            isPending:
              u?.password_set_at == null &&
              !u?.deleted_at &&
              m.org_role !== "owner",
            isProxy: m.is_proxy_account,
          };
        });
    }
  }

  // 募集現場一覧＋集計（全ステータス・会社スコープ）
  let jobsQuery = admin
    .from("jobs")
    .select("id, title, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  jobsQuery = orgId
    ? jobsQuery.eq("organization_id", orgId)
    : jobsQuery.eq("owner_id", id);
  const { data: jobs } = await jobsQuery;

  const jobIds = (jobs ?? []).map((j) => j.id);
  const applicationCountByJob = new Map<string, number>();
  let totalApplications = 0;
  if (jobIds.length > 0) {
    const { data: appRows } = await admin
      .from("applications")
      .select("job_id")
      .in("job_id", jobIds);
    for (const a of appRows ?? []) {
      applicationCountByJob.set(
        a.job_id,
        (applicationCountByJob.get(a.job_id) ?? 0) + 1,
      );
      totalApplications += 1;
    }
  }

  // 代理メッセージの有無（法人のみ）
  let hasProxyThreads = false;
  if (orgId) {
    const { data: proxyRows } = await admin
      .from("admin_proxy_threads")
      .select("thread_id")
      .eq("organization_id", orgId)
      .limit(1);
    hasProxyThreads = (proxyRows ?? []).length > 0;
  }

  const showWorkplaceVideo =
    hasWorkplaceVideoOption && !!profile?.workplace_video_url && !isDeleted;

  const snsLabels = SNS_ITEMS.filter(
    (s) => profile?.[s.key as keyof typeof profile],
  ).map((s) => s.label);

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        発注者 アカウント詳細
      </h1>

      {isDeleted && (
        <div className="mt-4 rounded-[8px] bg-muted p-4">
          <p className="text-center text-body-md font-bold text-muted-foreground">
            このアカウントは退会済みです
          </p>
        </div>
      )}

      {/* 1. 内部管理者のメモ（編集ボタンはメモ欄の直下に置き、メモ専用の編集だと分かるようにする） */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">
          内部管理者のメモ
        </h2>
        <div className="mt-2 min-h-20 whitespace-pre-wrap rounded-[8px] border border-border bg-background p-4 text-body-md text-foreground">
          {profile?.admin_memo || (
            <span className="text-muted-foreground">メモはありません</span>
          )}
        </div>
        {!isDeleted && (
          <div className="mt-2 flex justify-end">
            <Button
              asChild
              className="rounded-full bg-primary text-white hover:bg-primary/90"
            >
              <Link href={`/admin/clients/${id}/edit`}>メモを編集する</Link>
            </Button>
          </div>
        )}
      </section>

      {/* 3. オプション加入状況 */}
      <section className="mt-6 space-y-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`flex h-5 w-5 items-center justify-center rounded border text-body-xs ${
              urgentCount > 0
                ? "border-primary bg-primary text-white"
                : "border-border bg-background"
            }`}
          >
            {urgentCount > 0 ? "✓" : ""}
          </span>
          <span className="text-body-md font-bold text-foreground">
            急募オプション
          </span>
          {urgentCount > 1 && (
            <span className="text-body-sm text-muted-foreground">
              （{urgentCount}件）
            </span>
          )}
        </div>
        {urgentMaxEnd && (
          <p className="pl-7 text-body-sm text-muted-foreground">
            {formatDateTime(urgentMaxEnd)}まで
          </p>
        )}
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`flex h-5 w-5 items-center justify-center rounded border text-body-xs ${
              hasWorkplaceVideoOption
                ? "border-primary bg-primary text-white"
                : "border-border bg-background"
            }`}
          >
            {hasWorkplaceVideoOption ? "✓" : ""}
          </span>
          <span className="text-body-md font-bold text-foreground">
            職場紹介動画掲載
          </span>
        </div>
      </section>

      {/* 4. 発注者情報（ここから受注者に見える発注者情報。運営の管理情報＝メモ／オプションと間隔を空ける） */}
      <section className="mt-16">
        <h2 className="text-body-lg font-bold text-foreground">発注者情報</h2>
        <div className="mt-3 flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
            {(profile?.image_url ?? target.avatar_url) && !isDeleted ? (
              <img
                src={(profile?.image_url ?? target.avatar_url)!}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <img
                  src="/images/icons/icon-avatar.png"
                  alt=""
                  className="h-8 w-8 opacity-40"
                />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-heading-md font-bold text-foreground">
              {displayName}
            </p>
            {profile?.address && (
              <p className="text-body-sm text-muted-foreground">
                {profile.address}
              </p>
            )}
            <p className="text-body-sm text-muted-foreground">
              プラン: {planLabel ?? "—"}
            </p>
          </div>
        </div>
      </section>

      {/* 5. 職場紹介動画（active video_workplace のみ） */}
      {showWorkplaceVideo && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">
            職場紹介動画
          </h2>
          <div className="mt-2 rounded-[8px] border border-border/10 bg-background p-4">
            <VideoEmbed
              url={profile!.workplace_video_url!}
              label="職場紹介動画"
            />
          </div>
        </section>
      )}
      {hasWorkplaceVideoOption && !isDeleted && (
        <div className="mt-3 flex justify-end">
          <Button
            asChild
            className="rounded-full bg-primary text-white hover:bg-primary/90"
          >
            <Link href={`/admin/users/${id}/workplace-video`}>
              職場紹介動画を投稿/編集する
            </Link>
          </Button>
        </div>
      )}

      {/* 6. 基本情報 */}
      <section className="mt-8">
        <h2 className="text-body-lg font-bold text-foreground">基本情報</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow
            label="募集職種"
            value={
              profile?.recruit_job_types && profile.recruit_job_types.length > 0 ? (
                <CollapsibleList
                  items={profile.recruit_job_types}
                  initialLimit={5}
                />
              ) : null
            }
          />
          <DetailRow
            label="募集エリア"
            value={
              recruitAreas.length > 0 ? <AreaList areas={recruitAreas} /> : null
            }
          />
          <DetailRow
            label="従業員規模"
            value={profile?.employee_scale ? `${profile.employee_scale}名` : null}
          />
          <DetailRow
            label="求める働き方"
            value={(profile?.working_way ?? []).join("、") || null}
          />
          <DetailRow
            label="言語"
            value={(profile?.language ?? []).join("、") || null}
          />
          <DetailRow label="利用SNS" value={snsLabels.join("、") || null} />
        </div>
      </section>

      {/* 7. メッセージ（閲覧専用） */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">メッセージ</h2>
        <div className="mt-2 min-h-16 whitespace-pre-wrap rounded-[8px] border border-border bg-background p-4 text-body-md text-foreground">
          {profile?.message || (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </section>

      {/* 8. 評判 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">評判</h2>
        <div className="mt-2 rounded-[8px] border border-border bg-background p-4">
          <p className="flex items-center gap-3 text-body-md text-foreground">
            ・また仕事を受けたい
            <span className="flex items-center gap-1 font-bold">
              <ThumbsUp className="h-4 w-4 text-primary/70" aria-hidden />
              {reputation.goodCount}／{reputation.total}件
            </span>
          </p>
        </div>
      </section>

      {/* 9. 担当者一覧（法人のみ） */}
      {orgId && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">担当者情報</h2>
          <div className="mt-2">
            <MemberList members={memberRows} />
          </div>
        </section>
      )}

      {/* 10. 募集現場一覧＋集計 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">募集現場一覧</h2>
        <p className="mt-1 text-body-sm text-muted-foreground">
          案件数 {jobIds.length}件・応募数 {totalApplications}件
        </p>
        <div className="mt-2">
          <JobSiteList
            jobs={(jobs ?? []).map((job) => ({
              id: job.id,
              title: job.title,
              statusLabel: JOB_STATUS_LABELS[job.status] ?? job.status,
              applicationCount: applicationCountByJob.get(job.id) ?? 0,
            }))}
            backToValue={backToForChildren}
          />
        </div>
      </section>

      {/* 11. 代理メッセージを見る（法人かつ代理スレッドあり） */}
      {orgId && hasProxyThreads && (
        <div className="mt-6">
          <Button
            asChild
            variant="outline"
            className="rounded-full border-primary text-primary hover:bg-primary/5 hover:text-primary"
          >
            <Link
              href={`/admin/messages?organizationId=${orgId}&backTo=${encodeURIComponent(backToForChildren)}`}
            >
              代理メッセージを見る
            </Link>
          </Button>
        </div>
      )}

      {/* 12. アカウントを削除する（退会済みは非表示） */}
      {!isDeleted && (
        <div className="mt-10 flex justify-end">
          <DeleteAccountButton userId={id} hasOrganization={!!orgId} />
        </div>
      )}

      {/* 13. もどる（backTo 優先。無ければ一覧へ。
          ADM-005 保存 redirect 経由の履歴ループ防止のため hardcoded ではなく
          明示的なフォールバックパスを使う） */}
      <div className="mt-8 flex flex-col items-center">
        <Button asChild variant="outline" className="w-full max-w-xs rounded-full">
          <Link href={backTo ?? "/admin/clients"}>もどる</Link>
        </Button>
      </div>
    </div>
  );
}
